// MCP 服务端点
// 对外暴露平台的 MCP 工具，供外部 AI 应用（如 Claude Desktop）连接
const { Router } = require('express');
const { handleJsonRpc } = require('../core/mcp/mcpServer');
const { createLogger } = require('../utils/logger');

const logger = createLogger('mcp-endpoint');
const router = Router();

// API Key 认证中间件
// 优先从 Authorization header 提取，其次从 x-api-key header
async function mcpAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (apiKeyHeader) {
    token = apiKeyHeader;
  }

  try {
    // 从站点配置获取 MCP API Key
    const configDao = require('../dao/configDao');
    const expectedKey = await configDao.get('mcp_api_key');

    // 如果未配置 API Key，拒绝所有外部请求
    if (!expectedKey) {
      logger.warn('MCP API Key 未配置，拒绝所有外部请求。请在管理后台"安全设置"中配置 mcp_api_key。');
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'MCP 服务未配置 API Key，请联系管理员' },
      });
    }

    // 验证 API Key
    if (token !== expectedKey) {
      // 如果不是 MCP API Key，尝试 JWT 验证
      try {
        const jwt = require('jsonwebtoken');
        const auth = require('../config/auth');
        const decoded = jwt.verify(token, auth.JWT_SECRET);
        // 平台 JWT 使用 id 字段；兼容历史 userId 字段，避免外部工具拿不到当前用户身份。
        const userId = decoded.id || decoded.userId;
        if (!userId) {
          return res.status(401).json({
            jsonrpc: '2.0',
            error: { code: -32001, message: '未授权：用户身份无效' },
          });
        }
        req.mcpUserId = userId;
        return next();
      } catch {
        return res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: '未授权：API Key 无效' },
        });
      }
    }

    // API Key 认证通过，使用匿名/管理员身份
    req.mcpUserId = null;
    next();
  } catch (err) {
    logger.error('MCP 认证失败：' + err.message);
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: '服务器内部错误' },
    });
  }
}

// MCP JSON-RPC 端点
router.post('/', mcpAuth, async (req, res) => {
  const body = req.body;

  // 验证是否为 JSON-RPC 请求
  if (!body || body.jsonrpc !== '2.0' || !body.method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: '无效的 JSON-RPC 请求' },
    });
  }

  try {
    const result = await handleJsonRpc(body, {
      userId: req.mcpUserId,
      req,
    });

    // 通知类请求不需要响应
    if (result === null) {
      return res.status(202).end();
    }

    res.json(result);
  } catch (err) {
    logger.error('MCP 端点处理失败：' + err.message);
    res.status(500).json({
      jsonrpc: '2.0',
      id: body.id || null,
      error: { code: -32603, message: err.message },
    });
  }
});

// SSE 端点（用于 MCP 服务器推送消息）
router.get('/', mcpAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // 发送 endpoint 事件，告知客户端 POST 端点地址
  res.write(`event: endpoint\ndata: ${req.protocol}://${req.get('host')}/api/mcp-endpoint\n\n`);
  res.write('event: message\ndata: {"jsonrpc":"2.0","method":"server/ready"}\n\n');

  // 保持连接
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    res.end();
  });
});

module.exports = router;
