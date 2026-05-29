// 导出权限校验中间件（必须在 authenticate 之后执行）
function exportGuard(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '请先登录' });
  }
  if (!req.user.can_export) {
    return res.status(403).json({
      error: '导出功能需要高级用户权限，请联系管理员升级账号',
      code: 'EXPORT_DENIED',
    });
  }
  next();
}

module.exports = exportGuard;
