const { db } = require('../config/database');

const TABLE = 'user_skills';

const userSkillDao = {
  // 获取用户的所有技能配置
  async getByUser(userId) {
    return db(TABLE).where('user_id', userId);
  },

  // 获取用户特定技能的配置
  async getByUserAndSkill(userId, skillId) {
    return db(TABLE).where('user_id', userId).andWhere('skill_id', skillId).first();
  },

  // 插入或更新用户技能配置
  async upsert(userId, skillId, data) {
    const existing = await this.getByUserAndSkill(userId, skillId);
    if (existing) {
      const updateData = {};
      if (data.enabled !== undefined) updateData.enabled = data.enabled;
      if (data.parameters !== undefined) updateData.parameters = data.parameters;
      updateData.updated_at = db.fn.now();

      await db(TABLE).where('id', existing.id).update(updateData);
      return this.getByUserAndSkill(userId, skillId);
    } else {
      const [id] = await db(TABLE).insert({
        user_id: userId,
        skill_id: skillId,
        enabled: data.enabled !== undefined ? data.enabled : true,
        parameters: data.parameters || null,
      });
      return db(TABLE).where('id', id).first();
    }
  },

  // 删除用户的特定技能配置
  async remove(userId, skillId) {
    return db(TABLE).where('user_id', userId).andWhere('skill_id', skillId).del();
  },

  // 删除用户的所有技能配置（用户注销时清理）
  async deleteAllForUser(userId) {
    return db(TABLE).where('user_id', userId).del();
  },
};

module.exports = userSkillDao;
