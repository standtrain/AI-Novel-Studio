const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/auth');
const userDao = require('../dao/userDao');

// JWT 认证中间件
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await userDao.findById(payload.id);
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }
    if (user.status === 'disabled') {
      let banInfo = { userId: user.id, type: 'unknown', reason: '账号已被管理员禁用', canAppeal: false };
      try {
        const banDao = require('../dao/banDao');
        const ban = await banDao.getActiveBan(user.id);
        if (ban) {
          banInfo = {
            banId: ban.id,
            userId: user.id,
            type: ban.type,
            reason: ban.reason || '未提供原因',
            createdAt: ban.created_at,
            canAppeal: ban.type === 'ban',
          };
        }
      } catch { /* ignore */ }
      return res.status(403).json({ error: '账号已被禁用', banInfo });
    }
    req.user = user;
    // 暴露 JWT payload 给后续路由使用（如 /auth/me 续签判断剩余有效期）
    req.tokenPayload = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '令牌已过期，请重新登录' });
    }
    return res.status(401).json({ error: '无效的认证令牌' });
  }
}

module.exports = authenticate;
