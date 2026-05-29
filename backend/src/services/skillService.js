const skillDao = require('../dao/skillDao');
const userSkillDao = require('../dao/userSkillDao');
const { createLogger } = require('../utils/logger');

const logger = createLogger('skill');

const skillService = {
  // 获取所有技能（管理员视图）
  async getAllSkills() {
    return skillDao.getAll();
  },

  // 获取用户技能视图（含个人配置状态）
  async getUserSkills(userId) {
    return skillDao.getForUser(userId);
  },

  // 切换用户技能启用状态
  async toggleUserSkill(userId, skillId, enabled) {
    const skill = await skillDao.getById(skillId);
    if (!skill) throw { status: 404, message: '技能不存在' };
    return userSkillDao.upsert(userId, skillId, { enabled });
  },

  // 更新用户技能参数
  async updateUserSkillParams(userId, skillId, parameters) {
    const skill = await skillDao.getById(skillId);
    if (!skill) throw { status: 404, message: '技能不存在' };
    return userSkillDao.upsert(userId, skillId, { parameters });
  },

  // 创建技能（管理员）
  async createSkill(data) {
    if (!data.name || !data.display_name || !data.system_prompt) {
      throw { status: 400, message: '技能名称、显示名称和提示词为必填项' };
    }
    const existing = await skillDao.getByName(data.name);
    if (existing) throw { status: 409, message: '技能标识名已存在' };
    return skillDao.create(data);
  },

  // 批量导入技能（从 Claude Code 的 skills/ 目录结构）
  async batchImportSkills(skillsData) {
    if (!Array.isArray(skillsData) || skillsData.length === 0) {
      throw { status: 400, message: '请提供至少一个技能数据' };
    }

    const results = { created: [], skipped: [], errors: [] };
    const maxSortOrder = (await skillDao.getAll()).reduce((max, s) => Math.max(max, s.sort_order || 0), 0);

    for (let i = 0; i < skillsData.length; i++) {
      const data = skillsData[i];
      try {
        if (!data.name || !data.system_prompt) {
          results.errors.push({ index: i, name: data.name || '(无名)', error: '缺少必填字段 name 或 system_prompt' });
          continue;
        }

        const existing = await skillDao.getByName(data.name);
        if (existing) {
          results.skipped.push({ index: i, name: data.name, reason: '标识名已存在' });
          continue;
        }

        const skill = await skillDao.create({
          name: data.name,
          display_name: data.display_name || data.name,
          description: data.description || '',
          system_prompt: data.system_prompt,
          phase: data.phase || 'all',
          parameters_schema: data.parameters_schema || null,
          allowed_tools: data.allowed_tools || null,
          metadata: data.metadata || null,
          enabled: true,
          sort_order: maxSortOrder + i + 1,
        });
        results.created.push({ index: i, name: data.name, id: skill.id });
      } catch (err) {
        results.errors.push({ index: i, name: data.name || '(无名)', error: err.message });
      }
    }

    return results;
  },

  // 更新技能（管理员）
  async updateSkill(id, data) {
    const skill = await skillDao.getById(id);
    if (!skill) throw { status: 404, message: '技能不存在' };
    if (data.name && data.name !== skill.name) {
      const existing = await skillDao.getByName(data.name);
      if (existing) throw { status: 409, message: '技能标识名已存在' };
    }
    return skillDao.update(id, data);
  },

  // 删除技能（管理员）
  async deleteSkill(id) {
    const skill = await skillDao.getById(id);
    if (!skill) throw { status: 404, message: '技能不存在' };
    return skillDao.remove(id);
  },

  // ========== 核心方法：获取用户活跃技能的已解析提示词 ==========

  /**
   * 获取用户在指定阶段应注入的提示词数组
   * @param {number} userId - 用户 ID
   * @param {string} phase - 写作阶段（outline/characters/chapters_outline/write_chapter）
   * @param {object} context - 可选的小说上下文（用于解析 {{变量}} 占位符）
   * @returns {Promise<Array<{name, display_name, resolvedPrompt}>>}
   */
  async getActiveSkillPrompts(userId, phase, context = {}) {
    try {
      // 加载该阶段所有全局启用的技能
      const globalSkills = await skillDao.getEnabled(phase);

      if (globalSkills.length === 0) return [];

      // 加载用户配置
      const userConfigs = await userSkillDao.getByUser(userId);
      const userConfigMap = {};
      userConfigs.forEach(uc => {
        userConfigMap[uc.skill_id] = uc;
      });

      // 过滤：用户未明确禁用的技能（null 或 true 都视为启用）
      const activeSkills = globalSkills.filter(skill => {
        const userCfg = userConfigMap[skill.id];
        return !userCfg || userCfg.enabled !== false;
      });

      // 解析每个技能的提示词占位符
      return activeSkills.map(skill => {
        const userCfg = userConfigMap[skill.id];
        // 合并参数：默认值 < 全局 schema 默认值 < 用户自定义值
        const params = _mergeParams(skill.parameters_schema, userCfg?.parameters);
        const resolvedPrompt = _resolveTemplate(skill.system_prompt, params, context);

        return {
          id: skill.id,
          name: skill.name,
          display_name: skill.display_name,
          phase: skill.phase,
          resolvedPrompt,
        };
      });
    } catch (err) {
      logger.error('获取技能提示词失败：' + err.message);
      return []; // 优雅降级，不阻塞写作流程
    }
  },
};

// 合并参数：schema 默认值 + 用户自定义值
function _mergeParams(schema, userParams) {
  const merged = {};
  if (schema && typeof schema === 'object') {
    // 从 JSON Schema 中提取默认值
    const props = schema.properties || {};
    Object.keys(props).forEach(key => {
      if (props[key].default !== undefined) {
        merged[key] = props[key].default;
      }
    });
  }
  // 用户参数覆盖默认值
  if (userParams && typeof userParams === 'object') {
    Object.assign(merged, userParams);
  }
  return merged;
}

// 解析模板中的 {{变量}} 占位符
function _resolveTemplate(template, params, context) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    // 优先使用用户参数
    if (params[varName] !== undefined) return params[varName];
    // 回退到小说上下文
    if (context[varName] !== undefined) return context[varName];
    // 未找到则保留原占位符
    return match;
  });
}

module.exports = skillService;
