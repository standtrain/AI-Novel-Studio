const rateLimit = require('express-rate-limit');

// 为每个用户组创建限流中间件（每个组一个实例，启动时创建）
const groupLimiters = {};

function initLimiters(userGroups) {
  userGroups.forEach(group => {
    groupLimiters[group.name] = rateLimit({
      windowMs: 60 * 1000, // 1分钟
      max: group.rate_limit_per_minute,
      keyGenerator: (req) => `rate_${req.user?.group_name || req.ip}_${req.ip}`,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: '请求过于频繁，请稍后再试' },
    });
  });
}

function getRateLimiter(groupName) {
  // 如果未找到对应分组的限流器，使用默认的严格限制
  return groupLimiters[groupName] || rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '请求过于频繁，请稍后再试' },
  });
}

module.exports = { initLimiters, getRateLimiter };
