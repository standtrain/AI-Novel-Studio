// 角色授权中间件工厂函数
// 用法：authorize('admin') - 检查组名或 is_admin 字段
function authorize(requiredGroup) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '请先登录' });
    }

    // is_admin 字段拥有最高权限
    if (req.user.is_admin) {
      return next();
    }

    // 检查组名称：缺失字段时一律拒绝，避免数据异常时被绕过权限
    const groupName = req.user.group_name || req.user.group?.name;
    if (!groupName || groupName !== requiredGroup) {
      return res.status(403).json({ error: '权限不足，需要 ' + requiredGroup + ' 权限' });
    }

    next();
  };
}

module.exports = authorize;
