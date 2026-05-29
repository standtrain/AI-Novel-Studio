// ContextAgent — 写前组装 Agent
// 职责：加载上下文 → 生成五段写作任务书（参考 webnovel-writer context-agent.md）
const BaseAgent = require('./baseAgent');

class ContextAgent extends BaseAgent {
  /**
   * 生成写作任务书
   * @param {Object} params
   * @param {Object} params.novel - 小说整体信息 { title, genre, setting, theme, mainPlot, tone }
   * @param {Object} params.chapterOutline - 当前章节大纲
   * @param {number} params.chapterNumber - 章节号
   * @param {number} params.totalChapters - 全书总章数
   * @param {Array} params.characters - 角色列表
   * @param {Array} params.previousSummaries - 前文章节摘要 [{ chapter, summary }]
   * @param {Array} params.unresolvedHooks - 未解决的前文钩子（伏笔、悬念）
   * @param {Object} params.writingRules - 用户自定义写作规则（可选）
   * @param {Function} onProgress - 进度回调
   * @returns {string} 五段写作任务书（纯文本）
   */
  async generateWritingBrief(params, onProgress) {
    const {
      novel = {},
      chapterOutline,
      chapterNumber,
      totalChapters,
      characters = [],
      previousSummaries = [],
      unresolvedHooks = [],
      writingRules = null,
    } = params;

    if (onProgress) {
      onProgress('progress', { step: 'context', message: '正在组装写作任务书...' });
    }

    const systemPrompt = `你是一位经验丰富的小说策划编辑。你的任务是在写作开始前，为作者准备一份详尽实用的"写作任务书"。

你的工作方式：
1. 先梳理所有参考资料（大纲、角色、前文摘要、伏笔、规则），识别本章的重点和难点
2. 然后输出一份五段式的写作任务书

【数据优先级（高→低）】
用户写作规则 > 章节大纲原文 > 小说整体设定 > 角色设定 > 前文摘要

【三大铁律】
- 大纲即法律：章节大纲中的情节节点必须覆盖，不得自行改剧情
- 设定即物理：角色的能力不能超出已记录的水平
- 新实体需标记：本章新出场的角色/地点/物品需要在任务书中明确标注

【硬性约束】
- 每章必须有推进：目标推进、代价付出、关系变化至少发生一项
- 上章结尾的钩子必须在任务书中提醒接住
- 禁止生成占位正文

【写作技巧提醒（必须翻译为自然口吻，绝不暴露"规则""Anti-AI"等术语）】
${this._getStyleReminders()}

【输出格式】
严格按以下五段结构输出（纯文本，不要 JSON）：

### 1. 开篇委托
书名、章号、章节标题、本章一句话目标（这章要完成什么）

### 2. 这章的故事
- 前文摘要（与本章直接相关的内容，2-3句）
- 本章目标和核心阻力
- 必须覆盖的情节节点（按重要性排序）
- 本章禁区（不能写的内容）
- 跨章约束（前文埋下的必须在本章处理的伏笔或线索）

### 3. 这章的人物
每个出场角色写一段：
- 当前状态（位置、情绪、身体状况）
- 核心驱动力（本章最想要什么）
- 本章作用（推动剧情/提供信息/制造阻碍/情感支撑）
- 说话倾向（口头禅、语气特点、本章对话中要注意的细节）

### 4. 怎么写更顺
这是最关键的部分。用自然的口吻给出写作指导：
- 风格倾向（根据小说基调给出具体的写作建议）
- 节奏策略（本章是快节奏推进还是慢铺垫，哪里该紧哪里该松）
- 对话提醒（如果角色之间有重要对话，提醒对话的层次和潜台词方向）
- 写作技巧提醒（用自然的方式提醒避免套路化写法）

### 5. 收在哪里
- 结尾停在什么感觉（悬疑/温暖/悲壮/期待）
- 留什么未尽的问题（让读者翻下一章的理由）
- 和下一章的钩子关系

【禁止输出】
- 不要在任务书中出现"规则""Anti-AI""blocking_rules""system"等系统术语
- 不要输出文件路径或数据库字段名
- 不要写检查清单
- 不要评价大纲的好坏`;

    // 组装输入信息
    const contextInfo = this._buildContextInput({
      novel, chapterOutline, chapterNumber, totalChapters,
      characters, previousSummaries, unresolvedHooks, writingRules,
    });

    const { content: taskBrief } = await this.callLLMStream(
      systemPrompt,
      contextInfo,
      0.3, // 低温度确保任务书准确
      (chunk) => onProgress && onProgress('chunk', { text: chunk }),
      'context_assembly'
    );

    if (onProgress) {
      onProgress('result', { taskBrief });
    }

    return taskBrief;
  }

  // 组装输入上下文
  _buildContextInput(params) {
    const {
      novel, chapterOutline, chapterNumber, totalChapters,
      characters, previousSummaries, unresolvedHooks, writingRules,
    } = params;

    const parts = [];

    // 小说整体信息
    parts.push('===== 小说整体信息 =====');
    parts.push(`书名：${novel.title || '未命名'}`);
    parts.push(`类型：${novel.genre || '未设定'}`);
    parts.push(`基调：${novel.tone || '未设定'}`);
    if (novel.setting) parts.push(`世界观：${novel.setting}`);
    if (novel.theme) parts.push(`主题：${novel.theme}`);
    if (novel.mainPlot) parts.push(`主线剧情：${novel.mainPlot}`);

    // 当前章节大纲（数据权重最高）
    parts.push('\n===== 当前章节大纲（最高优先级） =====');
    parts.push(`这是全书第${chapterNumber}/${totalChapters}章`);
    parts.push(JSON.stringify(chapterOutline, null, 2));

    // 角色信息
    if (characters.length > 0) {
      parts.push('\n===== 角色信息 =====');
      characters.forEach(c => {
        parts.push(`\n【${c.name}】（${c.role || '未知角色'}）`);
        if (c.personality) parts.push(`性格：${c.personality}`);
        if (c.motivation) parts.push(`动机：${c.motivation}`);
        if (c.speechPattern) parts.push(`说话特点：${c.speechPattern}`);
        if (c.arc) parts.push(`成长弧线：${c.arc}`);
        if (c.background) parts.push(`背景：${c.background}`);
      });
    }

    // 前文摘要
    if (previousSummaries.length > 0) {
      parts.push('\n===== 前文摘要 =====');
      // 取最近 3 章
      const recent = previousSummaries.slice(-3);
      recent.forEach(s => {
        parts.push(`第${s.chapter}章：${s.summary}`);
      });
    }

    // 未解决的伏笔/钩子
    if (unresolvedHooks.length > 0) {
      parts.push('\n===== 需要在本章处理的前文钩子 =====');
      unresolvedHooks.forEach(h => {
        parts.push(`- [来自第${h.fromChapter}章] ${h.content}（紧急度：${h.urgency || '中'}）`);
      });
    }

    // 用户自定义写作规则
    if (writingRules) {
      parts.push('\n===== 用户写作规则（最高优先级） =====');
      parts.push(typeof writingRules === 'string' ? writingRules : JSON.stringify(writingRules, null, 2));
    }

    parts.push('\n请基于以上信息生成写作任务书。记住：章纲是最高优先级，用户规则覆盖一切。');
    return parts.join('\n');
  }

  // 写作技巧提醒（翻译为自然口吻，参考 context-agent.md 第 4 段）
  _getStyleReminders() {
    return [
      '删掉段末的感悟总结——让场景自己收尾，不要替读者下结论',
      '用具体的动作替代模糊的副词（不是"缓缓走来"，而是"他每走一步都停一停，鞋底在石板路上蹭出沙沙的声音"）',
      '情绪不要直接说，用身体反应来呈现——心跳加快、手心出汗、喉咙发紧，而不是"他很紧张"',
      '对话要有来有往有层次，每句话表面上说一件事，底下藏着另一层意思。有时沉默或答非所问比直接回答更有力',
      '段落的节奏要有变化，紧张的段落用短句连击，舒缓的段落可以放长句子慢慢展开',
      '本章最后一幕不要把所有问题都解决完，留一道缝隙让读者想钻进去',
      '描写细节而不是解释——让读者从角色的动作、眼神、对话中自己体会情绪和意图',
    ].join('；');
  }
}

module.exports = ContextAgent;
