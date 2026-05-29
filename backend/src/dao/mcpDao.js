const { db } = require('../config/database');

const SERVERS_TABLE = 'mcp_servers';
const USER_CONFIG_TABLE = 'user_mcp_configs';

const mcpDao = {
  // ========== 全局服务器管理 ==========

  // 获取所有 MCP 服务器
  async getAllServers() {
    return db(SERVERS_TABLE).select('*').orderBy('name', 'asc');
  },

  // 获取已启用的 MCP 服务器
  async getEnabledServers() {
    return db(SERVERS_TABLE).where('enabled', true).orderBy('name', 'asc');
  },

  // 根据 ID 获取服务器
  async getServerById(id) {
    return db(SERVERS_TABLE).where('id', id).first();
  },

  // 根据名称获取服务器
  async getServerByName(name) {
    return db(SERVERS_TABLE).where('name', name).first();
  },

  // 创建 MCP 服务器
  async createServer(data) {
    const [id] = await db(SERVERS_TABLE).insert({
      name: data.name,
      transport: data.transport || 'http',
      command: data.command || null,
      args: data.args || null,
      url: data.url || null,
      headers: data.headers || null,
      enabled: data.enabled !== undefined ? data.enabled : true,
      description: data.description || null,
    });
    return this.getServerById(id);
  },

  // 更新 MCP 服务器
  async updateServer(id, data) {
    const allowedFields = [
      'name', 'transport', 'command', 'args',
      'url', 'headers', 'enabled', 'description',
    ];
    const updateData = {};
    allowedFields.forEach(f => {
      if (data[f] !== undefined) updateData[f] = data[f];
    });
    updateData.updated_at = db.fn.now();

    await db(SERVERS_TABLE).where('id', id).update(updateData);
    return this.getServerById(id);
  },

  // 删除 MCP 服务器
  async removeServer(id) {
    return db(SERVERS_TABLE).where('id', id).del();
  },

  // ========== 用户 MCP 配置管理 ==========

  // 获取用户的所有 MCP 配置（含服务器信息）
  async getUserConfigs(userId) {
    return db(USER_CONFIG_TABLE)
      .join(SERVERS_TABLE, `${USER_CONFIG_TABLE}.server_id`, `${SERVERS_TABLE}.id`)
      .where(`${USER_CONFIG_TABLE}.user_id`, userId)
      .select(
        `${SERVERS_TABLE}.*`,
        `${USER_CONFIG_TABLE}.id as config_id`,
        `${USER_CONFIG_TABLE}.enabled as user_enabled`,
        `${USER_CONFIG_TABLE}.api_key as user_api_key`,
        `${USER_CONFIG_TABLE}.extra_config as user_extra_config`
      );
  },

  // 获取用户特定服务器的配置
  async getUserConfig(userId, serverId) {
    return db(USER_CONFIG_TABLE)
      .where('user_id', userId)
      .andWhere('server_id', serverId)
      .first();
  },

  // 插入或更新用户 MCP 配置
  async upsertUserConfig(userId, serverId, data) {
    const existing = await this.getUserConfig(userId, serverId);
    if (existing) {
      const updateData = {};
      if (data.enabled !== undefined) updateData.enabled = data.enabled;
      if (data.api_key !== undefined) updateData.api_key = data.api_key;
      if (data.extra_config !== undefined) updateData.extra_config = data.extra_config;
      updateData.updated_at = db.fn.now();

      await db(USER_CONFIG_TABLE).where('id', existing.id).update(updateData);
      return this.getUserConfig(userId, serverId);
    } else {
      const [id] = await db(USER_CONFIG_TABLE).insert({
        user_id: userId,
        server_id: serverId,
        enabled: data.enabled !== undefined ? data.enabled : true,
        api_key: data.api_key || null,
        extra_config: data.extra_config || null,
      });
      return db(USER_CONFIG_TABLE).where('id', id).first();
    }
  },

  // 删除用户的 MCP 配置
  async deleteUserConfig(userId, serverId) {
    return db(USER_CONFIG_TABLE)
      .where('user_id', userId)
      .andWhere('server_id', serverId)
      .del();
  },

  // 删除用户的所有 MCP 配置
  async deleteAllForUser(userId) {
    return db(USER_CONFIG_TABLE).where('user_id', userId).del();
  },

  // 获取用户的 MCP 服务器视图（含所有全局服务器 + 用户个人配置状态）
  async getServersForUser(userId) {
    const allServers = await this.getAllServers();
    const userConfigs = await this.getUserConfigs(userId);
    const configMap = {};
    userConfigs.forEach(uc => {
      configMap[uc.id] = uc;
    });

    return allServers.map(server => ({
      ...server,
      user_enabled: configMap[server.id]?.user_enabled ?? null,
      user_api_key: configMap[server.id]?.user_api_key ?? null,
      user_extra_config: configMap[server.id]?.user_extra_config ?? null,
    }));
  },
};

module.exports = mcpDao;
