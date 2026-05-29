// MCP 客户端管理器
// 管理与外部 MCP 服务器的连接、工具发现和调用
const { createLogger } = require('../../utils/logger');

const logger = createLogger('mcp-client');

// 工具缓存：serverKey -> { tools, expiresAt }
const _toolCache = new Map();
const CACHE_TTL = 300000; // 5 分钟缓存

class McpClientManager {
  constructor() {
    this._clients = new Map(); // serverKey -> 客户端实例
  }

  // 生成服务器唯一键
  _serverKey(serverConfig) {
    return `mcp:${serverConfig.id || serverConfig.name}:${serverConfig.transport}`;
  }

  // 构建请求头
  _buildHeaders(serverConfig) {
    const headers = { 'Content-Type': 'application/json' };
    if (serverConfig.headers && typeof serverConfig.headers === 'object') {
      // headers 可能是 JSON 字符串或已解析的对象
      const hdrs = typeof serverConfig.headers === 'string'
        ? JSON.parse(serverConfig.headers)
        : serverConfig.headers;
      Object.assign(headers, hdrs);
    }
    return headers;
  }

  // 发送 JSON-RPC 请求到 MCP 服务器
  async _sendJsonRpc(url, headers, method, params) {
    const body = {
      jsonrpc: '2.0',
      id: Date.now().toString(),
      method,
      params: params || {},
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || 'JSON-RPC 错误');
    }

    return data.result;
  }

  // 初始化 MCP 连接
  async _initialize(url, headers) {
    const result = await this._sendJsonRpc(url, headers, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: 'bookagent',
        version: '2.0.0',
      },
    });

    // 发送 initialized 通知
    await this._sendJsonRpc(url, headers, 'notifications/initialized', {});

    return result;
  }

  // 获取服务器的工具列表
  async _listTools(url, headers) {
    const result = await this._sendJsonRpc(url, headers, 'tools/list', {});
    return result.tools || [];
  }

  // 调用服务器上的工具
  async callTool(serverConfig, toolName, args) {
    const url = serverConfig.url;
    if (!url) throw new Error('服务器未配置 URL');

    const headers = this._buildHeaders(serverConfig);

    try {
      // 确保已初始化
      const key = this._serverKey(serverConfig);
      if (!this._clients.has(key)) {
        await this._initialize(url, headers);
        this._clients.set(key, true);
      }

      const result = await this._sendJsonRpc(url, headers, 'tools/call', {
        name: toolName,
        arguments: args,
      });

      return result;
    } catch (err) {
      // 连接可能过期，清除初始化状态
      this._clients.delete(this._serverKey(serverConfig));
      throw err;
    }
  }

  // 获取服务器工具（含缓存）
  async getTools(serverConfig) {
    const key = this._serverKey(serverConfig);

    // 检查缓存
    const cached = _toolCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.tools;
    }

    const url = serverConfig.url;
    if (!url) {
      logger.warn(`MCP 服务器 "${serverConfig.name}" 未配置 URL，跳过`);
      return [];
    }

    const headers = this._buildHeaders(serverConfig);

    try {
      await this._initialize(url, headers);
      this._clients.set(key, true);

      const tools = await this._listTools(url, headers);

      // 缓存结果
      _toolCache.set(key, { tools, expiresAt: Date.now() + CACHE_TTL });

      return tools;
    } catch (err) {
      logger.error(`获取 MCP 服务器 "${serverConfig.name}" 工具失败：${err.message}`);
      this._clients.delete(key);
      return [];
    }
  }

  // 测试服务器连接
  async testServer(serverConfig) {
    const url = serverConfig.url;
    if (!url) throw new Error('服务器未配置 URL');

    const headers = this._buildHeaders(serverConfig);
    await this._initialize(url, headers);
    const tools = await this._listTools(url, headers);

    return tools;
  }

  // 清理缓存
  clearCache() {
    _toolCache.clear();
    this._clients.clear();
  }
}

// 单例
let _instance = null;

function getMcpClientManager() {
  if (!_instance) {
    _instance = new McpClientManager();
  }
  return _instance;
}

module.exports = { McpClientManager, getMcpClientManager, toolsToOpenAIFunctions: require('./mcpToolAdapter').toolsToOpenAIFunctions };
