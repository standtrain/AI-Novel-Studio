const { db } = require('../config/database');

const TABLE = 'skills';

const skillDao = {
  // 获取所有技能（按排序权重排列）
  async getAll() {
    return db(TABLE).select('*').orderBy('sort_order', 'asc');
  },

  // 获取已启用的技能（可选按阶段筛选）
  async getEnabled(phase) {
    let query = db(TABLE).where('enabled', true).orderBy('sort_order', 'asc');
    if (phase) {
      query = query.where(function () {
        this.where('phase', phase).orWhere('phase', 'all');
      });
    }
    return query;
  },

  // 根据 ID 获取技能
  async getById(id) {
    return db(TABLE).where('id', id).first();
  },

  // 根据名称获取技能
  async getByName(name) {
    return db(TABLE).where('name', name).first();
  },

  // 创建技能
  async create(data) {
    const [id] = await db(TABLE).insert({
      name: data.name,
      display_name: data.display_name,
      description: data.description || '',
      icon: data.icon || null,
      system_prompt: data.system_prompt,
      phase: data.phase || 'all',
      parameters_schema: data.parameters_schema || null,
      enabled: data.enabled !== undefined ? data.enabled : true,
      sort_order: data.sort_order || 0,
      allowed_tools: data.allowed_tools || null,
      metadata: data.metadata || null,
    });
    return this.getById(id);
  },

  // 更新技能
  async update(id, data) {
    const allowedFields = [
      'name', 'display_name', 'description', 'icon',
      'system_prompt', 'phase', 'parameters_schema',
      'enabled', 'sort_order', 'allowed_tools', 'metadata',
    ];
    const updateData = {};
    allowedFields.forEach(f => {
      if (data[f] !== undefined) updateData[f] = data[f];
    });
    updateData.updated_at = db.fn.now();

    await db(TABLE).where('id', id).update(updateData);
    return this.getById(id);
  },

  // 删除技能
  async remove(id) {
    return db(TABLE).where('id', id).del();
  },

  // 获取用户的技能视图（含用户个人配置）
  async getForUser(userId) {
    const userSkills = await db('user_skills').where('user_id', userId);
    const userSkillMap = {};
    userSkills.forEach(us => {
      userSkillMap[us.skill_id] = us;
    });

    const allSkills = await this.getAll();
    return allSkills.map(skill => ({
      ...skill,
      user_enabled: userSkillMap[skill.id]?.enabled ?? null,
      user_parameters: userSkillMap[skill.id]?.parameters ?? null,
    }));
  },
};

module.exports = skillDao;
