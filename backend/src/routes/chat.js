const { Router } = require('express');
const { z } = require('zod');
const authenticate = require('../middleware/authenticate');
const { checkTokenQuota } = require('../middleware/tokenCounter');
const { getRateLimiter } = require('../middleware/rateLimiter');
const agentService = require('../services/agentService');
const chatDao = require('../dao/chatDao');
const { parsePositiveInt } = require('../utils/requestParser');

const router = Router();
const MAX_CHAT_MESSAGE_LENGTH = 8000;

// 所有路由都需要认证
router.use(authenticate);

// ========== 对话 CRUD（无需限流/配额） ==========

// GET /api/chat/conversations — 获取对话列表
router.get('/conversations', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const result = await chatDao.listByUser(req.user.id, { page, limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || '获取对话列表失败' });
  }
});

// POST /api/chat/conversations — 新建对话
router.post('/conversations', async (req, res) => {
  try {
    const body = z.object({
      title: z.string().min(1).max(200).default('新对话'),
    }).parse(req.body);
    const id = await chatDao.create(req.user.id, body.title);
    res.status(201).json({ id, title: body.title });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: '参数错误', details: err.errors });
    }
    res.status(500).json({ error: err.message || '创建对话失败' });
  }
});

// GET /api/chat/conversations/:id — 获取对话详情（含消息列表）
router.get('/conversations/:id', async (req, res) => {
  try {
    const convId = parsePositiveInt(req.params.id, '对话ID');
    const conv = await chatDao.findById(convId, req.user.id);
    if (!conv) return res.status(404).json({ error: '对话不存在' });
    const messages = await chatDao.listMessages(convId);
    res.json({ ...conv, messages });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取对话失败' });
  }
});

// DELETE /api/chat/conversations/:id — 删除对话
router.delete('/conversations/:id', async (req, res) => {
  try {
    const convId = parsePositiveInt(req.params.id, '对话ID');
    const conv = await chatDao.findById(convId, req.user.id);
    if (!conv) return res.status(404).json({ error: '对话不存在' });
    await chatDao.remove(convId, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '删除对话失败' });
  }
});

// ========== SSE 对话端点（需限流+配额） ==========

// 动态限流（按用户组）
const withRateLimit = (req, res, next) => {
  const groupName = req.user?.group_name || 'default';
  getRateLimiter(groupName)(req, res, next);
};

// POST /api/chat — 发送消息并获取AI流式回复
router.post('/', withRateLimit, checkTokenQuota, async (req, res) => {
  try {
    const body = z.object({
      message: z.string().trim().min(1, '请输入对话内容').max(MAX_CHAT_MESSAGE_LENGTH, `对话内容不能超过${MAX_CHAT_MESSAGE_LENGTH}字`),
      conversationId: z.union([z.number(), z.string()]).optional().nullable(),
    }).passthrough().parse(req.body);

    let conversationId = null;
    if (body.conversationId !== undefined && body.conversationId !== null && body.conversationId !== '') {
      conversationId = parsePositiveInt(body.conversationId, '对话ID');
      const conv = await chatDao.findById(conversationId, req.user.id);
      if (!conv) return res.status(404).json({ error: '对话不存在' });
    }

    const task = await agentService.chat(req.user.id, body.message, conversationId);
    task.execute(req, res);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors?.[0]?.message || '参数错误', details: err.errors });
    }
    res.status(err.status || 500).json({ error: err.message || '对话请求失败' });
  }
});

module.exports = router;
