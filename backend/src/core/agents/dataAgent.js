// DataAgent — 从正文提取结构化事实（参考 webnovel-writer data-agent.md）
// 产出：实体/状态变更/事件/场景/摘要，不直接写数据库
const BaseAgent = require('./baseAgent');

class DataAgent extends BaseAgent {
  /**
   * 从章节正文提取结构化数据
   * @param {Object} params
   * @param {string} params.chapterContent - 正文内容
   * @param {number} params.chapterNumber - 章节号
   * @param {Array} params.knownEntities - 已知实体列表 [{ id, name, type }]
   * @param {Array} params.characters - 角色列表（含当前状态）
   * @param {Function} onProgress - 进度回调
   * @returns {Object} extractionResult
   */
  async extractChapterData(params, onProgress) {
    const {
      chapterContent,
      chapterNumber,
      knownEntities = [],
      characters = [],
    } = params;

    if (!chapterContent || chapterContent.trim().length === 0) {
      if (onProgress) onProgress('error', { message: '正文为空，跳过数据提取' });
      return this._emptyResult(chapterNumber);
    }

    if (onProgress) {
      onProgress('progress', { step: 'extract', message: `正在从第${chapterNumber}章提取结构化数据...` });
    }

    const systemPrompt = `你是小说数据提取专家。你的任务是从章节正文中提取结构化信息，用于构建小说的知识图谱。

【提取原则】
- 只提取正文中明确出现的事实，不要推测
- 置信度 > 0.8 的自动采用，0.5-0.8 的采用但标记 warning，< 0.5 的标记待人工确认
- 新出场实体的 ID 用英文小写+下划线命名（如 hongyi_girl、black_market）
- 状态变更只记录有明确变化的字段

【字段命名硬性约定（必须严格遵守）】
- state_deltas 子项用 field (不是 field_path), new (不是 new_value), old (不是 old_value)
- entity_deltas 子项用 entity_type (不是 type), 值域：角色|组织|地点|物品|势力|概念
- accepted_events 每条必须含 event_id/chapter/event_type/subject/payload
- event_type 枚举：character_state_changed|power_breakthrough|relationship_changed|world_rule_revealed|open_loop_created|promise_paid_off|artifact_obtained

【输出格式】严格按以下 JSON 输出（不要其他文字）：

\`\`\`json
{
  "entities_appeared": [
    {
      "id": "已知实体的id或新实体的建议id",
      "name": "出场名称",
      "type": "角色|组织|地点|物品|势力",
      "mentions": ["文中提到的名称变体"],
      "is_new": true/false,
      "confidence": 0.95
    }
  ],
  "state_deltas": [
    {
      "entity_id": "实体id",
      "field": "字段名（如 realm, power.level, location.current）",
      "old": "旧值",
      "new": "新值",
      "evidence": "原文证据",
      "confidence": 0.9
    }
  ],
  "entity_deltas": [
    {
      "entity_id": "实体id",
      "action": "upsert",
      "entity_type": "角色|组织|地点|物品|势力",
      "tier": "核心|主要|次要|装饰",
      "payload": { "name": "名称", "description": "描述" },
      "confidence": 0.85
    }
  ],
  "accepted_events": [
    {
      "event_id": "evt-ch{chapter}-{序号}",
      "chapter": 章节号,
      "event_type": "事件类型枚举值",
      "subject": "主体entity_id",
      "payload": { /* 事件具体内容 */ },
      "confidence": 0.9
    }
  ],
  "scenes": [
    {
      "index": 1,
      "start_line": 大致起始行,
      "end_line": 大致结束行,
      "location": "场景地点",
      "summary": "50-100字场景摘要",
      "characters": ["出场的entity_id列表"]
    }
  ],
  "summary_text": "100-150字章节摘要，含钩子信息",
  "hook_type": "危机钩|悬念钩|情感钩|成长钩|反转钩|过渡",
  "hook_strength": "strong|medium|weak",
  "dominant_strand": "quest|fire|constellation"
}
\`\`\``;

    const userPrompt = this._buildExtractionPrompt(chapterContent, chapterNumber, knownEntities, characters);

    // 数据提取不向用户流式输出 JSON，仅发送进度事件
    const extractOnChunk = (delta) => {
      if (onProgress) {
        if (typeof delta !== 'string') onProgress(delta);
      }
    };

    const { content } = await this.callLLMStream(
      systemPrompt,
      userPrompt,
      0.15, // 极低温度确保提取准确
      extractOnChunk,
      'data_extraction'
    );

    const result = this.parseJSONWithSchema(content,
      ['entities_appeared', 'state_deltas', 'accepted_events', 'scenes', 'summary_text'],
      this._emptyResult(chapterNumber)
    );

    if (onProgress) {
      // 使用 extract_complete 事件，避免被外部回调过滤器拦截
      onProgress('extract_complete', {
        ...result,
        entityCount: (result.entities_appeared || []).length,
        deltaCount: (result.state_deltas || []).length,
        eventCount: (result.accepted_events || []).length,
        sceneCount: (result.scenes || []).length,
        hasSummary: !!result.summary_text,
      });
    }

    return result;
  }

  _buildExtractionPrompt(chapterContent, chapterNumber, knownEntities, characters) {
    const parts = [];

    parts.push(`===== 第${chapterNumber}章正文 =====`);
    // 取前 8000 字，大多数结构化信息在前半部分
    parts.push(chapterContent.length > 8000
      ? chapterContent.substring(0, 8000) + '\n...[正文过长已截断]'
      : chapterContent);

    if (knownEntities.length > 0) {
      parts.push('\n===== 已知实体（用于消歧匹配） =====');
      knownEntities.forEach(e => {
        parts.push(`- [${e.id}] ${e.name} (${e.type || '未知类型'})`);
      });
    }

    if (characters.length > 0) {
      parts.push('\n===== 当前角色状态（用于检测状态变更） =====');
      characters.forEach(c => {
        parts.push(`- [${c.name}] 角色：${c.role || '未知'} | 性格：${(c.personality || '').substring(0, 50)}`);
      });
    }

    parts.push(`\n请从以上正文中提取结构化数据。注意：
1. 如果某个数组没有内容，输出空数组 []
2. 如果实体名称和已知实体匹配，使用已知实体的 id
3. 新实体的 id 使用英文小写+下划线命名
4. summary_text 控制在 100-150 字
5. 每条 state_delta 必须有 evidence 原文引用`);

    return parts.join('\n');
  }

  _emptyResult(chapterNumber) {
    return {
      entities_appeared: [],
      state_deltas: [],
      entity_deltas: [],
      accepted_events: [],
      scenes: [],
      summary_text: '',
      hook_type: '',
      hook_strength: '',
      dominant_strand: '',
      chapter: chapterNumber,
      _empty: true,
    };
  }
}

module.exports = DataAgent;
