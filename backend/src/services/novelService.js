// 小说服务 - 处理所有小说相关的业务逻辑
const novelDao = require('../dao/novelDao');
const chapterDao = require('../dao/chapterDao');
const characterDao = require('../dao/characterDao');
const { safeUpdateNovel } = require('../utils/databaseHelper');
const { countWords } = require('../core/utils/wordCounter');
const { db } = require('../config/database');

// 公共辅助：获取小说并校验所有权
async function _getNovelOrThrow(novelId, userId) {
  const novel = await novelDao.findById(novelId);
  if (!novel) {
    throw { status: 404, message: '小说不存在' };
  }
  if (novel.user_id !== userId) {
    throw { status: 403, message: '无权访问此小说' };
  }
  return novel;
}

const novelService = {
  // 列出用户的小说
  async listUserNovels(userId, { page, limit } = {}) {
    return novelDao.findByUser(userId, { page, limit });
  },

  // 获取小说详情
  async getNovelDetail(novelId, userId, { lightweight = false } = {}) {
    const novel = await _getNovelOrThrow(novelId, userId);
    const [chapters, characters] = await Promise.all([
      chapterDao.findByNovelId(novelId),
      characterDao.findByNovelId(novelId),
    ]);

    // 安全解析 JSON 字段
    const formattedChapters = chapters.map(ch => {
      let scenes = [];
      let characters_involved = [];
      try {
        scenes = ch.scenes ? JSON.parse(ch.scenes) : [];
      } catch (e) {
        console.error(`章节 ${ch.chapter_number} 的 scenes 字段 JSON 解析失败:`, String(e));
        scenes = [];
      }
      try {
        characters_involved = ch.characters_involved ? JSON.parse(ch.characters_involved) : [];
      } catch (e) {
        console.error(`章节 ${ch.chapter_number} 的 characters_involved 字段 JSON 解析失败:`, String(e));
        characters_involved = [];
      }
      const base = { ...ch, scenes, characters_involved };
      // 轻量模式：跳过大字段，减少传输量
      if (lightweight) {
        delete base.content;
        delete base.review_result;
        delete base.extraction_result;
      }
      return base;
    });

    return { ...novel, chapters: formattedChapters, characters };
  },

  // 获取单个章节完整内容（含审查/提取结果）
  async getChapterContent(novelId, userId, chapterNumber) {
    await _getNovelOrThrow(novelId, userId);
    const chapter = await chapterDao.findByNovelAndNumber(novelId, chapterNumber);
    if (!chapter) {
      throw { status: 404, message: '章节不存在' };
    }
    return chapter;
  },

  // 创建新小说
  async createNovel(userId, maxNovels, { title, genre }) {
    const count = await novelDao.countByUser(userId);
    if (count >= maxNovels) {
      throw { status: 403, message: `已达到最大小说数量限制（${maxNovels}本）` };
    }
    const id = await novelDao.create({
      user_id: userId,
      title,
      genre: genre || null,
      status: 'draft',
      current_step: 0,
    });
    return novelDao.findById(id);
  },

  // 导入小说（完整数据包：novel + characters + chapters）
  async importNovel(userId, maxNovels, importData) {
    const count = await novelDao.countByUser(userId);
    if (count >= maxNovels) {
      throw { status: 403, message: `已达到最大小说数量限制（${maxNovels}本）` };
    }

    // 提取 novel 元数据（兼容扁平结构和嵌套 novel 对象）
    const novelMeta = importData.novel || {};
    const title = novelMeta.title || importData.title || '导入的小说';
    const genre = novelMeta.genre || importData.genre || null;
    const theme = novelMeta.theme || null;
    const setting = novelMeta.setting
      ? (typeof novelMeta.setting === 'object' ? JSON.stringify(novelMeta.setting) : String(novelMeta.setting))
      : null;
    const mainPlot = novelMeta.main_plot || null;
    const subPlots = novelMeta.sub_plots ? JSON.stringify(novelMeta.sub_plots) : '[]';

    // 提取角色和章节
    const characters = importData.characters || [];
    const chapters = importData.chapters || [];

    // 根据数据存在性自动推断 current_step 和 status
    const hasCharacters = characters.length > 0;
    const hasChapters = chapters.length > 0;
    const hasContent = hasChapters && chapters.some(c => c.content && c.content.trim().length > 0);
    const allCompleted = hasChapters && chapters.every(c => c.status === 'completed' || (c.content && c.content.trim().length > 0));

    let currentStep = 1;
    let status = 'outline';
    if (hasCharacters) { currentStep = 2; status = 'characters'; }
    if (hasChapters) { currentStep = 3; status = 'chapters_outline'; }
    if (hasContent) { currentStep = 4; status = allCompleted ? 'completed' : 'writing'; }

    // 创建 novel 记录
    const id = await novelDao.create({
      user_id: userId,
      title,
      genre,
      theme,
      setting,
      main_plot: mainPlot,
      sub_plots: subPlots,
      status,
      current_step: currentStep,
      chapter_count: hasChapters ? chapters.length : (novelMeta.chapter_count || 0),
    });

    // 导入角色
    if (hasCharacters) {
      const formattedCharacters = characters.map(char => ({
        novel_id: id,
        name: char.name || '',
        age: char.age ? String(char.age) : null,
        gender: char.gender || null,
        role: char.role || null,
        appearance: char.appearance || null,
        personality: char.personality || null,
        background: char.background || null,
        motivation: char.motivation || null,
        arc: char.arc || null,
        relationships: JSON.stringify(char.relationships || []),
      }));
      await characterDao.bulkCreate(formattedCharacters);
    }

    // 导入章节
    if (hasChapters) {
      // 校验无重复章节号
      const chapterNumbers = chapters.map(c => c.chapter_number);
      const uniqueNumbers = new Set(chapterNumbers);
      if (chapterNumbers.length !== uniqueNumbers.size) {
        throw { status: 400, message: '导入数据包含重复的章节编号' };
      }

      const formattedChapters = chapters.map(ch => ({
        novel_id: id,
        chapter_number: ch.chapter_number,
        title: ch.title || `第${ch.chapter_number}章`,
        brief: ch.brief || null,
        scenes: JSON.stringify(ch.scenes || []),
        conflict: ch.conflict || null,
        turning_point: ch.turning_point || null,
        characters_involved: JSON.stringify(ch.characters_involved || []),
        emotional_tone: ch.emotional_tone || null,
        ending_hook: ch.ending_hook || null,
        content: ch.content || null,
        summary: ch.summary || null,
        status: ch.content ? 'completed' : (ch.status || 'outline'),
        word_count: ch.word_count || (ch.content ? countWords(ch.content) : 0),
        created_at: new Date(),
        updated_at: new Date(),
      }));
      await chapterDao.bulkCreate(formattedChapters);
    }

    // 返回完整详情
    return this.getNovelDetail(id, userId);
  },

  // 更新小说信息
  async updateNovel(novelId, userId, data) {
    const novel = await _getNovelOrThrow(novelId, userId);

    // 使用安全更新方法
    const allowed = ['title', 'genre', 'theme'];
    const updateData = {};
    allowed.forEach(k => {
      if (data[k] !== undefined) updateData[k] = data[k];
    });

    await safeUpdateNovel(novelId, updateData);
    return novelDao.findById(novelId);
  },

  // 保存小说大纲
  async saveOutline(novelId, userId, outlineData) {
    await _getNovelOrThrow(novelId, userId);

    // 防御性处理：如果传入的是JSON字符串，尝试解析
    if (typeof outlineData === 'string') {
      try { outlineData = JSON.parse(outlineData); } catch { /* 非JSON则保持原样 */ }
    }
    if (!outlineData || typeof outlineData !== 'object') {
      throw { status: 400, message: '大纲数据格式不正确' };
    }

    const data = {
      title: outlineData.title || '',
      genre: outlineData.genre || '',
      theme: outlineData.theme || '',
      setting: outlineData.setting ? (typeof outlineData.setting === 'object'
        ? JSON.stringify(outlineData.setting)
        : String(outlineData.setting)) : '',
      // 兼容驼峰和蛇形命名
      main_plot: outlineData.main_plot || outlineData.mainPlot || '',
      sub_plots: JSON.stringify(outlineData.sub_plots || outlineData.subPlots || []),
      current_step: 1,
      status: 'outline',
      chapter_count: outlineData.chapter_count || outlineData.chapterCount || 0,
    };

    await safeUpdateNovel(novelId, data);
    return this.getNovelDetail(novelId, userId);
  },

  // 保存人物设定
  async saveCharacters(novelId, userId, charactersData) {
    await _getNovelOrThrow(novelId, userId);

    if (typeof charactersData === 'string') {
      try { charactersData = JSON.parse(charactersData); } catch { /* 非JSON则保持原样 */ }
    }
    if (!charactersData || !charactersData.characters || !Array.isArray(charactersData.characters)) {
      throw { status: 400, message: '角色数据格式不正确' };
    }

    // 格式化角色数据
    const characters = charactersData.characters.map(char => ({
      novel_id: novelId,
      name: char.name || '',
      age: char.age ? String(char.age) : null,
      gender: char.gender || '',
      role: char.role || '',
      appearance: char.appearance || '',
      personality: char.personality || '',
      background: char.background || '',
      motivation: char.motivation || '',
      arc: char.arc || '',
      relationships: JSON.stringify(char.relationships || []),
    }));

    // 在事务中执行：删除旧角色 + 插入新角色 + 更新小说状态
    await db.transaction(async (trx) => {
      await trx('characters').where('novel_id', novelId).del();
      if (characters.length > 0) {
        await trx('characters').insert(characters);
      }
      await trx('novels').where('id', novelId).update({ current_step: 2, status: 'characters' });
    });
    return this.getNovelDetail(novelId, userId);
  },

  // 保存章节大纲
  async saveChaptersOutline(novelId, userId, chaptersData) {
    await _getNovelOrThrow(novelId, userId);

    if (typeof chaptersData === 'string') {
      try { chaptersData = JSON.parse(chaptersData); } catch { /* 非JSON则保持原样 */ }
    }
    if (!chaptersData || !chaptersData.chapters || !Array.isArray(chaptersData.chapters)) {
      throw { status: 400, message: '章节数据格式不正确' };
    }

    // 校验每个章节必须有有效的 chapter_number
    for (let i = 0; i < chaptersData.chapters.length; i++) {
      const ch = chaptersData.chapters[i];
      const num = ch.chapter || ch.chapter_number;
      if (!num || num < 1) {
        throw { status: 400, message: `第${i + 1}个章节缺少有效的章节编号` };
      }
    }

    // 先收集需要保留的已有章节数据（正文、摘要等）
    const existingChapters = await chapterDao.findByNovelId(novelId);
    const existingMap = new Map();
    existingChapters.forEach(ch => existingMap.set(ch.chapter_number, ch));

    // 删除现有章节
    await chapterDao.deleteByNovelId(novelId);

    // 创建新章节
    const chapters = chaptersData.chapters.map(ch => {
      const num = ch.chapter || ch.chapter_number;
      const existing = existingMap.get(num);
      return {
        novel_id: novelId,
        chapter_number: num,
        title: ch.title || `第${num}章`,
        brief: ch.brief || ch.synopsis || null,
        scenes: JSON.stringify(ch.scenes || []),
        conflict: ch.conflict || '',
        turning_point: ch.turning_point || ch.turningPoint || '',
        characters_involved: JSON.stringify(ch.charactersInvolved || ch.characters_involved || []),
        emotional_tone: ch.emotionalTone || ch.emotional_tone || '',
        ending_hook: ch.endingHook || ch.ending_hook || '',
        // 保留已有的正文和摘要
        content: existing?.content || null,
        summary: existing?.summary || null,
        word_count: existing?.word_count || 0,
        status: existing?.content ? existing.status : 'outline',
        created_at: new Date(),
        updated_at: new Date(),
      };
    });

    if (chapters.length > 0) {
      await chapterDao.bulkCreate(chapters);
    }

    // 更新小说状态
    await safeUpdateNovel(novelId, {
      current_step: 3,
      status: 'chapters_outline',
      chapter_count: chapters.length
    });

    return this.getNovelDetail(novelId, userId);
  },

  // 保存章节内容
  async saveChapterContent(novelId, userId, chapterNumber, contentData) {
    await _getNovelOrThrow(novelId, userId);

    const chapterData = {
      novel_id: novelId,
      chapter_number: parseInt(chapterNumber),
      title: contentData.title || `第${chapterNumber}章`,
      content: typeof contentData.content === 'string' ? contentData.content : JSON.stringify(contentData.content),
      summary: contentData.summary || '',
      word_count: typeof contentData.content === 'string'
        ? countWords(contentData.content)
        : countWords(JSON.stringify(contentData.content)),
      status: 'completed',
    };

    await chapterDao.upsert(chapterData);

    // 检查是否所有章节都已完成
    const chapters = await chapterDao.findByNovelId(novelId);
    const completedChapters = chapters.filter(c => c.status === 'completed').length;

    if (completedChapters === chapters.length && chapters.length > 0) {
      await safeUpdateNovel(novelId, { current_step: 4, status: 'completed' });
    }

    return this.getNovelDetail(novelId, userId);
  },

  // 删除小说
  async deleteNovel(novelId, userId) {
    await _getNovelOrThrow(novelId, userId);
    await novelDao.remove(novelId);
    return { success: true };
  },

  // 获取小说字数统计
  async getNovelStats(novelId, userId) {
    const novel = await novelDao.findById(novelId);
    if (!novel || novel.user_id !== userId) {
      throw { status: 404, message: '小说不存在' };
    }
    const chapters = await chapterDao.findByNovelId(novelId);
    const totalWords = chapters.reduce((s, ch) => s + (ch.word_count || 0), 0);
    const completedChapters = chapters.filter(c => c.status === 'completed').length;
    return {
      totalChapters: chapters.length,
      completedChapters,
      totalWords,
      status: novel.status,
      currentStep: novel.current_step,
    };
  },
};

module.exports = novelService;