const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const notificationDao = require('../dao/notificationDao');
const inmailDao = require('../dao/inmailDao');
const { db } = require('../config/database');
const emailService = require('../services/emailService');
const { parsePositiveInt } = require('../utils/requestParser');
const { createLogger } = require('../utils/logger');

const logger = createLogger('admin-notifications');

const router = Router();
router.use(authenticate);
router.use(authorize('admin'));

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

// 创建/更新通知时的副作用：站内信批量写入、邮件批量发送。
// 发送状态由数据库认领，避免重复提交或接口重试导致同一条通知反复发送。
async function handleNotificationSideEffects(notification, channels = {}) {
  if (!notification.enabled) return;

  if (channels.inmail && notification.show_inmail) {
    try {
      const shouldSend = await notificationDao.markChannelSending(notification.id, 'inmail');
      if (shouldSend) {
        const users = await db('users').where('status', 'active').select('id');
        const userIds = users.map((u) => u.id);
        try {
          await inmailDao.batchCreate(userIds, {
            title: notification.title,
            content: notification.content,
            notification_id: notification.id,
          });
        } catch (err) {
          await notificationDao.clearChannelSending(notification.id, 'inmail');
          throw err;
        }
      }
    } catch (err) {
      logger.error('[通知] 站内信批量创建失败:', err.message);
    }
  }

  if (channels.email && notification.show_email) {
    try {
      const shouldSend = await notificationDao.markChannelSending(notification.id, 'email');
      if (shouldSend) {
        const users = await db('users')
          .where('status', 'active')
          .whereNotNull('email')
          .where('email', '!=', '')
          .select('email', 'username');
        // 异步批量发送，不阻塞响应；若全部失败，清除发送标记，方便修好邮件配置后重试。
        Promise.allSettled(
          users.map((u) => emailService.sendNotification(u.email, u.username, notification.title, notification.content))
        ).then(async (results) => {
          const successCount = results.filter((result) => result.status === 'fulfilled' && result.value?.success).length;
          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              logger.error(`[通知] 邮件发送失败 ${users[index].email}:`, result.reason?.message || result.reason);
            } else if (!result.value?.success) {
              logger.error(`[通知] 邮件发送失败 ${users[index].email}:`, result.value?.error || '未知错误');
            }
          });
          if (users.length > 0 && successCount === 0) {
            await notificationDao.clearChannelSending(notification.id, 'email');
          }
        }).catch(async (err) => {
          await notificationDao.clearChannelSending(notification.id, 'email');
          logger.error('[通知] 邮件批量发送失败:', err.message);
        });
      }
    } catch (err) {
      logger.error('[通知] 邮件批量发送失败:', err.message);
    }
  }
}

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
    const { title, content, show_popup, show_banner, show_inmail, show_email, enabled, sort_order } = req.body;
    if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: '请填写通知标题' });
    if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: '请填写通知内容' });
    const notification = await notificationDao.create({
      title: title.trim(),
      content: content.trim(),
      show_popup: toBoolean(show_popup),
      show_banner: toBoolean(show_banner),
      show_inmail: toBoolean(show_inmail),
      show_email: toBoolean(show_email),
      enabled: enabled === undefined ? true : toBoolean(enabled),
      sort_order: parseInt(sort_order, 10) || 0,
    });
    // 异步处理站内信和邮件发送
    await handleNotificationSideEffects(notification, {
      inmail: notification.show_inmail,
      email: notification.show_email,
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
    const { title, content, show_popup, show_banner, show_inmail, show_email, enabled, sort_order } = req.body;
    const data = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: '请填写通知标题' });
      data.title = title.trim();
    }
    if (content !== undefined) {
      if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: '请填写通知内容' });
      data.content = content.trim();
    }
    if (show_popup !== undefined) data.show_popup = toBoolean(show_popup);
    if (show_banner !== undefined) data.show_banner = toBoolean(show_banner);
    if (show_inmail !== undefined) data.show_inmail = toBoolean(show_inmail);
    if (show_email !== undefined) data.show_email = toBoolean(show_email);
    if (enabled !== undefined) data.enabled = toBoolean(enabled);
    if (sort_order !== undefined) data.sort_order = parseInt(sort_order, 10) || 0;
    const notification = await notificationDao.update(id, data);
    const willEnable = enabled !== undefined && toBoolean(enabled) && !existing.enabled;
    await handleNotificationSideEffects(notification, {
      inmail: (show_inmail !== undefined && toBoolean(show_inmail) && !existing.show_inmail) || (willEnable && notification.show_inmail),
      email: (show_email !== undefined && toBoolean(show_email) && !existing.show_email) || (willEnable && notification.show_email),
    });
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
