const mcpDao = require('../dao/mcpDao');
const { createLogger } = require('../utils/logger');

const logger = createLogger('mcp');

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
    if (!data.name) throw { status: 400, message: '服务器名称为必填项' };
    const existing = await mcpDao.getServerByName(data.name);
    if (existing) throw { status: 409, message: '服务器名称已存在' };

    if (data.transport === 'http' || data.transport === 'sse') {
      if (!data.url) throw { status: 400, message: 'HTTP/SSE 传输模式需要提供 URL' };
    }
    if (data.transport === 'stdio') {
      if (!data.command) throw { status: 400, message: 'stdio 传输模式需要提供 command' };
    }

    return mcpDao.createServer(data);
  },

  async updateServer(id, data) {
    const server = await mcpDao.getServerById(id);
    if (!server) throw { status: 404, message: 'MCP 服务器不存在' };
    if (data.name && data.name !== server.name) {
      const existing = await mcpDao.getServerByName(data.name);
      if (existing) throw { status: 409, message: '服务器名称已存在' };
    }
    return mcpDao.updateServer(id, data);
  },

  async deleteServer(id) {
    const server = await mcpDao.getServerById(id);
    if (!server) throw { status: 404, message: 'MCP 服务器不存在' };
    return mcpDao.removeServer(id);
  },

  // ========== 用户 MCP 配置管理 ==========

  async getUserServers(userId) {
    return mcpDao.getServersForUser(userId);
  },

  async saveUserConfig(userId, serverId, data) {
    const server = await mcpDao.getServerById(serverId);
    if (!server) throw { status: 404, message: 'MCP 服务器不存在' };
    return mcpDao.upsertUserConfig(userId, serverId, data);
  },

  async deleteUserConfig(userId, serverId) {
    return mcpDao.deleteUserConfig(userId, serverId);
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
  async getAvailableUserTools(userId) {
    try {
      const userConfigs = await mcpDao.getUserConfigs(userId);
      const enabledConfigs = userConfigs.filter(uc => {
        // 全局服务器启用 + 用户未禁用
        return uc.enabled !== false && uc.user_enabled !== false;
      });

      if (enabledConfigs.length === 0) return [];

      const { getMcpClientManager, toolsToOpenAIFunctions } = require('../core/mcp/mcpClient');
      const manager = getMcpClientManager();

      const allTools = [];
      for (const config of enabledConfigs) {
        try {
          // API Key 由管理员在 headers 中统一配置
          const serverConfig = { ...config };
          if (config.headers && typeof config.headers === 'string') {
            serverConfig.headers = JSON.parse(config.headers);
          }
          const tools = await manager.getTools(serverConfig);
          allTools.push(...tools);
        } catch (err) {
          logger.warn(`获取 MCP 服务器 "${config.name}" 工具失败：${err.message}`);
          // 单个服务器失败不影响其他服务器
        }
      }

      return toolsToOpenAIFunctions(allTools);
    } catch (err) {
      logger.error('获取用户 MCP 工具失败：' + err.message);
      return []; // 优雅降级
    }
  },
};

module.exports = mcpService;
