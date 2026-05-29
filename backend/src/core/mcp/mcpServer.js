// MCP 服务端实现
// 将本平台的写作功能暴露为 MCP 工具，供外部 AI 应用调用

const { createLogger } = require('../../utils/logger');

const logger = createLogger('mcp-server');

// 平台 MCP 服务器元信息
const SERVER_INFO = {
  name: 'bookagent-novel-platform',
  version: '2.0.0',
};

// 支持的协议版本
const PROTOCOL_VERSION = '2024-11-05';

// 工具定义（OpenAI / MCP 兼容格式）
const PLATFORM_TOOLS = [
  {
    name: 'list_novels',
    description: '列出用户的所有小说项目，包括标题、类型、状态和创建时间',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回数量上限，默认 20' },
        status: { type: 'string', description: '按状态筛选：draft/outline/characters/chapters_outline/writing/completed' },
      },
    },
  },
  {
    name: 'get_novel',
    description: '获取指定小说的完整信息，包括大纲、角色列表和章节列表',
    inputSchema: {
      type: 'object',
      properties: {
        novel_id: { type: 'number', description: '小说 ID' },
      },
      required: ['novel_id'],
    },
  },
  {
    name: 'create_novel',
    description: '创建新的小说项目',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '小说标题' },
        genre: { type: 'string', description: '小说类型' },
        description: { type: 'string', description: '一句话描述' },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_characters',
    description: '获取指定小说的所有角色信息',
    inputSchema: {
      type: 'object',
      properties: {
        novel_id: { type: 'number', description: '小说 ID' },
      },
      required: ['novel_id'],
    },
  },
  {
    name: 'get_chapters',
    description: '获取指定小说的所有章节信息，包括大纲和内容状态',
    inputSchema: {
      type: 'object',
      properties: {
        novel_id: { type: 'number', description: '小说 ID' },
      },
      required: ['novel_id'],
    },
  },
];

// 处理 JSON-RPC 请求
async function handleJsonRpc(request, context) {
  const { method, params, id } = request;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {
              tools: {},
            },
            serverInfo: SERVER_INFO,
          },
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: PLATFORM_TOOLS,
          },
        };

      case 'tools/call':
        return {
          jsonrpc: '2.0',
          id,
          result: await _executeTool(params.name, params.arguments, context),
        };

      case 'notifications/initialized':
        // 通知不需要响应
        return null;

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `未知方法：${method}` },
        };
    }
  } catch (err) {
    logger.error(`MCP 请求处理失败：${err.message}`);
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: err.message },
    };
  }
}

// 执行工具调用
async function _executeTool(toolName, args, context) {
  const { userId } = context;

  switch (toolName) {
    case 'list_novels': {
      const novelDao = require('../../dao/novelDao');
      const novels = await novelDao.findByUserId(userId);
      const limit = args?.limit || 20;
      const filtered = args?.status
        ? novels.filter(n => n.status === args.status).slice(0, limit)
        : novels.slice(0, limit);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(filtered.map(n => ({
            id: n.id,
            title: n.title,
            genre: n.genre,
            status: n.status,
            current_step: n.current_step,
            created_at: n.created_at,
            updated_at: n.updated_at,
          })), null, 2),
        }],
      };
    }

    case 'get_novel': {
      if (!args?.novel_id) throw new Error('缺少 novel_id 参数');
      const novelDao = require('../../dao/novelDao');
      const chapterDao = require('../../dao/chapterDao');
      const characterDao = require('../../dao/characterDao');

      const novel = await novelDao.findById(args.novel_id);
      if (!novel) throw new Error('小说不存在');

      const [chapters, characters] = await Promise.all([
        chapterDao.findByNovelId(novel.id),
        characterDao.findByNovelId(novel.id),
      ]);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ...novel, chapters, characters }, null, 2),
        }],
      };
    }

    case 'create_novel': {
      if (!args?.title) throw new Error('缺少 title 参数');
      const novelDao = require('../../dao/novelDao');
      const novel = await novelDao.create({
        user_id: userId,
        title: args.title,
        genre: args.genre || '',
        status: 'draft',
        current_step: 0,
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ id: novel.id, title: novel.title, message: '小说项目创建成功' }, null, 2),
        }],
      };
    }

    case 'get_characters': {
      if (!args?.novel_id) throw new Error('缺少 novel_id 参数');
      const characterDao = require('../../dao/characterDao');
      const characters = await characterDao.findByNovelId(args.novel_id);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(characters, null, 2),
        }],
      };
    }

    case 'get_chapters': {
      if (!args?.novel_id) throw new Error('缺少 novel_id 参数');
      const chapterDao = require('../../dao/chapterDao');
      const chapters = await chapterDao.findByNovelId(args.novel_id);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(chapters, null, 2),
        }],
      };
    }

    default:
      throw new Error(`未知工具：${toolName}`);
  }
}

module.exports = { handleJsonRpc, PLATFORM_TOOLS, SERVER_INFO };
