// ReviewerAgent — 章节审查 Agent（参考 webnovel-writer reviewer.md）
// 六维审查 + AI 味检测，输出结构化问题清单
const BaseAgent = require('./baseAgent');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('reviewer-agent');

class ReviewerAgent extends BaseAgent {
  /**
   * 审查章节
   * @param {Object} params
   * @param {string} params.chapterContent - 正文内容
   * @param {number} params.chapterNumber - 章节号
   * @param {Object} params.novel - 小说信息 { title, genre, setting, theme, tone }
   * @param {Array} params.characters - 角色列表（含状态）
   * @param {Object} params.chapterOutline - 本章大纲
   * @param {Array} params.previousSummaries - 前文摘要
   * @param {string} params.previousChapterEnding - 上一章结尾内容（用于钩子承接检查）
   * @param {Object} params.writingRules - 用户自定义规则（可选）
   * @param {string} params.mode - 审查模式：'full'(默认) / 'fast'(仅setting/timeline/continuity) / 'minimal'(跳过)
   * @param {Function} onProgress - 进度回调
   * @returns {Object} { issues: [], summary: string }
   */
  async reviewChapter(params, onProgress) {
    const {
      chapterContent,
      chapterNumber,
      novel = {},
      characters = [],
      chapterOutline = null,
      previousSummaries = [],
      previousChapterEnding = '',
      writingRules = null,
      mode = 'full',
    } = params;

    if (mode === 'minimal') {
      return { issues: [], summary: 'minimal 模式：跳过审查' };
    }

    if (!chapterContent || chapterContent.trim().length === 0) {
      return {
        issues: [{
          severity: 'critical',
          category: 'continuity',
          location: '全文',
          description: '正文为空',
          evidence: '章节内容为空字符串',
          fix_hint: '重新生成章节内容',
          blocking: true,
        }],
        summary: '1个问题：1个阻断',
      };
    }

    if (onProgress) {
      onProgress('progress', { step: 'review', message: `正在审查第${chapterNumber}章...` });
    }

    const systemPrompt = this._buildReviewSystemPrompt(mode);
    const userPrompt = this._buildReviewUserPrompt({
      chapterContent, chapterNumber, novel, characters, chapterOutline,
      previousSummaries, previousChapterEnding, writingRules, mode,
    });

    // 审查不向用户流式输出 JSON，仅发送进度事件
    const reviewOnChunk = (delta) => {
      if (onProgress) {
        // delta 为非字符串时是进度事件，转发；字符串 chunk 不发给用户
        if (typeof delta !== 'string') onProgress(delta);
      }
    };

    let { content } = await this.callLLMStream(
      systemPrompt,
      userPrompt,
      0.2, // 低温度确保审查稳定
      reviewOnChunk,
      'review'
    );

    let result = this.parseJSONWithSchema(content, ['issues', 'summary'], {
      issues: [],
      summary: '审查结果解析失败',
    });

    // 解析失败时重试一次，用更强烈的 JSON 格式要求
    if (result._parseError || result._missingFields) {
      logger.warn({
        chapterNumber,
        contentLength: (content || '').length,
        missingFields: result._missingFields || [],
      }, '审查 JSON 初次解析失败');
      if (onProgress) {
        onProgress('progress', { message: '审查结果格式异常，正在重新解析...' });
      }

      const retryPrompt = `你上次输出的审查结果格式有误（${result._parseError ? '无法解析为JSON' : '缺少字段：' + result._missingFields.join(', ')}），请严格按照以下 JSON Schema 重新输出审查结果。只输出 JSON，不要任何其他文字：\n\n\`\`\`json\n{\n  "issues": [...],\n  "summary": "N个问题：X个阻断，Y个高优"\n}\n\`\`\``;

      const retryResult = await this.callLLM(
        retryPrompt,
        `原始正文内容（前4000字）：\n${(params.chapterContent || '').substring(0, 4000)}`,
        0.1,
        'review'
      );

      const retryParsed = this.parseJSONWithSchema(retryResult.content, ['issues', 'summary']);
      if (!retryParsed._parseError && !retryParsed._missingFields) {
        result = retryParsed;
      } else {
        logger.error({ chapterNumber, contentLength: (content || '').length }, '审查 JSON 重试仍失败，使用空结果');
      }
    }

    // 使用 review_complete 事件，避免被外部回调过滤器拦截
    if (onProgress) {
      onProgress('review_complete', {
        issues: result.issues || [],
        summary: result.summary || '',
        blockingCount: (result.issues || []).filter(i => i.blocking).length,
      });
    }

    return {
      issues: result.issues || [],
      summary: result.summary || '',
    };
  }

  _buildReviewSystemPrompt(mode) {
    const basePrompt = `你是章节审查员。你的职责是读完正文后，找出所有可验证的问题，输出结构化问题清单。

【核心原则】
- 不评分、不给总体评价、不评价文笔好坏
- 不建议情节改动（"这里应该加个反转"不是你要说的话）
- 只报可验证的问题——每个问题必须有 evidence（原文引用或数据对比）
- "感觉不太对"不是问题，"角色的行为和已建立的性格矛盾"才是

${mode === 'fast' ? '【快速模式】只检查：设定一致性、时间线、叙事连贯性。跳过角色/逻辑/AI味。' : ''}

【禁止】
- 禁止输出 overall_score、pass/fail 等评分
- 禁止说"写得不错"之类的主观评价
- 禁止暴露未发生的剧情（不要引用大纲内容说"这里应该XXX"）

【输出格式】严格按以下 JSON 输出（不要其他文字）：

\`\`\`json
{
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "category": "continuity|setting|character|timeline|ai_flavor|logic",
      "location": "段落位置描述",
      "description": "问题描述",
      "evidence": "原文引用 vs 数据记录",
      "fix_hint": "修复方向",
      "blocking": true/false
    }
  ],
  "summary": "N个问题：X个阻断，Y个高优"
}
\`\`\`

severity 分级：
- critical：确定的事实矛盾（如角色能力超出设定、时间回跳无解释）
- high：大概率是问题（如对话标签化严重、上章钩子未回应）
- medium：可能影响阅读体验（如节奏过匀、个别句式重复）
- low：可优化的细节（如个别用词重复）
- blocking=true 仅用于 critical 或有明确阻断理由的 high`;

    return basePrompt;
  }

  _buildReviewUserPrompt(params) {
    const {
      chapterContent, chapterNumber, novel, characters, chapterOutline,
      previousSummaries, previousChapterEnding, writingRules, mode,
    } = params;

    const parts = [];

    parts.push(`===== 待审查正文（第${chapterNumber}章） =====`);
    // 如果正文太长，只取前 8000 字（节省 token，大部分问题在前半部分就能发现）
    parts.push(chapterContent.length > 8000 ? chapterContent.substring(0, 8000) + '\n...[正文过长已截断]' : chapterContent);

    parts.push('\n===== 小说设定 =====');
    parts.push(`书名：${novel.title || '未设定'}`);
    parts.push(`类型：${novel.genre || '未设定'}`);
    parts.push(`基调：${novel.tone || '未设定'}`);
    if (novel.setting) parts.push(`世界观：${novel.setting}`);
    if (novel.theme) parts.push(`主题：${novel.theme}`);

    if (characters.length > 0) {
      parts.push('\n===== 角色档案（用于校验角色一致性） =====');
      characters.forEach(c => {
        parts.push(`【${c.name}】角色：${c.role || '未知'} | 性格：${c.personality || '未知'} | 说话特点：${c.speechPattern || '未知'}`);
      });
    }

    if (chapterOutline) {
      parts.push('\n===== 本章大纲（用于校验设定一致性，不要暴露大纲内容） =====');
      parts.push(JSON.stringify(chapterOutline, null, 2));
    }

    if (previousSummaries.length > 0) {
      parts.push('\n===== 前文摘要（用于校验连贯性） =====');
      previousSummaries.slice(-3).forEach(s => {
        parts.push(`第${s.chapter}章：${s.summary}`);
      });
    }

    if (previousChapterEnding) {
      parts.push('\n===== 上一章结尾（检查钩子是否承接） =====');
      parts.push(previousChapterEnding.substring(Math.max(0, previousChapterEnding.length - 500)));
    }

    if (writingRules) {
      parts.push('\n===== 用户写作规则 =====');
      parts.push(typeof writingRules === 'string' ? writingRules : JSON.stringify(writingRules));
    }

    parts.push('\n===== 审查维度 =====');

    if (mode === 'fast') {
      parts.push(`1. 设定一致性 — 角色能力是否与设定一致，地点世界观是否一致
2. 时间线 — 与上章衔接是否无缝，倒计时是否推进
3. 叙事连贯 — 上章钩子是否回应，场景转换是否有过渡，情绪弧是否连续`);
    } else {
      parts.push(`1. 设定一致性 (setting) — 角色能力是否与境界匹配、地点描述是否与世界观一致、物品/货币使用是否符合已建立规则
2. 时间线 (timeline) — 与上章衔接是否正确、是否有时间回跳、倒计时/截止日期是否正确推进
3. 叙事连贯 (continuity) — 上章钩子是否有回应、场景转换是否有过渡、情绪弧是否连续（不能上章愤怒本章突然平静无过渡）
4. 角色一致性 (character) — 对话风格是否符合角色特征、行为是否与已建立的性格/动机一致、角色是否使用了不应知道的信息
5. 逻辑 (logic) — 因果关系是否成立、角色决策是否有合理动机、战斗/冲突结果是否符合已建立的力量对比
6. AI味 (ai_flavor) — 从5个子维度检查：
   a. 词汇层：是否有高频AI词汇密集出现（缓缓/淡淡/微微+"眸中闪过""瞳孔微缩"等模板）
   b. 句式层：是否有"起因→经过→结果→感悟"四段闭环、连续同构句（≥3句主谓宾一致）、每段以总结句收尾（"他终于明白了""由此可见"）
   c. 叙事层：节奏是否过于匀速无明显快慢、是否有"他不知道的是""殊不知"等戏剧反讽提示、章末是否"安全着陆"（冲突完美解决无遗留）、是否有展示后紧跟解释
   d. 情感层：情绪是否标签化（"他感到愤怒""她非常紧张"）、是否所有角色用同一套反应模板
   e. 对话层：对话是否为信息宣讲（解释背景而非推进冲突）、是否全员书面语无个人特色、对白后是否跟解释性叙述`);
    }

    parts.push('\n请按以上维度逐一审查，输出 JSON 问题清单。如果没有发现某类问题，就不要编造。');

    return parts.join('\n');
  }
}

module.exports = ReviewerAgent;
