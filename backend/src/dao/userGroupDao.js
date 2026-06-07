// 用户分组数据访问层
const { db } = require('../config/database');
const { createLogger } = require('../utils/logger');

const TABLE = 'user_groups';
const logger = createLogger('user-group-dao');

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

const userGroupDao = {
  // 获取所有分组（返回纯对象数组）
  async findAll() {
    const rows = await db(TABLE).orderBy('id', 'asc');
    return rows.map(r => ({ ...r }));
  },

  // 根据 ID 获取分组（返回纯对象，避免 knex 循环引用）
  async findById(id) {
    const row = await db(TABLE).where('id', id).first();
    if (!row) return null;
    return { ...row }; // 浅拷贝为纯对象
  },

  // 根据名称获取分组
  async findByName(name) {
    const row = await db(TABLE).where('name', name).first();
    if (!row) return null;
    return { ...row };
  },

  // 获取第一个非管理员分组，用作默认分组配置异常时的兜底。
  async findFirstAssignable() {
    const row = await db(TABLE).where('is_admin', 0).orderBy('id', 'asc').first();
    return row ? { ...row } : null;
  },

  // 解析可分配给普通用户的分组，防止默认注册分组误指向管理员组。
  async resolveAssignableGroupId(groupId, fallbackId = 1) {
    const parsedId = parseInt(groupId, 10);
    if (parsedId > 0) {
      const group = await this.findById(parsedId);
      if (group && !group.is_admin) return group.id;
    }

    const fallbackGroup = await this.findById(fallbackId);
    if (fallbackGroup && !fallbackGroup.is_admin) return fallbackGroup.id;

    const firstAssignable = await this.findFirstAssignable();
    if (firstAssignable) return firstAssignable.id;

    throw { status: 500, message: '未找到可分配给新用户的普通分组' };
  },

  // 创建分组（token_limit_per_day 为 0 表示不限制）
  async create(data) {
    const [id] = await db(TABLE).insert({
      name: data.name.trim(),
      token_limit_per_day: data.token_limit_per_day ?? 0, // 0 表示不限制
      rate_limit_per_minute: data.rate_limit_per_minute || 5,
      max_novels: data.max_novels || 3,
      max_chapters_per_novel: data.max_chapters_per_novel || 12,
      can_export: toBoolean(data.can_export) ? 1 : 0,
      can_customize: toBoolean(data.can_customize) ? 1 : 0,
      can_choose_model: toBoolean(data.can_choose_model) ? 1 : 0,
      description: data.description || '',
      queue_priority: data.queue_priority ?? 10, // 排队优先级，默认10
      is_admin: toBoolean(data.is_admin) ? 1 : 0, // 是否具有管理员权限
    });
    return this.findById(id);
  },

  // 更新分组
  async update(id, data) {
    const updateData = {};
    // 所有允许更新的字段（统一白名单）
    const allowed = [
      'name', 'token_limit_per_day', 'rate_limit_per_minute',
      'max_novels', 'max_chapters_per_novel', 'description', 'queue_priority'
    ];

    allowed.forEach(k => {
      if (data[k] !== undefined) updateData[k] = k === 'name' ? data[k].trim() : data[k];
    });

    // 布尔值字段统一转换为 0/1，避免不同数据库驱动保存 true/false 时不一致。
    ['can_export', 'can_customize', 'can_choose_model', 'is_admin'].forEach(k => {
      if (data[k] !== undefined) {
        updateData[k] = toBoolean(data[k]) ? 1 : 0;
      }
    });

    updateData.updated_at = new Date();

    logger.debug({ id, fields: Object.keys(updateData) }, '更新用户分组字段');

    await db(TABLE).where('id', id).update(updateData);
    return this.findById(id);
  },

  // 删除分组（如果有用户则不允许删除）
  async delete(id) {
    // 检查是否有用户属于此分组
    const [{ count }] = await db('users').where('group_id', id).count('* as count');
    if (parseInt(count) > 0) {
      throw { status: 400, message: '该分组下还有用户，无法删除' };
    }
    return db(TABLE).where('id', id).del();
  },

  // 获取分组下的用户数量
  async getUserCount(groupId) {
    const [{ count }] = await db('users').where('group_id', groupId).count('* as count');
    return parseInt(count, 10);
  },
};

module.exports = userGroupDao;
