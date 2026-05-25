// 小说服务 - 处理所有小说相关的业务逻辑
const novelDao = require('../dao/novelDao');
const chapterDao = require('../dao/chapterDao');
const characterDao = require('../dao/characterDao');
const { safeUpdateNovel } = require('../utils/databaseHelper');
const { countWords } = require('../core/utils/wordCounter');

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
  async getNovelDetail(novelId, userId) {
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
      } catch { scenes = []; }
      try {
        characters_involved = ch.characters_involved ? JSON.parse(ch.characters_involved) : [];
      } catch { characters_involved = []; }
      return { ...ch, scenes, characters_involved };
    });

    return { ...novel, chapters: formattedChapters, characters };
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

    if (!charactersData.characters || !Array.isArray(charactersData.characters)) {
      throw { status: 400, message: '角色数据格式不正确' };
    }

    // 删除现有角色
    await characterDao.deleteByNovelId(novelId);

    // 创建新角色
    const characters = charactersData.characters.map(char => ({
      novel_id: novelId,
      name: char.name || '',
      age: (typeof char.age === 'number' && !isNaN(char.age)) ? char.age : null,
      gender: char.gender || '',
      role: char.role || '',
      appearance: char.appearance || '',
      personality: char.personality || '',
      background: char.background || '',
      motivation: char.motivation || '',
      arc: char.arc || '',
      relationships: JSON.stringify(char.relationships || []),
    }));

    if (characters.length > 0) {
      await characterDao.bulkCreate(characters);
    }

    // 更新小说状态
    await safeUpdateNovel(novelId, { current_step: 2, status: 'characters' });
    return this.getNovelDetail(novelId, userId);
  },

  // 保存章节大纲
  async saveChaptersOutline(novelId, userId, chaptersData) {
    await _getNovelOrThrow(novelId, userId);

    if (!chaptersData.chapters || !Array.isArray(chaptersData.chapters)) {
      throw { status: 400, message: '章节数据格式不正确' };
    }

    // 删除现有章节
    await chapterDao.deleteByNovelId(novelId);

    // 创建新章节
    const chapters = chaptersData.chapters.map(ch => ({
      novel_id: novelId,
      chapter_number: ch.chapter || ch.chapter_number,
      title: ch.title || `第${ch.chapter || ch.chapter_number}章`,
      scenes: JSON.stringify(ch.scenes || []),
      conflict: ch.conflict || '',
      turning_point: ch.turning_point || '',
      characters_involved: JSON.stringify(ch.charactersInvolved || []),
      emotional_tone: ch.emotionalTone || '',
      ending_hook: ch.endingHook || '',
      status: 'outline',
      word_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
    }));

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
      word_count: typeof contentData.content === 'string' ? countWords(contentData.content) : 0,
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