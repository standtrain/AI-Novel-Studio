const userDao = require('../dao/userDao');
const usageLogDao = require('../dao/usageLogDao');
const { createLogger } = require('../utils/logger');

const logger = createLogger('usage');

const usageService = {
  // 记录 token 使用量
  async recordUsage(userId, novelId, requestType, usage, model) {
    const tokensUsed = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
    await Promise.all([
      usageLogDao.create({
        user_id: userId,
        novel_id: novelId || null,
        request_type: requestType,
        tokens_used: tokensUsed,
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
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

    const now = new Date();
    const resetDate = user.last_token_reset_at ? new Date(user.last_token_reset_at) : null;
    let actualUsed = user.daily_tokens_used;

    // 惰性重置：跨自然日则归零并持久化到数据库
    if (resetDate && resetDate.toDateString() !== now.toDateString()) {
      actualUsed = 0;
      await userDao.resetDailyTokens(userId);
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
};

module.exports = usageService;
