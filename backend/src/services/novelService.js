// 小说服务 - 处理所有小说相关的业务逻辑
const novelDao = require('../dao/novelDao');
const chapterDao = require('../dao/chapterDao');
const characterDao = require('../dao/characterDao');
const { safeUpdateNovel } = require('../utils/databaseHelper');
const { countWords } = require('../core/utils/wordCounter');
const { db } = require('../config/database');
const { createLogger } = require('../utils/logger');

const logger = createLogger('novel-service');

function pickFirst(source, keys, fallback = undefined) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null) {
      if (typeof value === 'string' && value.trim() === '') continue;
      return value;
    }
  }
  return fallback;
}

function toText(value, fallback = null, maxLength = null) {
  if (value === undefined || value === null) return fallback;
  const text = typeof value === 'string' ? value.trim() : String(value).trim();
  if (!text) return fallback;
  return maxLength ? text.substring(0, maxLength) : text;
}

function toPositiveInt(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number.parseInt(value, 10);
  return Number.isInteger(num) && num > 0 ? num : fallback;
}

function toNonNegativeInt(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number.parseInt(value, 10);
  return Number.isInteger(num) && num >= 0 ? num : fallback;
}

function normalizeArray(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (item === undefined || item === null) return null;
        if (typeof item === 'string') return item.trim() || null;
        return item;
      })
      .filter(item => item !== null);
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return normalizeArray(parsed);
    } catch {
      // 导入来源可能把数组字段写成普通文本，保留原文，避免静默丢数据。
    }
    const parts = text.split(/\r?\n|[;；]/).map(part => part.trim()).filter(Boolean);
    return parts.length > 1 ? parts : [text];
  }
  return [value];
}

function stringifyArray(value) {
  return JSON.stringify(normalizeArray(value));
}

function stringifyFlexible(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  return JSON.stringify(value);
}

function normalizeImportedCharacter(char, index) {
  const name = toText(char.name, null, 100);
  if (!name) {
    throw { status: 400, message: `第 ${index + 1} 个角色缺少名称` };
  }

  return {
    name,
    age: toPositiveInt(char.age),
    gender: toText(char.gender, null, 10),
    role: toText(char.role, null, 50),
    appearance: toText(char.appearance),
    personality: toText(char.personality),
    background: toText(pickFirst(char, ['background', 'abilities'])),
    motivation: toText(char.motivation),
    arc: toText(char.arc),
    relationships: stringifyArray(char.relationships),
  };
}

function normalizeImportedChapter(ch, index) {
  const chapterNumber = toPositiveInt(pickFirst(ch, ['chapter_number', 'chapter']));
  if (!chapterNumber) {
    throw { status: 400, message: `第 ${index + 1} 个章节缺少有效章节编号` };
  }

  const rawContent = pickFirst(ch, ['content'], '');
  const content = typeof rawContent === 'string'
    ? rawContent.trim()
    : rawContent
      ? JSON.stringify(rawContent)
      : '';
  const scenes = normalizeArray(pickFirst(ch, ['scenes', 'key_events', 'keyEvents']));
  const charactersInvolved = normalizeArray(pickFirst(ch, ['characters_involved', 'charactersInvolved']));
  const status = content
    ? 'completed'
    : (['outline', 'writing', 'completed'].includes(ch.status) ? ch.status : 'outline');

  return {
    chapter_number: chapterNumber,
    title: toText(ch.title, `第${chapterNumber}章`, 200),
    brief: toText(pickFirst(ch, ['brief', 'synopsis', 'summary']), null, 500),
    scenes: JSON.stringify(scenes),
    conflict: toText(ch.conflict, null, 500),
    turning_point: toText(pickFirst(ch, ['turning_point', 'turningPoint']), null, 500),
    characters_involved: JSON.stringify(charactersInvolved),
    emotional_tone: toText(pickFirst(ch, ['emotional_tone', 'emotionalTone']), null, 100),
    ending_hook: toText(pickFirst(ch, ['ending_hook', 'endingHook', 'hook']), null, 500),
    content: content || null,
    summary: toText(ch.summary, null, 255),
    status,
    word_count: toNonNegativeInt(pickFirst(ch, ['word_count', 'wordCount']), content ? countWords(content) : 0),
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function normalizeImportData(importData) {
  const novelMeta = importData.novel || {};
  const rawCharacters = Array.isArray(importData.characters) ? importData.characters : [];
  const rawChapters = Array.isArray(importData.chapters) ? importData.chapters : [];
  const characters = rawCharacters.map(normalizeImportedCharacter);
  const chapters = rawChapters.map(normalizeImportedChapter);

  const seenChapterNumbers = new Set();
  for (const chapter of chapters) {
    if (seenChapterNumbers.has(chapter.chapter_number)) {
      throw { status: 400, message: `导入数据包含重复的章节编号：第 ${chapter.chapter_number} 章` };
    }
    seenChapterNumbers.add(chapter.chapter_number);
  }

  const title = toText(pickFirst(novelMeta, ['title'], importData.title), null, 200);
  if (!title) {
    throw { status: 400, message: '导入数据缺少小说标题' };
  }

  const explicitChapterCount = toNonNegativeInt(
    pickFirst(novelMeta, ['chapter_count', 'chapterCount']),
    0
  );
  const maxChapterNumber = chapters.reduce((max, ch) => Math.max(max, ch.chapter_number), 0);
  const chapterCount = Math.max(explicitChapterCount, maxChapterNumber, chapters.length);
  const hasCharacters = characters.length > 0;
  const hasChapters = chapters.length > 0;
  const completedChapters = chapters.filter(ch => ch.status === 'completed').length;
  const hasContent = completedChapters > 0;
  const allImportedCompleted = hasChapters && completedChapters === chapters.length;
  const allPlannedCompleted = allImportedCompleted && chapterCount > 0 && completedChapters >= chapterCount;

  let currentStep = 1;
  let status = 'outline';
  if (hasCharacters) { currentStep = 2; status = 'characters'; }
  if (hasChapters) { currentStep = 3; status = 'chapters_outline'; }
  if (hasContent) { currentStep = 4; status = allPlannedCompleted ? 'completed' : 'writing'; }

  return {
    novel: {
      title,
      genre: toText(pickFirst(novelMeta, ['genre'], importData.genre), null, 100),
      theme: toText(novelMeta.theme),
      setting: stringifyFlexible(novelMeta.setting),
      main_plot: toText(pickFirst(novelMeta, ['main_plot', 'mainPlot'])),
      sub_plots: stringifyArray(pickFirst(novelMeta, ['sub_plots', 'subPlots'], [])),
      status,
      current_step: currentStep,
      chapter_count: chapterCount,
    },
    characters,
    chapters,
  };
}

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
        logger.warn({ err: e, chapterNumber: ch.chapter_number, field: 'scenes' }, '章节 JSON 字段解析失败');
        scenes = [];
      }
      try {
        characters_involved = ch.characters_involved ? JSON.parse(ch.characters_involved) : [];
      } catch (e) {
        logger.warn({ err: e, chapterNumber: ch.chapter_number, field: 'characters_involved' }, '章节 JSON 字段解析失败');
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

  // 导入小说（先归一化校验，再使用事务写入，避免半导入数据）
  async importNovel(userId, maxNovels, importData) {
    const count = await novelDao.countByUser(userId);
    if (count >= maxNovels) {
      throw { status: 403, message: `已达到最大小说数量限制（${maxNovels}本）` };
    }

    const normalized = normalizeImportData(importData);
    let id;

    await db.transaction(async (trx) => {
      const [createdId] = await trx('novels').insert({
        user_id: userId,
        ...normalized.novel,
      });
      id = createdId;

      if (normalized.characters.length > 0) {
        await trx('characters').insert(
          normalized.characters.map(char => ({
            novel_id: id,
            ...char,
          }))
        );
      }

      if (normalized.chapters.length > 0) {
        await trx('chapters').insert(
          normalized.chapters.map(chapter => ({
            novel_id: id,
            ...chapter,
          }))
        );
      }
    });

    return this.getNovelDetail(id, userId);
  },

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
