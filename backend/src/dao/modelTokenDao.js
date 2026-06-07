// 模型 Token 限额数据访问层
const { db } = require('../config/database');

const TABLE = 'model_token_limits';

function isEnabled(row) {
  return row.enabled === true || row.enabled === 1 || row.enabled === '1';
}

function normalizeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

async function resetStaleUsage(id, conn = db) {
  // 与用户每日用量保持一致：每日按数据库自然日重置，每月按数据库自然月重置。
  await conn(TABLE)
    .where('id', id)
    .andWhere((builder) => {
      builder
        .whereNull('last_daily_reset_at')
        .orWhereRaw('DATE(last_daily_reset_at) < CURDATE()')
        .orWhereNull('last_monthly_reset_at')
        .orWhereRaw("DATE_FORMAT(last_monthly_reset_at, '%Y-%m') < DATE_FORMAT(CURDATE(), '%Y-%m')");
    })
    .update({
      daily_used: conn.raw('CASE WHEN last_daily_reset_at IS NULL OR DATE(last_daily_reset_at) < CURDATE() THEN 0 ELSE daily_used END'),
      last_daily_reset_at: conn.raw('CASE WHEN last_daily_reset_at IS NULL OR DATE(last_daily_reset_at) < CURDATE() THEN NOW() ELSE last_daily_reset_at END'),
      monthly_used: conn.raw("CASE WHEN last_monthly_reset_at IS NULL OR DATE_FORMAT(last_monthly_reset_at, '%Y-%m') < DATE_FORMAT(CURDATE(), '%Y-%m') THEN 0 ELSE monthly_used END"),
      last_monthly_reset_at: conn.raw("CASE WHEN last_monthly_reset_at IS NULL OR DATE_FORMAT(last_monthly_reset_at, '%Y-%m') < DATE_FORMAT(CURDATE(), '%Y-%m') THEN NOW() ELSE last_monthly_reset_at END"),
      updated_at: db.fn.now(),
    });
}

async function resetAllStaleUsage(conn = db) {
  await conn(TABLE)
    .where((builder) => {
      builder
        .whereNull('last_daily_reset_at')
        .orWhereRaw('DATE(last_daily_reset_at) < CURDATE()')
        .orWhereNull('last_monthly_reset_at')
        .orWhereRaw("DATE_FORMAT(last_monthly_reset_at, '%Y-%m') < DATE_FORMAT(CURDATE(), '%Y-%m')");
    })
    .update({
      daily_used: conn.raw('CASE WHEN last_daily_reset_at IS NULL OR DATE(last_daily_reset_at) < CURDATE() THEN 0 ELSE daily_used END'),
      last_daily_reset_at: conn.raw('CASE WHEN last_daily_reset_at IS NULL OR DATE(last_daily_reset_at) < CURDATE() THEN NOW() ELSE last_daily_reset_at END'),
      monthly_used: conn.raw("CASE WHEN last_monthly_reset_at IS NULL OR DATE_FORMAT(last_monthly_reset_at, '%Y-%m') < DATE_FORMAT(CURDATE(), '%Y-%m') THEN 0 ELSE monthly_used END"),
      last_monthly_reset_at: conn.raw("CASE WHEN last_monthly_reset_at IS NULL OR DATE_FORMAT(last_monthly_reset_at, '%Y-%m') < DATE_FORMAT(CURDATE(), '%Y-%m') THEN NOW() ELSE last_monthly_reset_at END"),
      updated_at: db.fn.now(),
    });
}

const modelTokenDao = {
  // 获取所有限额配置
  async findAll() {
    await resetAllStaleUsage();
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

  // 增加已用 Token：自然日/月重置和递增放在同一事务，避免并发竞态。
  async incrementUsage(providerName, modelName, tokens) {
    if (!tokens || tokens <= 0) return;

    await db.transaction(async (trx) => {
      const row = await trx(TABLE)
        .where({ provider_name: providerName, model_name: modelName })
        .forUpdate()
        .first();
      if (!row || !isEnabled(row)) return;

      await resetStaleUsage(row.id, trx);
      await trx(TABLE).where('id', row.id).increment({
        daily_used: normalizeCount(tokens),
        monthly_used: normalizeCount(tokens),
      });
    });
  },

  // 检查模型是否在限额内（含延迟重置）
  async checkLimits(providerName, modelName) {
    return db.transaction(async (trx) => {
      const row = await trx(TABLE)
        .where({ provider_name: providerName, model_name: modelName })
        .forUpdate()
        .first();
      if (!row || !isEnabled(row)) {
        return { withinDaily: true, withinMonthly: true, dailyUsed: 0, dailyLimit: 0, monthlyUsed: 0, monthlyLimit: 0 };
      }

      await resetStaleUsage(row.id, trx);
      const current = await trx(TABLE).where('id', row.id).first();
      const dailyUsed = normalizeCount(current.daily_used);
      const monthlyUsed = normalizeCount(current.monthly_used);
      const dailyLimit = normalizeCount(current.daily_limit);
      const monthlyLimit = normalizeCount(current.monthly_limit);

      return {
        withinDaily: dailyLimit === 0 || dailyUsed < dailyLimit,
        withinMonthly: monthlyLimit === 0 || monthlyUsed < monthlyLimit,
        dailyUsed,
        dailyLimit,
        monthlyUsed,
        monthlyLimit,
      };
    });
  },
};

module.exports = modelTokenDao;
