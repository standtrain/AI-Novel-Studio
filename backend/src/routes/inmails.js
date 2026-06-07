const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const inmailDao = require('../dao/inmailDao');
const { parsePositiveInt } = require('../utils/requestParser');

const router = Router();
router.use(authenticate);

// 获取未读站内信数量
router.get('/count', async (req, res) => {
  try {
    const count = await inmailDao.getUnreadCount(req.user.id);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: '获取未读数失败' });
  }
});

// 获取站内信列表
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const unreadOnly = req.query.unread === 'true';
    const result = await inmailDao.listByUser(req.user.id, { page, limit, unreadOnly });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '获取站内信失败' });
  }
});

// 标记单条已读
router.put('/:id/read', async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id, '站内信ID');
    await inmailDao.markRead(id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '标记已读失败' });
  }
});

// 全部标记已读
router.put('/read-all', async (req, res) => {
  try {
    await inmailDao.markAllRead(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '标记已读失败' });
  }
});

module.exports = router;
