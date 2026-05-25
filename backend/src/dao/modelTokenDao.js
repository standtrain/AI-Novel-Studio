// 模型 Token 限额数据访问层
const { db } = require('../config/database');

const TABLE = 'model_token_limits';

const modelTokenDao = {
  // 获取所有限额配置
  async findAll() {
    return db(TABLE).orderBy('provider_name', 'asc').orderBy('model_name', 'asc');
  },

  // 根据 Provider + 模型名查找
  async findByProviderModel(providerName, modelName) {
    return db(TABLE)
      .where({ provider_name: providerName, model_name: modelName })
      .first();
  },

  // 根据 ID 查找
  async findById(id) {
    return db(TABLE).where('id', id).first();
  },

  // 创建或更新限额配置
  async upsert(providerName, modelName, { daily_limit, monthly_limit, enabled }) {
    const existing = await this.findByProviderModel(providerName, modelName);
    if (existing) {
      await db(TABLE).where('id', existing.id).update({
        daily_limit: daily_limit ?? existing.daily_limit,
        monthly_limit: monthly_limit ?? existing.monthly_limit,
        enabled: enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
        updated_at: db.fn.now(),
      });
      return this.findById(existing.id);
    }
    const [id] = await db(TABLE).insert({
      provider_name: providerName,
      model_name: modelName,
      daily_limit: daily_limit ?? 0,
      monthly_limit: monthly_limit ?? 0,
      enabled: enabled !== undefined ? (enabled ? 1 : 0) : 1,
    });
    return this.findById(id);
  },

  // 删除限额配置
  async delete(id) {
    return db(TABLE).where('id', id).del();
  },

  // 增加已用 Token（使用数据库原生 INCREMENT 避免并发竞态）
  async incrementUsage(providerName, modelName, tokens) {
    if (!tokens || tokens <= 0) return;

    const row = await this.findByProviderModel(providerName, modelName);
    if (!row || !row.enabled) return;

    const now = new Date();
    const updateData = { updated_at: db.fn.now() };
    let needsReset = false;

    // 延迟日重置：距上次重置超过 24 小时则先归零
    if (!row.last_daily_reset_at || (now - new Date(row.last_daily_reset_at)) > 24 * 60 * 60 * 1000) {
      updateData.daily_used = 0;
      updateData.last_daily_reset_at = now;
      needsReset = true;
    }

    // 延迟月重置
    if (!row.last_monthly_reset_at || (now - new Date(row.last_monthly_reset_at)) > 30 * 24 * 60 * 60 * 1000) {
      updateData.monthly_used = 0;
      updateData.last_monthly_reset_at = now;
      needsReset = true;
    }

    if (needsReset) {
      await db(TABLE).where('id', row.id).update(updateData);
    }

    // 使用数据库原生 INCREMENT 避免竞态条件
    await db(TABLE).where('id', row.id)
      .increment('daily_used', tokens)
      .increment('monthly_used', tokens);
  },

  // 检查模型是否在限额内（含延迟重置）
  async checkLimits(providerName, modelName) {
    const row = await this.findByProviderModel(providerName, modelName);
    if (!row || !row.enabled) {
      return { withinDaily: true, withinMonthly: true, dailyUsed: 0, dailyLimit: 0, monthlyUsed: 0, monthlyLimit: 0 };
    }

    const now = new Date();

    // 延迟日重置
    let dailyUsed = row.daily_used;
    if (row.last_daily_reset_at && (now - new Date(row.last_daily_reset_at)) > 24 * 60 * 60 * 1000) {
      dailyUsed = 0;
    }

    // 延迟月重置
    let monthlyUsed = row.monthly_used;
    if (row.last_monthly_reset_at && (now - new Date(row.last_monthly_reset_at)) > 30 * 24 * 60 * 60 * 1000) {
      monthlyUsed = 0;
    }

    const withinDaily = row.daily_limit === 0 || dailyUsed < row.daily_limit;
    const withinMonthly = row.monthly_limit === 0 || monthlyUsed < row.monthly_limit;

    return {
      withinDaily,
      withinMonthly,
      dailyUsed,
      dailyLimit: row.daily_limit,
      monthlyUsed,
      monthlyLimit: row.monthly_limit,
    };
  },
};

module.exports = modelTokenDao;
