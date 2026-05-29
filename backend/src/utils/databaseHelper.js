// 数据库操作辅助工具 - 确保数据写入的正确性和一致性

const { db } = require('../config/database');

/**
 * 安全地更新小说数据，防止数据丢失
 */
async function safeUpdateNovel(novelId, data) {
  try {
    // 获取现有数据
    const existing = await db('novels').where('id', novelId).first();
    if (!existing) {
      throw new Error('小说不存在');
    }

    // 只更新允许的字段
    const allowedFields = [
      'title', 'genre', 'theme', 'setting', 'main_plot',
      'sub_plots', 'status', 'current_step', 'chapter_count',
      'context_data'
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        // 特殊处理 JSON 字段
        if (field === 'sub_plots' || field === 'context_data') {
          updateData[field] = typeof data[field] === 'string'
            ? data[field]
            : JSON.stringify(data[field] || null);
        } else {
          updateData[field] = data[field];
        }
      }
    }

    // 更新时间戳
    updateData.updated_at = new Date();

    const result = await db('novels').where('id', novelId).update(updateData);
    return result;
  } catch (error) {
    throw new Error(`更新小说失败: ${error.message}`);
  }
}

/**
 * 安全创建或更新章节内容
 */
async function safeUpsertChapter(data) {
  try {
    // 验证必要字段
    if (!data.novel_id || !data.chapter_number) {
      throw new Error('缺少必要字段：novel_id 和 chapter_number');
    }

    // 确保章节数字有效
    data.chapter_number = parseInt(data.chapter_number);
    if (isNaN(data.chapter_number) || data.chapter_number < 1) {
      throw new Error('章节数字必须大于0');
    }

    // 计算字数
    if (data.content) {
      data.word_count = data.content.length;
    } else {
      data.word_count = 0;
    }

    // 确保状态有效
    if (!data.status) {
      data.status = 'outline';
    }

    const existing = await db('chapters')
      .where({ novel_id: data.novel_id, chapter_number: data.chapter_number })
      .first();

    if (existing) {
      // 更新现有章节
      const updateFields = ['title', 'content', 'summary', 'word_count', 'status'];
      const updateData = {};

      updateFields.forEach(field => {
        if (data[field] !== undefined) {
          updateData[field] = data[field];
        }
      });

      // 更新时间戳
      updateData.updated_at = new Date();

      await db('chapters').where('id', existing.id).update(updateData);
      return existing.id;
    } else {
      // 创建新章节
      data.created_at = new Date();
      data.updated_at = new Date();

      const [id] = await db('chapters').insert(data);
      return id;
    }
  } catch (error) {
    throw new Error(`章节 upsert 失败: ${error.message}`);
  }
}

/**
 * 批量创建章节
 */
async function batchCreateChapters(novelId, chaptersData) {
  try {
    const chapters = chaptersData.map(ch => ({
      novel_id: novelId,
      chapter_number: ch.chapter || ch.chapter_number,
      title: ch.title || `第${ch.chapter || ch.chapter_number}章`,
      scenes: ch.scenes || [],
      conflict: ch.conflict,
      turning_point: ch.turning_point,
      characters_involved: ch.charactersInvolved || [],
      emotional_tone: ch.emotionalTone,
      ending_hook: ch.endingHook,
      status: 'outline',
      created_at: new Date(),
      updated_at: new Date(),
    }));

    const [ids] = await db('chapters').insert(chapters);
    return ids;
  } catch (error) {
    throw new Error(`批量创建章节失败: ${error.message}`);
  }
}

/**
 * 事务执行多个数据库操作
 */
async function transactionalOperations(operations) {
  const trx = await db.transaction();

  try {
    const results = [];
    for (const operation of operations) {
      const result = await trx.raw(operation.query, operation.params);
      results.push(result);
    }
    await trx.commit();
    return results;
  } catch (error) {
    await trx.rollback();
    throw new Error(`事务执行失败: ${error.message}`);
  }
}

module.exports = {
  safeUpdateNovel,
  safeUpsertChapter,
  batchCreateChapters,
  transactionalOperations,
};