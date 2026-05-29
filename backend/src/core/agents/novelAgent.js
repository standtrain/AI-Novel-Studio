// NovelWritingAgent — 小说创作 Agent（继承 BaseAgent）
// 负责 4 个阶段：整书大纲 / 人物设定 / 章节大纲 / 逐章写作
const BaseAgent = require('./baseAgent');

// ========== Anti-AI 对抗提醒（翻译为自然口吻，不暴露系统术语） ==========
const ANTI_AI_REMINDER = [
  '删掉段末的感悟总结句——让场景自己说话，不要替读者下结论',
  '用具体动作替换万能副词（缓缓/淡淡/微微），每个动作都要有画面感',
  '情绪用生理反应和微动作来表达，禁止写"他感到愤怒""她非常紧张"这类标签化写法',
  '对话要有潜台词和意图冲突——加入抢话、沉默、答非所问，让每句话背后藏着另一层意思',
  '制造节奏的疏密对比，有的段落可以只有一句话，紧张用短句，舒缓用长句',
  '章末禁止"安全着陆"——留一个未解决的问题或不安感，让读者翻下一章',
  '展示完了就不要解释——相信读者能从动作和细节中读懂含义',
].join('；');

// ========== 写作铁律 ==========
const WRITING_IRON_RULES = [
  '大纲即法律——本章大纲中的情节节点必须覆盖，不得自行改剧情',
  '设定即物理——角色的能力不能超出已记录的水平，新能力必须有来源',
  '每章必须有推进——目标推进、代价付出、关系变化至少发生一项',
  '上章结尾的钩子本章必须回应，不得遗漏',
  '禁止占位正文——不能写"[此处需要补充XXX]"之类的占位符',
].join('。');

// ========== 章节写作结构要求 ==========
const CHAPTER_STRUCTURE = [
  '开篇引入（300-500字）：用精彩的场景描写或冲突对话抓住读者，建立本章的悬念和氛围',
  '场景展开之第一场景（600-800字）：详细展开第一个核心场景，包含环境描写、角色互动、情感铺垫',
  '场景展开之第二场景（600-800字）：展开第二个核心场景，推进冲突或展示转折，深化角色关系',
  '高潮段落（600-800字）：本章的核心冲突爆发或关键转折点，情绪张力达到顶点',
  '收尾与悬念（300-500字）：自然收束本章，留下吸引读者继续阅读的悬念或余韵',
  '补充描写的过渡段落（合计400-800字）：在场景之间加入过渡、内心独白、环境渲染等',
].join('\n');

// ========== 场景必需元素 ==========
const SCENE_ELEMENTS = [
  '30字以上的环境描写（五感中至少用2种）',
  '至少2轮对话，每轮对话有潜台词',
  '角色的内心活动或情感变化',
  '至少1个令人印象深刻的细节',
].join('；');

class NovelWritingAgent extends BaseAgent {
  // ========== 阶段1：整书大纲 ==========
  async generateBookOutline(userInput, onProgress) {
    if (onProgress) onProgress('progress', { step: 'outline', message: '正在生成整书大纲...' });

    const systemPrompt = this._enrichSystemPrompt(`你是一位资深小说策划人与文学顾问，拥有20年出版经验。请根据用户需求创作一份详尽的小说策划大纲。越详细越好，每个字段都要充分展开。

【重要】整书大纲阶段只需要规划整体框架，不要生成具体的章节内容。章节大纲将在下一个阶段单独生成。

你必须严格以 JSON 格式输出，结构如下：
{
  "title": "小说标题（有吸引力和记忆点）",
  "genre": "小说类型与子类型（如：科幻/赛博朋克/太空歌剧）",
  "synopsis": "故事梗概（300-500字）：完整概括故事起因、发展、高潮、结局，让读者一眼了解全书脉络",
  "setting": "世界观/背景设定（300-500字）：详细描述时代背景、社会环境、科技水平、地理风貌、文化特色、政治体制等",
  "theme": "核心主题（200-300字）：深入阐述小说探讨的核心命题，说明主题如何在剧情中层层递进展开",
  "tone": "整体基调（如：黑暗压抑中带着希望、轻松幽默、史诗悲壮等）",
  "targetAudience": "目标读者群体描述",
  "mainPlot": "主线剧情详细概述（500-800字）：从开端到结局的完整故事线，包括关键转折点、核心冲突的演变、主角的成长轨迹",
  "subPlots": ["支线剧情1的详细描述（100字以上）", "支线剧情2的详细描述（100字以上）"],
  "chapterCount": 章节数字（建议10-12章，每章有充分展开空间）
}

【禁止】不要输出 chapterOverview 字段！章节概览将在"章节大纲"阶段生成。`, 'outline');

    const { content, usage, model, provider, skipReasons } = await this.callLLMStream(
      systemPrompt,
      `请根据以下需求生成小说大纲：\n${userInput}`,
      0.7,
      (chunk) => onProgress && onProgress('chunk', { text: chunk }),
      'outline'
    );

    const outline = this.parseJSON(content, {
      title: '', genre: '', theme: '', setting: '', synopsis: '',
      tone: '', targetAudience: '', mainPlot: '', subPlots: [], chapterCount: 0,
    });

    this.ctx?.addHistory('outline', content);
    if (onProgress) onProgress('result', { outline, usage, model });

    return { outline, usage, model, provider, skipReasons };
  }

  // ========== 阶段2：人物设定 ==========
  async generateCharacterProfiles(outline, onProgress) {
    if (onProgress) onProgress('progress', { step: 'characters', message: '正在生成人物设定...' });

    const systemPrompt = this._enrichSystemPrompt(`你是一位资深人物设计师与小说家。请根据小说大纲创造深刻、立体、令人难忘的角色。每个角色都要有血有肉，越详细越好。

你必须严格以 JSON 格式输出，至少包含4-6个主要角色：
{
  "characters": [
    {
      "name": "角色姓名（有寓意或特色）",
      "age": 年龄数字,
      "gender": "性别",
      "role": "主角/配角/反派/导师/挚友/恋人等",
      "appearance": "外貌描写（150-200字）：身高体型、五官特征、发型发色、穿着风格、标志性特征、体态举止",
      "personality": "性格特点（200-300字）：核心性格特质、行为习惯、思维方式、情感表达方式、优点与缺点、内心矛盾",
      "background": "人物背景故事（300-500字）：家庭出身、成长经历、关键人生事件、创伤或成就、教育背景、职业经历",
      "motivation": "核心动机与目标（150-200字）：角色最渴望什么？驱动力来自何处？有哪些内在和外在的阻碍？",
      "arc": "人物成长弧线（200-300字）：从故事开始到结束角色经历了怎样的变化",
      "strengths": ["优点1", "优点2", "优点3"],
      "flaws": ["缺点1", "缺点2", "缺点3"],
      "quirks": ["口头禅或习惯性小动作", "独特癖好"],
      "speechPattern": "说话方式与语言特点（如：文绉绉/直率粗犷/喜欢用成语/沉默寡言等）",
      "innerConflict": "内心冲突（100-150字）：角色内心最大的挣扎是什么",
      "secrets": "隐藏的秘密（50-100字）：角色不为人知的秘密，可以成为剧情伏笔",
      "relationships": [
        {
          "with": "关联角色名",
          "type": "关系类型（父子/恋人/仇敌/师徒等）",
          "dynamic": "关系动态描述（100-150字）：如何相识、关系演变、核心矛盾或羁绊"
        }
      ]
    }
  ]
}`, 'characters');

    const userPrompt = `小说大纲如下：\n${JSON.stringify(outline, null, 2)}\n\n请基于此大纲设计角色。`;

    const { content, usage, model, provider, skipReasons } = await this.callLLMStream(
      systemPrompt, userPrompt, 0.7,
      (chunk) => onProgress && onProgress('chunk', { text: chunk }),
      'character'
    );

    const data = this.parseJSON(content);
    const characters = data?.characters || [];

    this.ctx?.saveCharacters(characters);
    this.ctx?.addHistory('characters', content);
    if (onProgress) onProgress('result', { characters, usage, model });

    return { characters, usage, model, provider, skipReasons };
  }

  // ========== 阶段3：逐章大纲（支持分段生成） ==========
  async generateChapterOutlines(outline, characters, onProgress, startChapter, endChapter) {
    const totalChapters = outline.chapterCount || 12;
    const from = startChapter || 1;
    const to = endChapter || totalChapters;
    const isBatch = from > 1 || to < totalChapters;
    const batchSize = to - from + 1;

    if (onProgress) {
      const msg = isBatch
        ? `正在生成第${from}-${to}章大纲（全书共${totalChapters}章）...`
        : '正在生成各章详细大纲...';
      onProgress('progress', { step: 'chapters_outline', message: msg });
    }

    const systemPrompt = this._enrichSystemPrompt(
      `${this._getGlobalContext()}\n你是一位小说结构与节奏大师。请为指定章节撰写极其详细的章节大纲，作为后续写作的蓝本。越详细越好。` +
      `\n\n【重要】你正在为一部共${totalChapters}章的长篇小说创作大纲。`, 'chapters_outline');

    let positionHint;
    if (totalChapters <= batchSize) {
      positionHint = `本次需要生成全书全部${totalChapters}章的大纲。请合理规划整部小说的起承转合，最后几章应为结局和高潮收尾。`;
    } else if (from === 1) {
      positionHint = `本次仅生成全书开头第${from}-${to}章（共${batchSize}章）。注意：这只是开头部分，全书还有大量后续章节。请只规划开头阶段的情节——建立世界观、引入主角和核心冲突、展开初始情节线。不要在这里设计故事的高潮或结局。每章的结尾钩子应为后续发展留出空间。`;
    } else if (to >= totalChapters) {
      positionHint = `本次仅生成全书结尾第${from}-${to}章（共${batchSize}章）。前面第1-${from - 1}章已经完成。请为故事设计合理的收尾——解决核心冲突、完成角色成长弧线、给出令人满意的结局。`;
    } else {
      positionHint = `本次仅生成全书中间第${from}-${to}章（共${batchSize}章）。前面第1-${from - 1}章已经完成，后面还有第${to + 1}章至第${totalChapters}章。请围绕中期情节展开——深化冲突、发展支线、推进角色关系。这不是结局阶段，请为后续发展持续铺垫。`;
    }

    const userPrompt = `小说整体大纲：\n${JSON.stringify(outline, null, 2)}\n\n角色设定：\n${JSON.stringify(characters, null, 2)}\n\n【全书共${totalChapters}章】${positionHint}\n\n请严格以 JSON 格式输出第${from}-${to}章的大纲：\n{\n  "chapters": [\n    {\n      "chapter": ${from},\n      "title": "章节标题（吸引读者）",\n      "synopsis": "本章详细梗概（200-300字）",\n      "scenes": [\n        { "number": 1, "location": "场景地点", "timeOfDay": "时间", "description": "场景详细描述（100-150字）" }\n      ],\n      "openingHook": "开篇钩子（50-80字）",\n      "conflict": "本章核心冲突（100-150字）",\n      "turningPoint": "关键转折点（100-150字）",\n      "characterDevelopment": {"角色名": "本章该角色的成长或变化（80-100字）"},\n      "subplotProgress": "支线推进情况（50-80字）",\n      "charactersInvolved": ["角色1", "角色2"],\n      "emotionalTone": "情感基调与情绪变化曲线",\n      "endingHook": "结尾悬念（50-80字）",\n      "foreshadowing": "本章埋下的伏笔（30-50字）"\n    }\n  ]\n}`;

    const { content, usage, model, provider, skipReasons } = await this.callLLMStream(
      systemPrompt, userPrompt, 0.6,
      (chunk) => onProgress && onProgress('chunk', { text: chunk }),
      'chapter_outline', null, 16384
    );

    const data = this.parseJSON(content);
    let chapters = data?.chapters || [];
    // 兜底：AI 可能返回单章对象而非 {chapters:[...]} 结构
    if (chapters.length === 0 && data && !data._parseError && data.chapter) {
      chapters = [data];
    }
    // 兜底：AI 可能直接返回数组 [{chapter:...}, ...] 而非 {chapters:[...]}
    if (chapters.length === 0 && Array.isArray(data)) {
      chapters = data;
    }

    // 解析失败时自动缩小批次重试（最多2轮：原批次 → 半批次）
    if (chapters.length === 0) {
      console.warn(`[章节大纲] JSON解析失败，原始内容前500字: ${(content || '').substring(0, 500)}`);
    }
    if (chapters.length === 0 && batchSize > 1) {
      const halfSize = Math.max(1, Math.floor(batchSize / 2));
      const halfEnd = Math.min(from + halfSize - 1, to);
      console.warn(`[章节大纲] 解析失败，缩小批次重试: ${from}-${to} → ${from}-${halfEnd}`);
      return this.generateChapterOutlines(outline, characters, onProgress, from, halfEnd);
    }

    this.ctx?.addHistory('chapterOutlines', content);
    if (onProgress) onProgress('result', { chapters, usage, model, batchStart: from, batchEnd: to });

    return { chapters, usage, model, provider, skipReasons };
  }

  // ========== 阶段4：逐章写作（由写作任务书驱动） ==========
  // writingBrief 参数可选——如果传入了 ContextAgent 生成的任务书，则只根据任务书起草
  async writeChapter(chapterOutline, chapterNumber, totalChapters, onProgress, writingBrief) {
    // 注：onProgress 由调用方包装为 (chunk) => sendSSE('chunk', { text: chunk })
    // 不在此处发送 progress/result 事件，避免事件名被误作为正文输出

    const previousSummary = this.ctx?.getPreviousChaptersSummary() || '（暂无之前的章节）';

    let systemPrompt, userPrompt;

    if (writingBrief) {
      // 有任务书时，只根据任务书起草，不接触原始材料
      systemPrompt = this._enrichSystemPrompt(
        `你是一位出版过多部畅销小说的中文文学大师。请根据下面的"写作任务书"创作高质量的小说正文。

【写作铁律】
${WRITING_IRON_RULES}

【创作提示】
${ANTI_AI_REMINDER}

【字数要求】本章总字数必须达到3500字以上。这是硬性指标。

【结构要求】按照以下结构分配字数：
${CHAPTER_STRUCTURE}

【场景要求】每个场景必须包含以下全部元素：
${SCENE_ELEMENTS}

【技巧要求】
- 善用修辞手法：比喻、拟人、排比、象征等
- 节奏变化：紧张用短句，舒缓用长句，营造张弛有度的阅读感
- 对话自然有潜台词，符合角色性格和语言特点
- 动作描写精准有画面感

本章末尾不要标注字数，后端会自动统计

写完后请自查：是否达到了3500字？场景是否都有环境描写？对话是否有潜台词？如果没有，请补充。

【禁止】不要在正文中输出任何"修改说明""此处添加了""已融入原文""替换说明"等内部参考信息。只输出纯正文。`, 'write_chapter');

      userPrompt = `前面章节摘要（保持故事连贯性）：\n${previousSummary}\n\n===== 写作任务书 =====\n${writingBrief}\n\n请根据以上任务书创作本章正文。只输出纯正文，像真正的作家直接交稿，不要包含任何元信息。`;
    } else {
      // 无任务书时使用原有的 prompt（向后兼容）
      systemPrompt = this._enrichSystemPrompt(
        `${this._getGlobalContext()}\n你是一位出版过多部畅销小说的中文文学大师。请根据章节大纲创作高质量的小说正文。

【写作铁律】
${WRITING_IRON_RULES}

【创作提示】
${ANTI_AI_REMINDER}

【字数要求】本章总字数必须达到3500字以上。这是硬性指标。

【结构要求】按照以下结构分配字数：
${CHAPTER_STRUCTURE}

【场景要求】每个场景必须包含以下全部元素：
${SCENE_ELEMENTS}

【技巧要求】
- 善用修辞手法：比喻、拟人、排比、象征等
- 节奏变化：紧张用短句，舒缓用长句
- 对话自然有潜台词，符合角色性格和语言特点
- 动作描写精准有画面感

本章末尾不要标注字数，后端会自动统计

写完后请自查：是否达到了3500字？场景是否都有环境描写？对话是否有潜台词？如果没有，请补充。

【禁止】不要在正文中输出任何"修改说明""此处添加了""已融入原文""替换说明"等内部参考信息。只输出纯正文。`, 'write_chapter');

      userPrompt = `前面章节摘要（保持故事连贯性）：\n${previousSummary}\n\n当前章节大纲：\n${JSON.stringify(chapterOutline, null, 2)}\n\n请创作本章正文内容。只输出纯正文，像真正的作家直接交稿，不要包含任何元信息。`;
    }

    const { content: chapterContent, usage: writeUsage, model, provider, skipReasons } = await this.callLLMStream(
      systemPrompt, userPrompt, 0.85,
      (chunk) => onProgress && onProgress('chunk', { text: chunk }),
      'writing'
    );

    // 生成本章摘要
    const summaryPrompt = '请用1-2句话概括以下章节的核心内容（50字以内），包含钩子类型：';
    const { content: summary } = await this.callLLM(
      summaryPrompt,
      chapterContent,
      0.3,
      'writing'
    );

    this.ctx?.addChapterSummary(chapterNumber, summary);

    return {
      chapter: {
        chapterNumber,
        title: chapterOutline.title,
        content: chapterContent,
        summary,
        wordCount: chapterContent.length,
      },
      usage: writeUsage,
      model,
      provider,
      skipReasons,
    };
  }
}

module.exports = NovelWritingAgent;
