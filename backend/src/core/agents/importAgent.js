const BaseAgent = require('./baseAgent');

// 章节边界检测的正则模式（优先级从高到低）
const CHAPTER_PATTERNS = [
  /第[零〇一二三四五六七八九十百千万\d]+[章節回集卷篇]\s*[：:\-—].*$/m,
  /^[=\-*]{2,}\s*第[零〇一二三四五六七八九十百千万\d]+[章節]\s*.*$/m,
  /^(?:Chapter|CH\.?)\s*\d+.*$/im,
  /^第[零〇一二三四五六七八九十百千万\d]+卷\s*第[零〇一二三四五六七八九十百千万\d]+[章節]/m,
];

// 最大分析文本长度
const MAX_TEXT_LENGTH = 50000;

// 默认全书总章数（100-200 范围）
const DEFAULT_TOTAL_CHAPTERS = 150;


class ImportAgent extends BaseAgent {
  constructor(contextManager, options = {}) {
    super(contextManager, options);
  }

  /**
   * 智能分析导入文本，分三阶段处理：
   * 1. 概览分析（大纲） 2. 角色提取 3. 章纲提取
   * 已提交的章节保留原文内容，推断章节仅生成大纲
   * @param {string} rawText - 原始文本
   * @param {function} onProgress - 进度回调 onProgress(event, data)
   * @returns {object} { novel, characters, chapters, warnings }
   */
  async analyzeImport(rawText, onProgress, instructions = '') {
    const text = rawText.length > MAX_TEXT_LENGTH
      ? rawText.substring(0, MAX_TEXT_LENGTH)
      : rawText;
    const warnings = [];
    this._instructions = instructions;

    if (text.length < 100) {
      throw Object.assign(new Error('文本内容过短，请至少提供100字以上的内容'), { status: 400 });
    }
    if (rawText.length > MAX_TEXT_LENGTH) {
      warnings.push(`文本过长，仅分析前${MAX_TEXT_LENGTH}字`);
    }

    // 预处理：检测章节边界
    const chapters = this._splitChapters(text);
    const isPartialImport = chapters.length <= 3;
    if (chapters.length === 0) {
      chapters.push({ chapter_number: 1, title: '第1章', text: text });
      warnings.push('未检测到章节标记，整体作为一章处理');
    }
    const minChapterNum = Math.min(...chapters.map(c => c.chapter_number));
    const hasPrecedingGap = minChapterNum > 1;
    if (isPartialImport && hasPrecedingGap) {
      warnings.push(`提交内容从第${minChapterNum}章开始，AI 将推断前面的章节大纲`);
    } else if (isPartialImport) {
      warnings.push('检测到少量章节');
    }

    // === 阶段1：概览分析 ===
    onProgress && onProgress('progress', { phase: 'overview', message: '正在分析小说概览...' });
    const overview = await this._analyzeOverview(text, chapters, isPartialImport);
    onProgress && onProgress('progress', { phase: 'overview', done: true, data: overview });

    // === 阶段2：角色提取 ===
    onProgress && onProgress('progress', { phase: 'characters', message: '正在提取角色信息...' });
    const characters = await this._extractCharacters(text, isPartialImport);
    onProgress && onProgress('progress', { phase: 'characters', done: true, data: characters });

    // === 阶段3：章纲提取（仅分析已提交的章节） ===
    const maxImportedChapter = Math.max(...chapters.map(c => c.chapter_number));
    const totalChapters = Math.max(overview.chapterCount || DEFAULT_TOTAL_CHAPTERS, maxImportedChapter);

    onProgress && onProgress('progress', {
      phase: 'chapters',
      message: `正在分析${chapters.length}个章节的大纲...`,
      total: chapters.length
    });
    const chapterOutlines = await this._extractChapterOutlines(chapters, overview, characters, (current, total) => {
      onProgress && onProgress('progress', { phase: 'chapters', current, total });
    });
    onProgress && onProgress('progress', { phase: 'chapters', done: true, data: chapterOutlines });

    if (totalChapters > maxImportedChapter) {
      warnings.push(`已分析${chapters.length}章内容，全书计划${totalChapters}章，后续章节可在工作台继续生成`);
    }

    // 构建已提交章节的内容 Map（保留原文，不生成新正文）
    const importedNumbers = new Set(chapters.map(c => c.chapter_number));
    const chapterContents = new Map();
    for (const ch of chapters) {
      chapterContents.set(ch.chapter_number, ch.text.trim());
    }

    // 组装结果
    const result = {
      novel: {
        title: overview.title || '',
        genre: overview.genre || '',
        theme: overview.theme || '',
        setting: overview.setting || '',
        main_plot: overview.main_plot || '',
        sub_plots: overview.sub_plots || [],
        chapterCount: totalChapters,
      },
      characters: characters.map(c => ({
        name: c.name || '未知',
        role: c.role || '配角',
        age: c.age || '',
        gender: c.gender || '未知',
        personality: c.personality || '',
        abilities: c.abilities || '',
        relationships: c.relationships || [],
        importance: c.importance || 'medium',
      })),
      chapters: chapterOutlines.map(ch => ({
        chapter_number: ch.chapter_number,
        title: ch.title || '',
        summary: ch.summary || '',
        key_events: ch.key_events || [],
        characters_involved: ch.characters_involved || [],
        hook: ch.hook || '',
        content: chapterContents.get(ch.chapter_number) || '',
      })),
      warnings,
    };

    return result;
  }

  // ========== 章节分割 ==========
  _splitChapters(text) {
    const chapters = [];
    const lines = text.split('\n');
    let currentChapter = null;
    let fallbackIndex = 1;

    for (const line of lines) {
      let matched = false;
      for (const pattern of CHAPTER_PATTERNS) {
        if (pattern.test(line)) {
          // 保存前一章
          if (currentChapter && currentChapter.text.trim()) {
            chapters.push(currentChapter);
          }
          const extractedNum = this._extractChapterNumber(line);
          currentChapter = {
            chapter_number: extractedNum || fallbackIndex,
            title: line.trim().substring(0, 200),
            text: line + '\n',
          };
          if (!extractedNum) fallbackIndex++;
          matched = true;
          break;
        }
      }
      if (!matched && currentChapter) {
        currentChapter.text += line + '\n';
      } else if (!matched && !currentChapter) {
        // 第一个章节标记出现之前的文本
        currentChapter = {
          chapter_number: fallbackIndex++,
          title: '第1章',
          text: line + '\n',
        };
      }
    }

    // 保存最后一章
    if (currentChapter && currentChapter.text.trim()) {
      chapters.push(currentChapter);
    }

    return chapters;
  }

  // 从章节标题中提取实际章节编号
  _extractChapterNumber(title) {
    // 中文数字映射
    const cnNumMap = { '零': 0, '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '百': 100, '千': 1000, '万': 10000 };

    // 尝试提取"第X章"格式中的数字
    const match = title.match(/第([\d零〇一二三四五六七八九十百千万]+)[章節回集卷篇]/);
    if (!match) return null;

    const numStr = match[1];

    // 阿拉伯数字
    if (/^\d+$/.test(numStr)) {
      return parseInt(numStr, 10);
    }

    // 中文数字转换
    let result = 0;
    let current = 0;
    for (const ch of numStr) {
      const val = cnNumMap[ch];
      if (val === undefined) continue;
      if (val >= 10) {
        if (current === 0) current = 1;
        if (val === 10000) {
          result = (result + current) * val;
          current = 0;
        } else {
          result += current * val;
          current = 0;
        }
      } else {
        current = val;
      }
    }
    return result + current || null;
  }

  // ========== 阶段1：概览分析 ==========
  async _analyzeOverview(text, chapters, isPartialImport) {
    const headText = text.substring(0, 3000);
    const chapterTitles = chapters.slice(0, 10).map(c => c.title).join('\n');
    const noChapterMarkers = chapters.length === 1 && chapters[0].title === '第1章';

    // 预处理：尝试从文本中提取书名
    const guessedTitle = this._guessTitle(text, chapters);

    const systemPrompt = `你是一位资深网文编辑，擅长快速分析小说内容并提取结构化信息。请严格按JSON格式输出。`;

    let partialHint = '';
    if (noChapterMarkers) {
      partialHint = `
【重要提示】用户提交了小说的开篇内容（未分章节），请将其作为第1章的内容来分析。
- 基于开篇内容的节奏、世界观复杂度和角色数量，推断全书预计章节数
- chapterCount 必须是100-200之间的整数（网文通常100-200章）`;
    } else if (isPartialImport) {
      partialHint = `
【重要提示】用户导入了小说的部分章节（第${chapters.map(c => c.chapter_number).join('、')}章）。
请基于已有内容分析小说的整体设定和风格：
- 主线剧情基于已有内容概括，无需延伸推测后续发展
- chapterCount 必须是100-200之间的整数（网文通常100-200章）`;
    }

    const titleHint = guessedTitle ? `\n【标题线索】从文本中检测到可能的标题：「${guessedTitle}」，请优先采用或参考。` : '';

    const userPrompt = `请分析以下中文网络小说的${isPartialImport || noChapterMarkers ? '部分内容' : '内容'}，提取基本信息：

【${noChapterMarkers ? '小说开篇内容' : isPartialImport ? '小说部分内容（第' + chapters.map(c => c.chapter_number).join('、') + '章）' : '小说内容'}】
${headText}

【章节标题列表】
${chapterTitles}
${titleHint}
${partialHint}
${this._instructions ? `\n【用户补充意见】\n${this._instructions}\n（请在分析时参考以上意见调整推断结果）\n` : ''}

请输出以下JSON（不要输出任何其他内容）：
{
  "title": "小说标题（基于文本内容推断，必须给出一个有意义的标题，禁止返回'未命名'）",
  "genre": "题材类型（玄幻/都市/科幻/仙侠/古言/悬疑/历史/游戏/轻小说/其他）",
  "theme": "核心主题，30-100字",
  "setting": "世界观背景描述，50-200字",
  "main_plot": "主线剧情概括，100-300字",
  "sub_plots": ["支线1", "支线2"],
  "tone": "叙事风格（热血/轻松/沉重/爽文/文艺/悬疑）",
  "target_audience": "目标读者（男频/女频/全年龄）",
  "chapterCount": ${noChapterMarkers || isPartialImport ? '推断的全书总章节数（100-200之间的整数）' : chapters.length}
}`;

    try {
      const { content } = await this.callLLM(systemPrompt, userPrompt, 0.3, 'import_analysis');
      const parsed = this.parseJSON(content, {});
      if (parsed._parseError) return guessedTitle ? { title: guessedTitle } : {};
      // 如果 AI 返回的标题为空或"未命名"，使用预提取的标题
      if ((!parsed.title || parsed.title === '未命名') && guessedTitle) {
        parsed.title = guessedTitle;
      }
      return parsed;
    } catch (err) {
      console.warn('[ImportAgent] 概览分析失败:', err.message);
      return guessedTitle ? { title: guessedTitle } : {};
    }
  }

  // 从文本中猜测书名
  _guessTitle(text, chapters) {
    // 策略1：查找"书名：XXX"或"《XXX》"格式
    const explicitTitle = text.match(/(?:书名|小说名|作品名)[：:]\s*(.+)/);
    if (explicitTitle) return explicitTitle[1].trim().substring(0, 50);

    const bookTitle = text.match(/《([^》]{2,30})》/);
    if (bookTitle) return bookTitle[1];

    // 策略2：第一章之前的独立行（非章节标记、非空行）很可能是书名
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // 跳过章节标记行
      if (/^第[零〇一二三四五六七八九十百千万\d]+[章節回集卷篇]/.test(trimmed)) break;
      if (/^(?:Chapter|CH\.?)\s*\d+/i.test(trimmed)) break;
      if (/^[=\-*]{2,}/.test(trimmed)) break;
      // 跳过明显的非标题内容
      if (trimmed.length > 30) continue;
      if (trimmed.length < 2) continue;
      // 看起来像标题的行
      if (trimmed.length <= 20 && !/[，。！？、；：]/.test(trimmed)) {
        return trimmed;
      }
    }

    // 策略3：使用第一个章节标题（去掉"第X章"前缀）作为书名参考
    if (chapters.length > 0) {
      const firstTitle = chapters[0].title;
      // 如果章节标题包含"第X章 XXX"，提取 XXX 部分
      const chapterNameMatch = firstTitle.match(/第[零〇一二三四五六七八九十百千万\d]+[章節回集卷篇]\s*[：:\-—]?\s*(.+)/);
      if (chapterNameMatch && chapterNameMatch[1].trim().length >= 2) {
        return chapterNameMatch[1].trim().substring(0, 30);
      }
    }

    return null;
  }

  // ========== 阶段2：角色提取 ==========
  async _extractCharacters(text, isPartialImport) {
    // 短文本直接使用全文，长文本采样
    const sampledText = text.length > 5000
      ? text.substring(0, 2000) + '\n...\n' + text.substring(Math.floor(text.length / 3), Math.floor(text.length / 3) + 1000) + '\n...\n' + text.substring(text.length - 1000)
      : text;

    const partialHint = isPartialImport ? `
【注意】这只是小说的前几章内容。请特别注意：
- 即使某些角色目前出场不多，但如果名字/称呼多次出现或在对话中被提及，也应提取
- 从角色的对话、描写、关系网中推断其在全书中的重要性
- 主角通常在开篇就有大量描写和内心独白` : '';

    const systemPrompt = `你是一位角色分析专家。请从小说文本中提取所有出场角色，按重要性排序。`;

    const userPrompt = `请分析以下小说文本，提取所有出场角色的信息：

${sampledText}
${partialHint}
${this._instructions ? `\n【用户补充意见】\n${this._instructions}\n（请在分析时参考以上意见）\n` : ''}

请输出以下JSON数组（不要输出任何其他内容）：
[
  {
    "name": "角色姓名/称呼",
    "role": "主角|女主|反派|核心配角|功能角色|路人",
    "age": "年龄（如'25岁'、'十七八岁'、'中年'等，如文本未提及则填''）",
    "gender": "性别（男/女/未知）",
    "personality": "性格特征描述，30-80字",
    "abilities": "能力/地位描述，如无则填''",
    "relationships": [{"with": "关联角色名", "type": "关系类型（师徒/父子/恋人/仇敌/朋友/...)"}],
    "importance": "high|medium|low"
  }
]

规则：
- 至少提取前6个最重要的角色
- 如果角色数量不足6个，列出所有你能识别的角色
- role字段：故事的核心推动者是"主角"，与主角有重要互动的女性角色是"女主"，与主角对立的角色是"反派"
- age字段：从文本中推断角色年龄，如"二十出头"、"三十多岁"、"老者"等；如确实无法推断则留空字符串''
- gender字段：从名字、称呼、描写中推断性别；如无法确定则填"未知"
- 无明确姓名但有明确称呼的角色也要提取（如"师父"、"黑衣人"）
- 关系类型使用中文描述`;

    try {
      const { content } = await this.callLLM(systemPrompt, userPrompt, 0.3, 'import_analysis');
      const parsed = this.parseJSON(content, []);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('[ImportAgent] 角色提取失败:', err.message);
      return [];
    }
  }

  // ========== 阶段3：章纲提取（仅分析已提交的章节） ==========
  async _extractChapterOutlines(chapters, overview, characters, onChapterProgress) {
    const outlines = [];

    // 为已导入的章节生成详细大纲
    const batchSize = 5;
    for (let i = 0; i < chapters.length; i += batchSize) {
      const batch = chapters.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(ch => this._analyzeSingleChapter(ch))
      );
      outlines.push(...batchResults);
      onChapterProgress && onChapterProgress(
        Math.min(i + batchSize, chapters.length),
        chapters.length
      );
    }

    // 按章节号排序
    outlines.sort((a, b) => a.chapter_number - b.chapter_number);
    return outlines;
  }

  // 从文本中提取关键事件（兜底）
  _extractKeyEvents(text) {
    const events = [];
    // 提取对话中的关键动作
    const actionPatterns = [
      /["""][^"""]*["""]\s*[，,]\s*(.{5,30}[。！？])/g,
      /(?:突然|忽然|猛然|顿时|此刻)(.{5,40}[。！？])/g,
    ];
    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null && events.length < 3) {
        const event = match[1] || match[0];
        if (event.length >= 5 && event.length <= 50) {
          events.push(event.trim());
        }
      }
    }
    // 如果还是空，取前两句作为关键事件
    if (events.length === 0) {
      const sentences = text.split(/[。！？]/).filter(s => s.trim().length >= 5);
      events.push(...sentences.slice(0, 2).map(s => s.trim().substring(0, 50)));
    }
    return events;
  }

  // 从文本中提取角色姓名（兜底）
  _extractCharacterNames(text) {
    const names = new Set();
    // 提取引号前的称呼（如"张默说"中的"张默"）
    const dialogPattern = /([一-龥]{1,4})\s*(?:说|道|喊|叫|问|答|笑|哼|叹|怒|惊|哭|低语|喃喃|大声|冷冷|淡淡|微笑)/g;
    let match;
    while ((match = dialogPattern.exec(text)) !== null && names.size < 8) {
      const name = match[1];
      if (name.length >= 2 && name.length <= 4 && !/^[的了是在有不人这中大为上个]/.test(name)) {
        names.add(name);
      }
    }
    return Array.from(names);
  }

  async _analyzeSingleChapter(chapter) {
    const text = chapter.text.length > 3000
      ? chapter.text.substring(0, 3000)
      : chapter.text;

    const systemPrompt = `你是一位小说章节分析专家。请从章节文本中提取结构化信息。`;

    const userPrompt = `请分析以下章节内容，生成章纲：

【章节】${chapter.title}
【内容】
${text}

请输出以下JSON（不要输出任何其他内容）：
{
  "chapter_number": ${chapter.chapter_number},
  "title": "${chapter.title.replace(/"/g, '\\"').substring(0, 100)}",
  "summary": "100-200字的章节内容摘要",
  "key_events": ["关键事件1", "关键事件2"],
  "characters_involved": ["出场角色1", "出场角色2"],
  "hook": "章尾钩子描述，如无则填''"
}

规则：
- key_events 必须从文本中提取至少2个关键情节点，不能为空数组
- characters_involved 必须列出所有出场角色姓名，不能为空数组
- 如文本中有对话，对话双方都算出场角色`;

    try {
      const { content } = await this.callLLM(systemPrompt, userPrompt, 0.2, 'import_analysis');
      const parsed = this.parseJSON(content, {
        chapter_number: chapter.chapter_number,
        title: chapter.title,
        summary: '',
        key_events: [],
        characters_involved: [],
        hook: '',
      });
      if (parsed._parseError) {
        return {
          chapter_number: chapter.chapter_number,
          title: chapter.title,
          summary: '（AI分析失败）',
          key_events: [],
          characters_involved: [],
          hook: '',
        };
      }
      // 兜底：如果 key_events 或 characters_involved 为空，从文本中提取
      if (!parsed.key_events || parsed.key_events.length === 0) {
        parsed.key_events = this._extractKeyEvents(text);
      }
      if (!parsed.characters_involved || parsed.characters_involved.length === 0) {
        parsed.characters_involved = this._extractCharacterNames(text);
      }
      return parsed;
    } catch (err) {
      console.warn(`[ImportAgent] 章纲分析失败(chapter ${chapter.chapter_number}):`, err.message);
      return {
        chapter_number: chapter.chapter_number,
        title: chapter.title,
        summary: '（AI分析失败）',
        key_events: [],
        characters_involved: [],
        hook: '',
      };
    }
  }
}

module.exports = ImportAgent;
