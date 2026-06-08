const { db } = require('../config/database');

const SERVERS_TABLE = 'mcp_servers';
const USER_CONFIG_TABLE = 'user_mcp_configs';

function _jsonToDb(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function _jsonFromDb(value) {
  if (!value || typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function _normalizeServer(row) {
  if (!row) return row;
  return {
    ...row,
    args: _jsonFromDb(row.args),
    headers: _jsonFromDb(row.headers),
  };
}

function _normalizeUserConfig(row) {
  if (!row) return row;
  return {
    ...row,
    extra_config: _jsonFromDb(row.extra_config),
  };
}

function _normalizeUserServer(row) {
  if (!row) return row;
  return {
    ..._normalizeServer(row),
    user_extra_config: _jsonFromDb(row.user_extra_config),
  };
}

const mcpDao = {
  // ========== 全局服务器管理 ==========

  // 获取所有 MCP 服务器
  async getAllServers() {
    const rows = await db(SERVERS_TABLE).select('*').orderBy('name', 'asc');
    return rows.map(_normalizeServer);
  },

  // 获取已启用的 MCP 服务器
  async getEnabledServers() {
    const rows = await db(SERVERS_TABLE).where('enabled', true).orderBy('name', 'asc');
    return rows.map(_normalizeServer);
  },

  // 根据 ID 获取服务器
  async getServerById(id) {
    return _normalizeServer(await db(SERVERS_TABLE).where('id', id).first());
  },

  // 根据名称获取服务器
  async getServerByName(name) {
    return _normalizeServer(await db(SERVERS_TABLE).where('name', name).first());
  },

  // 创建 MCP 服务器
  async createServer(data) {
    const [id] = await db(SERVERS_TABLE).insert({
      name: data.name,
      transport: data.transport || 'http',
      command: data.command || null,
      args: _jsonToDb(data.args),
      url: data.url || null,
      headers: _jsonToDb(data.headers),
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
    if (updateData.args !== undefined) updateData.args = _jsonToDb(updateData.args);
    if (updateData.headers !== undefined) updateData.headers = _jsonToDb(updateData.headers);
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
    const rows = await db(USER_CONFIG_TABLE)
      .join(SERVERS_TABLE, `${USER_CONFIG_TABLE}.server_id`, `${SERVERS_TABLE}.id`)
      .where(`${USER_CONFIG_TABLE}.user_id`, userId)
      .select(
        `${SERVERS_TABLE}.*`,
        `${USER_CONFIG_TABLE}.id as config_id`,
        `${USER_CONFIG_TABLE}.enabled as user_enabled`,
        `${USER_CONFIG_TABLE}.api_key as user_api_key`,
        `${USER_CONFIG_TABLE}.extra_config as user_extra_config`
      );
    return rows.map(_normalizeUserServer);
  },

  // 获取用户特定服务器的配置
  async getUserConfig(userId, serverId) {
    return _normalizeUserConfig(await db(USER_CONFIG_TABLE)
      .where('user_id', userId)
      .andWhere('server_id', serverId)
      .first());
  },

  // 插入或更新用户 MCP 配置
  async upsertUserConfig(userId, serverId, data) {
    const existing = await this.getUserConfig(userId, serverId);
    if (existing) {
      const updateData = {};
      if (data.enabled !== undefined) updateData.enabled = data.enabled;
      if (data.api_key !== undefined) updateData.api_key = data.api_key;
      if (data.extra_config !== undefined) updateData.extra_config = _jsonToDb(data.extra_config);
      updateData.updated_at = db.fn.now();

      await db(USER_CONFIG_TABLE).where('id', existing.id).update(updateData);
      return this.getUserConfig(userId, serverId);
    } else {
      const [id] = await db(USER_CONFIG_TABLE).insert({
        user_id: userId,
        server_id: serverId,
        enabled: data.enabled !== undefined ? data.enabled : true,
        api_key: data.api_key || null,
        extra_config: _jsonToDb(data.extra_config),
      });
      return _normalizeUserConfig(await db(USER_CONFIG_TABLE).where('id', id).first());
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
