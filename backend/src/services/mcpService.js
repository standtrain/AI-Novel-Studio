const mcpDao = require('../dao/mcpDao');
const { createLogger } = require('../utils/logger');

const logger = createLogger('mcp');

function _parseObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function _parseJsonObjectStrict(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') {
    throw { status: 400, message: `${fieldName} 必须是 JSON 对象` };
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not object');
    }
    return parsed;
  } catch {
    throw { status: 400, message: `${fieldName} JSON 格式无效，请填写类似 {"Authorization":"Bearer xxx"} 的对象` };
  }
}

function _parseJsonArrayStrict(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') {
    throw { status: 400, message: `${fieldName} 必须是 JSON 数组` };
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('not array');
    return parsed;
  } catch {
    throw { status: 400, message: `${fieldName} JSON 格式无效，请填写类似 ["-y","pkg"] 的数组` };
  }
}

function _normalizeUrl(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).replace(/\s+/g, '').replace(/^https?:\/\//i, (m) => m.toLowerCase());
  const fixed = text.replace(/^https:\/(?!\/)/i, 'https://').replace(/^http:\/(?!\/)/i, 'http://');
  try {
    const parsed = new URL(fixed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
    return parsed.toString();
  } catch {
    throw { status: 400, message: 'URL 格式无效，请填写 https://example.com/mcp' };
  }
}

function _normalizeServerPayload(data) {
  const payload = { ...data };
  if (payload.name !== undefined) payload.name = String(payload.name || '').trim();
  if (payload.transport !== undefined) payload.transport = String(payload.transport || 'http').trim();
  if (payload.url !== undefined) payload.url = _normalizeUrl(payload.url);
  if (payload.command !== undefined) payload.command = payload.command ? String(payload.command).trim() : null;
  if (payload.args !== undefined) payload.args = _parseJsonArrayStrict(payload.args, 'args');
  if (payload.headers !== undefined) payload.headers = _parseJsonObjectStrict(payload.headers, 'headers');
  if (payload.description !== undefined) payload.description = payload.description ? String(payload.description).trim() : null;
  return payload;
}

function _maskSecret(value) {
  if (!value) return null;
  const text = String(value);
  return text.length <= 8 ? '••••' : `••••${text.slice(-4)}`;
}

function _hasObjectKeys(value) {
  const parsed = _parseObject(value);
  return Object.keys(parsed).length > 0;
}

function _maskHeaders(headers) {
  const parsed = _parseObject(headers);
  return Object.keys(parsed).length > 0 ? { configured: 'true' } : null;
}

function _maskExtraConfig(extraConfig) {
  const parsed = _parseObject(extraConfig, null);
  if (!parsed) return null;
  const masked = { ...parsed };
  if (masked.api_key) masked.api_key = _maskSecret(masked.api_key);
  if (masked.apiKey) masked.apiKey = _maskSecret(masked.apiKey);
  if (masked.headers && _hasObjectKeys(masked.headers)) {
    masked.headers = _maskHeaders(masked.headers);
  }
  return masked;
}

function _sanitizeUserConfigResult(result) {
  if (!result) return result;
  return {
    ...result,
    api_key: _maskSecret(result.api_key),
    extra_config: _maskExtraConfig(result.extra_config),
  };
}

function _clearMcpRuntimeCache() {
  try {
    const { getMcpClientManager } = require('../core/mcp/mcpClient');
    getMcpClientManager().clearCache();
  } catch { /* MCP 运行时缓存清理失败不阻塞配置保存 */ }
}

function _validateUserConfig(data) {
  if (data.enabled !== undefined && typeof data.enabled !== 'boolean') {
    throw { status: 400, message: 'enabled 必须是布尔值' };
  }
  if (data.api_key !== undefined && data.api_key !== null) {
    if (typeof data.api_key !== 'string' || data.api_key.length > 500) {
      throw { status: 400, message: 'API Key 格式不正确' };
    }
  }
  if (data.extra_config !== undefined && data.extra_config !== null && typeof data.extra_config !== 'object') {
    throw { status: 400, message: 'extra_config 必须是对象' };
  }
}

function _isEnabledValue(value, defaultValue = true) {
  if (value === undefined || value === null) return defaultValue;
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return Boolean(value);
}

function _isServerEnabledForUser(server) {
  return _isEnabledValue(server.enabled, true) && _isEnabledValue(server.user_enabled, true);
}

function _buildRuntimeServerConfig(config) {
  const globalHeaders = _parseObject(config.headers);
  const userExtraConfig = _parseObject(config.user_extra_config);
  const userHeaders = _parseObject(userExtraConfig.headers);
  const headers = { ...globalHeaders, ...userHeaders };

  // 用户级密钥只参与后端请求，不会暴露给模型；没有个人密钥时继续使用管理员配置的请求头。
  const userApiKey = config.user_api_key || userExtraConfig.api_key || userExtraConfig.apiKey;
  if (userApiKey) {
    headers.Authorization = `Bearer ${userApiKey}`;
  }

  return {
    ...config,
    headers,
    user_extra_config: userExtraConfig,
  };
}

const mcpService = {
  // ========== 全局服务器管理（管理员） ==========

  async getGlobalServers() {
    return mcpDao.getAllServers();
  },

  async getServerById(id) {
    const server = await mcpDao.getServerById(id);
    if (!server) throw { status: 404, message: 'MCP 服务器不存在' };
    return server;
  },

  async createServer(data) {
    data = _normalizeServerPayload(data);
    if (!data.name) throw { status: 400, message: '服务器名称为必填项' };
    const existing = await mcpDao.getServerByName(data.name);
    if (existing) throw { status: 409, message: '服务器名称已存在' };

    if (data.transport === 'http' || data.transport === 'sse') {
      if (!data.url) throw { status: 400, message: 'HTTP/SSE 传输模式需要提供 URL' };
    }
    if (data.transport === 'stdio') {
      if (!data.command) throw { status: 400, message: 'stdio 传输模式需要提供 command' };
    }

    const server = await mcpDao.createServer(data);
    _clearMcpRuntimeCache();
    return server;
  },

  async updateServer(id, data) {
    data = _normalizeServerPayload(data);
    const server = await mcpDao.getServerById(id);
    if (!server) throw { status: 404, message: 'MCP 服务器不存在' };
    if (data.name && data.name !== server.name) {
      const existing = await mcpDao.getServerByName(data.name);
      if (existing) throw { status: 409, message: '服务器名称已存在' };
    }
    const updatedServer = await mcpDao.updateServer(id, data);
    _clearMcpRuntimeCache();
    return updatedServer;
  },

  async deleteServer(id) {
    const server = await mcpDao.getServerById(id);
    if (!server) throw { status: 404, message: 'MCP 服务器不存在' };
    const result = await mcpDao.removeServer(id);
    _clearMcpRuntimeCache();
    return result;
  },

  // ========== 用户 MCP 配置管理 ==========

  async getUserServers(userId) {
    const servers = await mcpDao.getServersForUser(userId);
    return servers.map(server => ({
      ...server,
      headers: _maskHeaders(server.headers),
      user_api_key: _maskSecret(server.user_api_key),
      user_extra_config: _maskExtraConfig(server.user_extra_config),
    }));
  },

  async saveUserConfig(userId, serverId, data) {
    _validateUserConfig(data);
    const server = await mcpDao.getServerById(serverId);
    if (!server) throw { status: 404, message: 'MCP 服务器不存在' };
    const result = await mcpDao.upsertUserConfig(userId, serverId, data);
    _clearMcpRuntimeCache();
    return _sanitizeUserConfigResult(result);
  },

  async deleteUserConfig(userId, serverId) {
    const result = await mcpDao.deleteUserConfig(userId, serverId);
    _clearMcpRuntimeCache();
    return result;
  },

  // ========== 测试 MCP 服务器连接 ==========

  async testConnection(serverId) {
    const server = await mcpDao.getServerById(serverId);
    if (!server) throw { status: 404, message: 'MCP 服务器不存在' };

    try {
      // 尝试连接并列出工具
      const { getMcpClientManager } = require('../core/mcp/mcpClient');
      const manager = getMcpClientManager();
      const tools = await manager.testServer(server);
      return { success: true, tools: tools.map(t => t.name), toolCount: tools.length };
    } catch (err) {
      logger.error(`MCP 服务器 "${server.name}" 连接测试失败：${err.message}`);
      return { success: false, message: err.message };
    }
  },

  // ========== 获取用户可用的 MCP 工具列表（OpenAI 格式） ==========

  /**
   * 获取用户所有已连接 MCP 服务器的工具列表（转换为 OpenAI Function Calling 格式）
   * @param {number} userId - 用户 ID
   * @returns {Promise<Array>} OpenAI 工具格式数组
   */
  async getAvailableUserToolRuntime(userId) {
    try {
      const userServers = await mcpDao.getServersForUser(userId);
      const enabledConfigs = userServers.filter(_isServerEnabledForUser);

      if (enabledConfigs.length === 0) return { openaiTools: [], toolServers: {} };

      const { getMcpClientManager, toolsToOpenAIFunctions } = require('../core/mcp/mcpClient');
      const manager = getMcpClientManager();

      const allTools = [];
      const toolServers = {};
      const seenToolNames = new Set();
      for (const config of enabledConfigs) {
        try {
          const serverConfig = _buildRuntimeServerConfig(config);
          const tools = await manager.getTools(serverConfig);
          for (const tool of tools) {
            if (!tool?.name) continue;
            if (seenToolNames.has(tool.name)) {
              logger.warn(`MCP 工具 "${tool.name}" 名称重复，已保留优先匹配的服务器`);
              continue;
            }
            seenToolNames.add(tool.name);
            toolServers[tool.name] = serverConfig;
            allTools.push(tool);
          }
        } catch (err) {
          logger.warn(`获取 MCP 服务器 "${config.name}" 工具失败：${err.message}`);
          // 单个服务器失败不影响其他服务器
        }
      }

      return {
        openaiTools: toolsToOpenAIFunctions(allTools),
        toolServers,
      };
    } catch (err) {
      logger.error('获取用户 MCP 工具失败：' + err.message);
      return { openaiTools: [], toolServers: {} }; // 优雅降级
    }
  },

  async getAvailableUserTools(userId) {
    const runtime = await this.getAvailableUserToolRuntime(userId);
    return runtime.openaiTools;
  },
};

module.exports = mcpService;
