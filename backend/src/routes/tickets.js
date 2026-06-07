const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const ticketService = require('../services/ticketService');
const { parsePositiveInt, parsePagination } = require('../utils/requestParser');

const router = Router();
router.use(authenticate);

// 获取当前用户自己的工单列表。
router.get('/', async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
    const result = await ticketService.listUserTickets(req.user.id, {
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

// 创建普通工单；申诉工单由封禁申诉流程自动创建。
router.post('/', async (req, res) => {
  try {
    const result = await ticketService.createUserTicket(req.user.id, req.body || {});
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '创建工单失败' });
  }
});

// 获取工单详情和回复记录。
router.get('/:id', async (req, res) => {
  try {
    const ticketId = parsePositiveInt(req.params.id, '工单ID');
    const result = await ticketService.getUserTicket(req.user.id, ticketId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取工单详情失败' });
  }
});

// 用户继续回复工单，多轮沟通时会把状态重新置为待处理。
router.post('/:id/replies', async (req, res) => {
  try {
    const ticketId = parsePositiveInt(req.params.id, '工单ID');
    const result = await ticketService.replyAsUser(req.user.id, ticketId, req.body || {});
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '回复工单失败' });
  }
});

// 用户关闭自己的普通工单。
router.post('/:id/close', async (req, res) => {
  try {
    const ticketId = parsePositiveInt(req.params.id, '工单ID');
    const result = await ticketService.closeUserTicket(req.user.id, ticketId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '关闭工单失败' });
  }
});

module.exports = router;
