const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const mcpService = require('../services/mcpService');

const router = Router();
router.use(authenticate);
router.use(authorize('admin'));

// 获取所有 MCP 服务器
router.get('/servers', async (req, res) => {
  try {
    const servers = await mcpService.getGlobalServers();
    res.json({ servers });
  } catch (err) {
    res.status(500).json({ error: '获取 MCP 服务器列表失败' });
  }
});

// 创建 MCP 服务器
router.post('/servers', async (req, res) => {
  try {
    const server = await mcpService.createServer(req.body);
    res.status(201).json({ server });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '创建 MCP 服务器失败' });
  }
});

// 更新 MCP 服务器
router.put('/servers/:id', async (req, res) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    const server = await mcpService.updateServer(serverId, req.body);
    res.json({ server });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '更新 MCP 服务器失败' });
  }
});

// 删除 MCP 服务器
router.delete('/servers/:id', async (req, res) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    await mcpService.deleteServer(serverId);
    res.json({ success: true, message: 'MCP 服务器已删除' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '删除 MCP 服务器失败' });
  }
});

// 测试 MCP 服务器连接
router.post('/servers/:id/test', async (req, res) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    const result = await mcpService.testConnection(serverId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '测试连接失败' });
  }
});

module.exports = router;
