const userDao = require('../dao/userDao');
const usageLogDao = require('../dao/usageLogDao');
const { db } = require('../config/database');
const { createLogger } = require('../utils/logger');

const logger = createLogger('usage');

function toTokenCount(value) {
  const tokens = Number(value);
  return Number.isFinite(tokens) && tokens > 0 ? Math.floor(tokens) : 0;
}

function getUsageTokens(usage = {}) {
  const promptTokens = toTokenCount(usage.prompt_tokens || usage.promptTokens);
  const completionTokens = toTokenCount(usage.completion_tokens || usage.completionTokens);
  return toTokenCount(usage.total_tokens || usage.totalTokens) || (promptTokens + completionTokens);
}

async function syncDailyUsage(userId, userSnapshot = null) {
  return db.transaction(async (trx) => {
    const lockedUser = await userDao.lockById(userId, trx);
    if (!lockedUser) throw { status: 404, message: '用户不存在' };

    const actualUsed = await usageLogDao.getDailyUsage(userId, trx);
    const cachedUsed = Number(userSnapshot && userSnapshot.daily_tokens_used ? userSnapshot.daily_tokens_used : 0);
    if (!userSnapshot || actualUsed !== cachedUsed) {
      await userDao.setDailyTokens(userId, actualUsed, trx);
    }
    return actualUsed;
  });
}

const usageService = {
  // 记录 token 使用量
  async recordUsage(userId, novelId, requestType, usage, model) {
    const promptTokens = toTokenCount(usage.prompt_tokens || usage.promptTokens);
    const completionTokens = toTokenCount(usage.completion_tokens || usage.completionTokens);
    const tokensUsed = getUsageTokens(usage);
    if (!tokensUsed || tokensUsed <= 0) {
      logger.warn({ userId, requestType, model }, 'LLM 未返回可记录的 token 用量');
      return 0;
    }

    let actualUsed = 0;
    await db.transaction(async (trx) => {
      // 同一用户的 token 账本更新必须串行，避免并发生成时 daily_tokens_used 被旧聚合值覆盖。
      const lockedUser = await userDao.lockById(userId, trx);
      if (!lockedUser) throw { status: 404, message: '用户不存在' };

      await usageLogDao.create({
        user_id: userId,
        novel_id: novelId || null,
        request_type: requestType,
        tokens_used: tokensUsed,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        model: model || 'gpt-4o',
      }, trx);

      actualUsed = await usageLogDao.getDailyUsage(userId, trx);
      await userDao.setDailyTokens(userId, actualUsed, trx);
    });

    logger.info(`用户${userId} 消耗 ${tokensUsed} tokens (${requestType})，今日累计 ${actualUsed}`);
    return tokensUsed;
  },

  // 获取用户今日用量
  async getDailyUsage(userId) {
    return usageLogDao.getDailyUsage(userId);
  },

  // 同步用户缓存字段，权威值始终来自 usage_logs 的数据库自然日聚合。
  async syncDailyUsage(userId, userSnapshot = null) {
    return syncDailyUsage(userId, userSnapshot);
  },

  // 获取用户配额信息
  async getQuotaInfo(userId) {
    const user = await userDao.findById(userId);
    if (!user) throw { status: 404, message: '用户不存在' };

    const actualUsed = await syncDailyUsage(userId, user);

    return {
      dailyLimit: Number(user.token_limit_per_day) || 0,
      used: actualUsed,
      remaining: Number(user.token_limit_per_day) > 0 ? Math.max(0, Number(user.token_limit_per_day) - actualUsed) : null,
      rateLimitPerMinute: user.rate_limit_per_minute,
    };
  },

  // 管理员获取全局用量统计
  async getUsageStats({ startDate, endDate } = {}) {
    const totalTokens = await usageLogDao.getTotalUsage({ startDate, endDate });
    return { totalTokens, startDate, endDate };
  },

  getUsageTokens,
};

module.exports = usageService;
