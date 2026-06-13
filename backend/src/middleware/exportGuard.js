// 导出权限校验中间件（必须在 authenticate 之后执行）
// 实时查询数据库读取最新 can_export，避免 JWT 中携带的过时权限被绕过
const userDao = require('../dao/userDao');

async function exportGuard(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '请先登录' });
  }
  try {
    const fresh = await userDao.findById(req.user.id);
    if (!fresh || !fresh.can_export) {
      return res.status(403).json({
        error: '导出功能需要高级用户权限，请联系管理员升级账号',
        code: 'EXPORT_DENIED',
      });
    }
    // 同步最新权限到 req.user，方便后续中间件使用
    req.user.can_export = fresh.can_export;
    next();
  } catch (err) {
    return res.status(500).json({ error: '权限校验失败' });
  }
}

module.exports = exportGuard;
