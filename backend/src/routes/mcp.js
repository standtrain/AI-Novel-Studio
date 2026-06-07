const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const mcpService = require('../services/mcpService');
const { parsePositiveInt } = require('../utils/requestParser');

const router = Router();
router.use(authenticate);

// 获取用户 MCP 服务器视图（含个人配置状态）
router.get('/servers', async (req, res) => {
  try {
    const servers = await mcpService.getUserServers(req.user.id);
    res.json({ servers });
  } catch (err) {
    res.status(500).json({ error: '获取 MCP 服务器列表失败' });
  }
});

// 保存用户 MCP 配置
router.put('/servers/:id/config', async (req, res) => {
  try {
    const serverId = parsePositiveInt(req.params.id, 'MCP服务ID');
    const { enabled, extra_config } = req.body;
    const result = await mcpService.saveUserConfig(req.user.id, serverId, {
      enabled,
      extra_config,
    });
    res.json({ config: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '保存 MCP 配置失败' });
  }
});

// 删除用户 MCP 配置
router.delete('/servers/:id/config', async (req, res) => {
  try {
    const serverId = parsePositiveInt(req.params.id, 'MCP服务ID');
    await mcpService.deleteUserConfig(req.user.id, serverId);
    res.json({ success: true, message: 'MCP 配置已删除' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '删除 MCP 配置失败' });
  }
});

module.exports = router;
