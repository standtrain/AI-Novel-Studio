const { db } = require('../config/database');
const usageLogDao = require('./usageLogDao');

const TABLE = 'users';

const userDao = {
  async findById(id) {
    return db(TABLE)
      .join('user_groups', 'users.group_id', 'user_groups.id')
      .select('users.*', 'user_groups.name as group_name',
        'user_groups.token_limit_per_day', 'user_groups.rate_limit_per_minute',
        'user_groups.max_novels', 'user_groups.max_chapters_per_novel',
        'user_groups.can_export', 'user_groups.can_customize',
        'user_groups.can_choose_model',
        'user_groups.queue_priority', 'user_groups.is_admin')
      .where('users.id', id)
      .first();
  },

  async findByUsername(username) {
    return db(TABLE)
      .join('user_groups', 'users.group_id', 'user_groups.id')
      .select('users.*', 'user_groups.name as group_name',
        'user_groups.token_limit_per_day', 'user_groups.rate_limit_per_minute',
        'user_groups.max_novels', 'user_groups.max_chapters_per_novel',
        'user_groups.can_export', 'user_groups.can_customize',
        'user_groups.can_choose_model',
        'user_groups.queue_priority', 'user_groups.is_admin')
      .where('users.username', username)
      .first();
  },

  async findByLogin(login) {
    const query = db(TABLE)
      .join('user_groups', 'users.group_id', 'user_groups.id')
      .select('users.*', 'user_groups.name as group_name',
        'user_groups.token_limit_per_day', 'user_groups.rate_limit_per_minute',
        'user_groups.max_novels', 'user_groups.max_chapters_per_novel',
        'user_groups.can_export', 'user_groups.can_customize',
        'user_groups.can_choose_model',
        'user_groups.queue_priority', 'user_groups.is_admin');

    if (String(login || '').includes('@')) {
      return query.where('users.email', login).first();
    }

    return query.where('users.username', login).first();
  },

  async findByEmail(email) {
    return db(TABLE).where('email', email).first();
  },

  async create(userData) {
    const [id] = await db(TABLE).insert(userData);
    return id;
  },

  async getDailyTokensUsed(userId) {
    const row = await db(TABLE).select('daily_tokens_used', 'last_token_reset_at').where('id', userId).first();
    return row || { daily_tokens_used: 0, last_token_reset_at: null };
  },

  async lockById(userId, trx = db) {
    return trx(TABLE).select('id').where('id', userId).forUpdate().first();
  },

  async incrementDailyTokens(userId, tokens, trx = db) {
    await trx(TABLE).where('id', userId).increment('daily_tokens_used', tokens);
  },

  async setDailyTokens(userId, tokens, trx = db) {
    await trx(TABLE).where('id', userId).update({
      daily_tokens_used: Math.max(0, parseInt(tokens, 10) || 0),
      last_token_reset_at: db.fn.now(),
    });
  },

  async resetDailyTokens(userId, trx = db) {
    await trx(TABLE).where('id', userId).update({
      daily_tokens_used: 0,
      last_token_reset_at: db.fn.now(),
    });
  },

  async list({ page = 1, limit = 20, status, groupId, keyword } = {}) {
    let base = db(TABLE).join('user_groups', 'users.group_id', 'user_groups.id');
    if (status) base = base.where('users.status', status);
    if (groupId) base = base.where('users.group_id', groupId);
    if (keyword && keyword.trim()) {
      const kw = `%${keyword.trim()}%`;
      base = base.where(function () {
        this.where('users.username', 'like', kw)
          .orWhere('users.email', 'like', kw);
      });
    }
    const offset = (page - 1) * limit;
    const [rows, [{ total }]] = await Promise.all([
      base.clone().select(
        'users.*',
        'user_groups.name as group_name',
        'user_groups.token_limit_per_day',
        db.raw('COALESCE(today_usage.tokens_used, 0) as daily_tokens_used')
      )
        .leftJoin(
          usageLogDao.todayUsageByUserSubquery().as('today_usage'),
          'today_usage.user_id',
          'users.id',
        )
        .orderBy('users.created_at', 'desc').limit(limit).offset(offset),
      base.clone().count('* as total'),
    ]);
    return { rows, total: parseInt(total, 10), page, limit };
  },

  async update(userId, data) {
    return db(TABLE).where('id', userId).update(data);
  },

  // 更新当前用户的个人全局写作提示词，避免写入站点级配置造成用户之间串线。
  async updateWritingPrompt(userId, prompt) {
    return db(TABLE).where('id', userId).update({
      user_writing_prompt: prompt,
      updated_at: db.fn.now(),
    });
  },

  // 更新用户首选模型（null=按管理员优先级）
  async updatePreferredModel(userId, modelName) {
    return db(TABLE).where('id', userId).update({ preferred_model: modelName || null });
  },

  // 更新用户创作温度偏好
  async updateTemperaturePreference(userId, { preset, customTemperature }) {
    return db(TABLE).where('id', userId).update({
      temperature_preset: preset,
      custom_temperature: preset === 'custom' ? customTemperature : null,
    });
  },
};

module.exports = userDao;
