const userDao = require('../dao/userDao');
const usageLogDao = require('../dao/usageLogDao');
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

    await Promise.all([
      usageLogDao.create({
        user_id: userId,
        novel_id: novelId || null,
        request_type: requestType,
        tokens_used: tokensUsed,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        model: model || 'gpt-4o',
      }),
      userDao.incrementDailyTokens(userId, tokensUsed),
    ]);
    logger.info(`用户${userId} 消耗 ${tokensUsed} tokens (${requestType})`);
    return tokensUsed;
  },

  // 获取用户今日用量
  async getDailyUsage(userId) {
    return usageLogDao.getDailyUsage(userId);
  },

  // 获取用户配额信息
  async getQuotaInfo(userId) {
    const user = await userDao.findById(userId);
    if (!user) throw { status: 404, message: '用户不存在' };

    const actualUsed = await usageLogDao.getDailyUsage(userId);
    if (actualUsed !== user.daily_tokens_used) {
      await userDao.setDailyTokens(userId, actualUsed);
    }

    return {
      dailyLimit: user.token_limit_per_day,
      used: actualUsed,
      remaining: Math.max(0, user.token_limit_per_day - actualUsed),
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
