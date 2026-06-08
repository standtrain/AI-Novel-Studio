// MCP client manager. Handles remote MCP initialization, tool discovery and tool calls.
const { createLogger } = require('../../utils/logger');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const logger = createLogger('mcp-client');

const _toolCache = new Map();
const CACHE_TTL = 300000;
const REQUEST_TIMEOUT_MS = 30000;

class McpClientManager {
  constructor() {
    this._clients = new Map();
    this._endpoints = new Map();
  }

  _serverKey(serverConfig) {
    const identity = JSON.stringify({
      url: serverConfig.url || '',
      headers: serverConfig.headers || {},
      userApiKey: serverConfig.user_api_key ? '__configured__' : '',
      userExtraConfig: serverConfig.user_extra_config || {},
    });
    const fingerprint = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 16);
    return `mcp:${serverConfig.id || serverConfig.name}:${serverConfig.transport}:${fingerprint}`;
  }

  _buildHeaders(serverConfig) {
    const headers = { 'Content-Type': 'application/json' };
    if (serverConfig.headers) {
      const hdrs = typeof serverConfig.headers === 'string'
        ? JSON.parse(serverConfig.headers)
        : serverConfig.headers;
      if (hdrs && typeof hdrs === 'object') {
        Object.assign(headers, hdrs);
      }
    }
    return headers;
  }

  _request(method, url, headers, body) {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(url);
      } catch (err) {
        reject(new Error('MCP server URL is invalid'));
        return;
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        reject(new Error('MCP client only supports HTTP and SSE transports'));
        return;
      }

      const payload = body ? JSON.stringify(body) : null;
      const requestHeaders = Object.assign({}, headers || {});
      if (payload) {
        requestHeaders['Content-Length'] = Buffer.byteLength(payload);
      }

      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request({
        method,
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        headers: requestHeaders,
        timeout: REQUEST_TIMEOUT_MS,
      }, (res) => {
        const chunks = [];
        res.setEncoding('utf8');
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
            text: chunks.join(''),
          });
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('MCP request timed out'));
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async _resolveRequestUrl(serverConfig, headers) {
    const url = serverConfig.url;
    if (!url) throw new Error('MCP server URL is not configured');
    if (serverConfig.transport !== 'sse') return url;

    const key = this._serverKey(serverConfig);
    const cached = this._endpoints.get(key);
    if (cached) return cached;

    const endpoint = await this._fetchSseEndpoint(url, headers);
    this._endpoints.set(key, endpoint);
    return endpoint;
  }

  _fetchSseEndpoint(url, headers) {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(url);
      } catch (err) {
        reject(new Error('MCP server URL is invalid'));
        return;
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        reject(new Error('MCP SSE client only supports HTTP URLs'));
        return;
      }

      let settled = false;
      let body = '';
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request({
        method: 'GET',
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        headers: headers || {},
        timeout: REQUEST_TIMEOUT_MS,
      }, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          settled = true;
          reject(new Error(`SSE HTTP ${res.statusCode}: ${res.statusMessage}`));
          res.resume();
          return;
        }

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (settled) return;
          body += chunk;
          const endpoint = this._findSseEndpoint(body, url);
          if (endpoint) {
            settled = true;
            resolve(endpoint);
            req.destroy();
          }
        });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          try {
            resolve(this._parseSseEndpoint(body, url));
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('MCP SSE endpoint discovery timed out'));
      });
      req.on('error', (err) => {
        if (!settled) reject(err);
      });
      req.end();
    });
  }

  _findSseEndpoint(body, sourceUrl) {
    try {
      return this._parseSseEndpoint(body, sourceUrl);
    } catch (err) {
      return null;
    }
  }

  _parseSseEndpoint(body, sourceUrl) {
    const lines = String(body || '').split(/\r?\n/);
    let eventName = null;

    for (const line of lines) {
      if (line.indexOf('event:') === 0) {
        eventName = line.slice(6).trim();
        continue;
      }

      if (eventName === 'endpoint' && line.indexOf('data:') === 0) {
        const endpoint = line.slice(5).trim();
        if (!endpoint) break;
        try {
          return new URL(endpoint, sourceUrl).toString();
        } catch (err) {
          throw new Error('SSE endpoint URL is invalid');
        }
      }
    }

    throw new Error('SSE server did not return an endpoint event');
  }

  async _sendJsonRpc(url, headers, method, params) {
    const response = await this._request('POST', url, headers, {
      jsonrpc: '2.0',
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      method,
      params: params || {},
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
    }
    if (!response.text) {
      throw new Error(`MCP method ${method} did not return a JSON-RPC response`);
    }

    let data;
    try {
      data = JSON.parse(response.text);
    } catch (err) {
      throw new Error(`MCP method ${method} returned invalid JSON`);
    }

    if (data.error) {
      throw new Error(data.error.message || 'JSON-RPC error');
    }

    return data.result;
  }

  async _sendJsonRpcNotification(url, headers, method, params) {
    const response = await this._request('POST', url, headers, {
      jsonrpc: '2.0',
      method,
      params: params || {},
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
    }
  }

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

    await this._sendJsonRpcNotification(url, headers, 'notifications/initialized', {});
    return result;
  }

  async _listTools(url, headers) {
    const result = await this._sendJsonRpc(url, headers, 'tools/list', {});
    return result && Array.isArray(result.tools) ? result.tools : [];
  }

  async _ensureInitialized(serverConfig, headers) {
    const key = this._serverKey(serverConfig);
    const url = await this._resolveRequestUrl(serverConfig, headers);

    if (!this._clients.has(key)) {
      await this._initialize(url, headers);
      this._clients.set(key, true);
    }

    return { key, url };
  }

  async callTool(serverConfig, toolName, args) {
    const headers = this._buildHeaders(serverConfig);
    let key = null;

    try {
      const initialized = await this._ensureInitialized(serverConfig, headers);
      key = initialized.key;

      return await this._sendJsonRpc(initialized.url, headers, 'tools/call', {
        name: toolName,
        arguments: args || {},
      });
    } catch (err) {
      this._clients.delete(key || this._serverKey(serverConfig));
      throw err;
    }
  }

  async getTools(serverConfig) {
    const key = this._serverKey(serverConfig);
    const cached = _toolCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.tools;
    }

    if (!serverConfig.url) {
      logger.warn(`MCP server "${serverConfig.name}" has no URL configured, skipping`);
      return [];
    }

    const headers = this._buildHeaders(serverConfig);

    try {
      const initialized = await this._ensureInitialized(serverConfig, headers);
      const tools = await this._listTools(initialized.url, headers);
      _toolCache.set(key, { tools, expiresAt: Date.now() + CACHE_TTL });
      return tools;
    } catch (err) {
      logger.error(`Failed to fetch MCP tools from "${serverConfig.name}": ${err.message}`);
      this._clients.delete(key);
      return [];
    }
  }

  async testServer(serverConfig) {
    const headers = this._buildHeaders(serverConfig);
    const initialized = await this._ensureInitialized(serverConfig, headers);
    return this._listTools(initialized.url, headers);
  }

  clearCache() {
    _toolCache.clear();
    this._clients.clear();
    this._endpoints.clear();
  }
}

let _instance = null;

function getMcpClientManager() {
  if (!_instance) {
    _instance = new McpClientManager();
  }
  return _instance;
}

module.exports = {
  McpClientManager,
  getMcpClientManager,
  toolsToOpenAIFunctions: require('./mcpToolAdapter').toolsToOpenAIFunctions,
};
