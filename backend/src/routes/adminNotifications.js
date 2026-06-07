const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const notificationDao = require('../dao/notificationDao');
const { parsePositiveInt } = require('../utils/requestParser');

const router = Router();
router.use(authenticate);
router.use(authorize('admin'));

// 获取所有通知（分页）
router.get('/notifications', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const enabled = req.query.enabled !== undefined ? req.query.enabled === 'true' : undefined;
    const result = await notificationDao.list({ page, limit, enabled });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '获取通知列表失败' });
  }
});

// 获取单条通知
router.get('/notifications/:id', async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id, '通知ID');
    const notification = await notificationDao.getById(id);
    if (!notification) return res.status(404).json({ error: '通知不存在' });
    res.json({ notification });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取通知失败' });
  }
});

// 创建通知
router.post('/notifications', async (req, res) => {
  try {
    const { title, content, show_popup, show_banner, enabled, sort_order } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: '请填写通知标题' });
    if (!content || !content.trim()) return res.status(400).json({ error: '请填写通知内容' });
    const notification = await notificationDao.create({
      title: title.trim(),
      content: content.trim(),
      show_popup: !!show_popup,
      show_banner: !!show_banner,
      enabled: enabled !== false,
      sort_order: parseInt(sort_order, 10) || 0,
    });
    res.status(201).json({ notification });
  } catch (err) {
    res.status(500).json({ error: '创建通知失败' });
  }
});

// 更新通知
router.put('/notifications/:id', async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id, '通知ID');
    const existing = await notificationDao.getById(id);
    if (!existing) return res.status(404).json({ error: '通知不存在' });
    const { title, content, show_popup, show_banner, enabled, sort_order } = req.body;
    const data = {};
    if (title !== undefined) data.title = title.trim();
    if (content !== undefined) data.content = content.trim();
    if (show_popup !== undefined) data.show_popup = !!show_popup;
    if (show_banner !== undefined) data.show_banner = !!show_banner;
    if (enabled !== undefined) data.enabled = !!enabled;
    if (sort_order !== undefined) data.sort_order = parseInt(sort_order, 10) || 0;
    const notification = await notificationDao.update(id, data);
    res.json({ notification });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '更新通知失败' });
  }
});

// 删除通知
router.delete('/notifications/:id', async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id, '通知ID');
    const existing = await notificationDao.getById(id);
    if (!existing) return res.status(404).json({ error: '通知不存在' });
    await notificationDao.delete(id);
    res.json({ success: true, message: '通知已删除' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '删除通知失败' });
  }
});

module.exports = router;
