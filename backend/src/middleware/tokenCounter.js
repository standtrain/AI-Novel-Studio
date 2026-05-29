const userDao = require('../dao/userDao');
const { createLogger } = require('../utils/logger');

const logger = createLogger('token');

// Token 配额检查中间件（在 Agent 调用前检查）
async function checkTokenQuota(req, res, next) {
  if (!req.user) {
    return next(); // 非认证路由跳过
  }

  const groupLimit = req.user.token_limit_per_day;

  // 0 表示不限制
  if (groupLimit === 0) {
    return next();
  }

  let { daily_tokens_used, last_token_reset_at } = req.user;

  // 惰性每日重置：检查是否需要重置
  const now = new Date();
  const resetDate = last_token_reset_at ? new Date(last_token_reset_at) : null;

  // 跨自然日则重置计数器
  if (resetDate && resetDate.toDateString() !== now.toDateString()) {
    await userDao.resetDailyTokens(req.user.id);
    daily_tokens_used = 0;
    req.user.daily_tokens_used = 0;
    logger.info(`用户 ${req.user.username} 的每日 token 已重置`);
  }

  // 按请求阶段动态估算 token 消耗
  const phaseEstimates = {
    outline: 1000,
    characters: 1500,
    chapters_outline: 3000,
    chapter_outline: 3000,
    write_chapter: 8000,
    review: 1500,
    data_extraction: 1000,
  };
  const phase = req.body?.phase || req.query?.phase;
  const estimatedTokens = phaseEstimates[phase] || 2000;
  if (daily_tokens_used + estimatedTokens > groupLimit) {
    const remaining = Math.max(0, groupLimit - daily_tokens_used);
    return res.status(429).json({
      error: '每日 Token 额度已耗尽，请明天再试或升级账号',
      code: 'TOKEN_QUOTA_EXCEEDED',
      dailyLimit: groupLimit,
      used: daily_tokens_used,
      remaining,
    });
  }

  next();
}

module.exports = { checkTokenQuota };
