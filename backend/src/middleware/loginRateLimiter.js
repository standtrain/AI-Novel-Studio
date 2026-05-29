// 登录接口专用 IP 限流中间件
// 基于 IP 地址的请求计数，窗口 1 分钟，最大次数从 site_config.login_rate_limit 读取
const configService = require('../services/configService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('login-limiter');

const WINDOW_MS = 60 * 1000;       // 1分钟窗口
const DEFAULT_MAX = 5;              // 默认5次/分钟
const CACHE_TTL = 30 * 1000;        // 30秒缓存配置值
const attempts = new Map();         // IP -> timestamp[]

let cachedMax = DEFAULT_MAX;
let lastFetch = 0;

// 从数据库读取限制次数（带缓存）
async function getMax() {
  const now = Date.now();
  if (now - lastFetch < CACHE_TTL) return cachedMax;
  try {
    const val = await configService.get('login_rate_limit');
    const parsed = parseInt(val, 10);
    cachedMax = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX;
    lastFetch = now;
  } catch {
    // 保持缓存值
  }
  return cachedMax;
}

// 定期清理过期记录，防止内存泄漏
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of attempts) {
    const filtered = timestamps.filter(ts => now - ts < WINDOW_MS);
    if (filtered.length === 0) {
      attempts.delete(ip);
    } else {
      attempts.set(ip, filtered);
    }
  }
}, 60 * 1000);

async function loginRateLimiter(req, res, next) {
  const max = await getMax();
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();

  let record = attempts.get(ip) || [];
  record = record.filter(ts => now - ts < WINDOW_MS);

  if (record.length >= max) {
    const retryAfter = Math.ceil((record[0] + WINDOW_MS - now) / 1000);
    logger.warn(`登录频率限制触发 IP: ${ip}`);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: '登录尝试过于频繁，请稍后再试' });
  }

  record.push(now);
  attempts.set(ip, record);
  next();
}

module.exports = loginRateLimiter;
