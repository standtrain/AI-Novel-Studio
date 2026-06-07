const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const ticketService = require('../services/ticketService');
const { parsePositiveInt, parsePagination } = require('../utils/requestParser');

const router = Router();
router.use(authenticate);
router.use(authorize('admin'));

// 获取普通工单AI回复模式，配置入口放在工单管理的申诉审核模块中。
router.get('/ticket-ai-reply-mode', async (_req, res) => {
  try {
    const config = await ticketService.getAiReplyModeConfig();
    res.json(config);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取工单AI回复模式失败' });
  }
});

// 设置普通工单AI回复模式，仅管理员可操作。
router.put('/ticket-ai-reply-mode', async (req, res) => {
  try {
    const result = await ticketService.setAiReplyModeConfig(req.body.mode);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '设置工单AI回复模式失败' });
  }
});

// 管理员查看全部工单，支持紧急度、状态和关键词筛选。
router.get('/tickets', async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
    const result = await ticketService.listAdminTickets({
      page,
      limit,
      type: req.query.type,
      priority: req.query.priority,
      status: req.query.status,
      q: req.query.q,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取工单列表失败' });
  }
});

router.get('/tickets/:id', async (req, res) => {
  try {
    const ticketId = parsePositiveInt(req.params.id, '工单ID');
    const result = await ticketService.getAdminTicket(ticketId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取工单详情失败' });
  }
});

router.post('/tickets/:id/replies', async (req, res) => {
  try {
    const ticketId = parsePositiveInt(req.params.id, '工单ID');
    const result = await ticketService.replyAsAdmin(ticketId, req.user.id, req.body || {});
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '回复工单失败' });
  }
});

router.post('/tickets/:id/resolve', async (req, res) => {
  try {
    const ticketId = parsePositiveInt(req.params.id, '工单ID');
    const result = await ticketService.resolveTicket(ticketId, req.user.id, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '处理工单失败' });
  }
});

router.post('/tickets/:id/ai-reply', async (req, res) => {
  try {
    const ticketId = parsePositiveInt(req.params.id, '工单ID');
    const result = await ticketService.generateAiReply(ticketId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '生成AI回复失败' });
  }
});

module.exports = router;
