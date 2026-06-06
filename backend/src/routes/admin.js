const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const OpenAI = require('openai');
const userDao = require('../dao/userDao');
const userGroupDao = require('../dao/userGroupDao');
const novelDao = require('../dao/novelDao');
const usageLogDao = require('../dao/usageLogDao');
const configService = require('../services/configService');
const usageService = require('../services/usageService');
const { getProvidersFull, updateProviders, clearCache, listProviders, listSelectableModels } = require('../config/openai');
const modelTokenService = require('../services/modelTokenService');

const router = Router();

// 所有管理后台路由都需要 admin 权限
router.use(authenticate);
router.use(authorize('admin'));

// 仪表盘统计
router.get('/stats', async (req, res) => {
  try {
    const [{ total: totalUsers }] = await require('../config/database').db('users').count('* as total');
    const totalNovels = await novelDao.getTotalCount();
    // 使用 MySQL CURDATE() 确保时区一致，避免 JS Date 转 UTC 的偏差
    const todayTokens = await require('../config/database').db('usage_logs')
      .where('created_at', '>=', require('../config/database').db.raw('CURDATE()'))
      .sum('tokens_used as total')
      .then(([r]) => parseInt(r.total, 10) || 0);

    const groupStats = await require('../config/database').db('users')
      .join('user_groups', 'users.group_id', 'user_groups.id')
      .select('user_groups.name')
      .count('* as count')
      .groupBy('user_groups.name');

    res.json({
      totalUsers: parseInt(totalUsers, 10),
      totalNovels,
      todayTokens,
      groupStats,
    });
  } catch (err) {
    res.status(500).json({ error: '获取统计信息失败' });
  }
});

// 全局搜索（跨模块：用户、小说、配置项）
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) return res.json({ users: [], novels: [], configs: [] });

    const term = `%${q.trim()}%`;
    const { db } = require('../config/database');

    // 搜索用户（用户名、邮箱、状态）
    const users = await db('users')
      .leftJoin('user_groups', 'users.group_id', 'user_groups.id')
      .select('users.id', 'users.username', 'users.email', 'users.status', 'user_groups.name as group_name')
      .where(function () {
        this.where('users.username', 'like', term)
          .orWhere('users.email', 'like', term)
          .orWhere('users.status', 'like', term);
      })
      .limit(5);

    // 搜索小说（标题、类型、状态）
    const novels = await db('novels')
      .join('users', 'novels.user_id', 'users.id')
      .select('novels.id', 'novels.title', 'novels.genre', 'novels.status', 'users.username as author')
      .where(function () {
        this.where('novels.title', 'like', term)
          .orWhere('novels.genre', 'like', term)
          .orWhere('novels.status', 'like', term);
      })
      .limit(5);

    // 搜索配置项
    const configs = await db('site_config')
      .select('config_key', 'config_value', 'description')
      .where(function () {
        this.where('config_key', 'like', term)
          .orWhere('description', 'like', term)
          .orWhere('config_value', 'like', term);
      })
      .limit(10);

    res.json({
      users: users.map(u => ({ ...u, _type: 'user' })),
      novels: novels.map(n => ({ ...n, _type: 'novel' })),
      configs: configs.map(c => ({ ...c, _type: 'config' })),
    });
  } catch (err) {
    res.status(500).json({ error: '搜索失败' });
  }
});

// 用户列表
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const { status, group_id } = req.query;
    const result = await userDao.list({ page, limit, status, groupId: group_id ? parseInt(group_id, 10) : undefined });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 用户详情
router.get('/users/:id', async (req, res) => {
  try {
    const user = await userDao.findById(parseInt(req.params.id, 10));
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const quota = await usageService.getQuotaInfo(user.id);
    res.json({ user, quota });
  } catch (err) {
    res.status(500).json({ error: '获取用户详情失败' });
  }
});

// 创建用户
router.post('/users', async (req, res) => {
  try {
    const { username, email, password, group_id } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: '用户名、邮箱、密码为必填项' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6个字符' });
    }
    // 检查唯一性
    const existingName = await userDao.findByUsername(username);
    if (existingName) return res.status(409).json({ error: '用户名已存在' });
    const existingEmail = await userDao.findByEmail(email);
    if (existingEmail) return res.status(409).json({ error: '邮箱已被注册' });

    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    await userDao.create({
      username,
      email,
      password_hash: passwordHash,
      group_id: group_id || 1,
      status: 'active',
    });

    const newUser = await userDao.findByUsername(username);
    res.status(201).json({ user: newUser });
  } catch (err) {
    res.status(500).json({ error: '创建用户失败' });
  }
});

// 编辑用户
router.put('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    // 禁止修改自己
    if (userId === req.user.id) {
      return res.status(403).json({ error: '不能修改自己的账号，请让其他管理员操作' });
    }

    const user = await userDao.findById(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const allowedFields = ['status', 'group_id', 'email'];
    const data = {};
    allowedFields.forEach(f => {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    });

    // 密码单独处理
    if (req.body.password) {
      const bcrypt = require('bcrypt');
      data.password_hash = await bcrypt.hash(req.body.password, 10);
    }

    await userDao.update(userId, data);
    const updatedUser = await userDao.findById(userId);
    res.json({ user: updatedUser });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '更新用户失败' });
  }
});

// 删除用户（从数据库移除）
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    // 禁止删除自己
    if (userId === req.user.id) {
      return res.status(403).json({ error: '不能删除自己的账号' });
    }

    const user = await userDao.findById(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 级联删除：先删关联数据，再删用户
    const { db } = require('../config/database');
    const trx = await db.transaction();
    try {
      await trx('usage_logs').where('user_id', userId).del();
      await trx('chapters').whereIn('novel_id', function () {
        this.select('id').from('novels').where('user_id', userId);
      }).del();
      await trx('characters').whereIn('novel_id', function () {
        this.select('id').from('novels').where('user_id', userId);
      }).del();
      await trx('novels').where('user_id', userId).del();
      await trx('users').where('id', userId).del();
      await trx.commit();
    } catch (e) {
      await trx.rollback();
      throw e;
    }

    res.json({ success: true, message: `用户 "${user.username}" 已从数据库移除` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '删除用户失败' });
  }
});

// 站点配置列表
router.get('/config', async (req, res) => {
  try {
    const configs = await configService.getAll();
    res.json({ configs });
  } catch (err) {
    res.status(500).json({ error: '获取配置失败' });
  }
});

// 修改站点配置
router.put('/config/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ error: '缺少配置值' });
    }
    const result = await configService.set(key, value);

    // 如果修改的是 openai_providers，同步到 Agent 缓存
    if (key === 'openai_providers' && value) {
      try {
        const { updateProviders } = require('../config/openai');
        const providers = JSON.parse(value);
        if (Array.isArray(providers) && providers.length > 0) {
          await updateProviders(providers);
        }
      } catch { /* JSON 解析失败则跳过 */ }
    }

    // 同步到 .env 文件
    const envMap = {
      openai_api_key: 'OPENAI_API_KEY',
      openai_base_url: 'OPENAI_BASE_URL',
      default_model: 'OPENAI_MODEL',
      openai_providers: 'OPENAI_PROVIDERS',
    };
    const envKey = envMap[key];
    if (envKey && value !== undefined) {
      const { writeEnvValue, clearCache } = require('../config/openai');
      writeEnvValue(envKey, value);
      clearCache();
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '更新配置失败' });
  }
});

// 用量统计
router.get('/usage', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const userId = req.query.user_id ? parseInt(req.query.user_id, 10) : undefined;
    const result = await usageLogDao.list({ page, limit, userId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '获取用量统计失败' });
  }
});

// ==================== Provider 管理 ====================

// 获取所有 Provider 配置（管理员专用，返回完整 apiKey）
router.get('/providers', async (req, res) => {
  try {
    const providers = getProvidersFull();
    res.json({ providers });
  } catch (err) {
    res.status(500).json({ error: '获取 Provider 配置失败' });
  }
});

// 保存 Provider 配置
router.put('/providers', async (req, res) => {
  try {
    const { providers } = req.body;
    if (!Array.isArray(providers)) {
      return res.status(400).json({ error: 'providers 必须是数组' });
    }
    // 空数组 = 清空多Provider，回退单Provider
    if (providers.length === 0) {
      await updateProviders([]);
      configService.set('openai_providers', '');
      return res.json({ success: true, message: '已切换到单Provider模式' });
    }
    // 校验结构
    for (const p of providers) {
      if (!p.name || !p.baseUrl || !p.apiKey || !Array.isArray(p.models)) {
        return res.status(400).json({ error: `Provider "${p.name || '?'}" 缺少必填字段` });
      }
      for (const m of p.models) {
        if (!m.name || !Array.isArray(m.phases)) {
          return res.status(400).json({ error: `Provider "${p.name}" 的模型 "${m.name || '?'}" 缺少必填字段` });
        }
      }
    }

    await updateProviders(providers);
    configService.set('openai_providers', JSON.stringify(providers));
    res.json({ success: true, message: '配置已保存并立即生效' });
  } catch (err) {
    res.status(500).json({ error: '保存 Provider 配置失败' });
  }
});

// 测试 Provider 连接（支持多Provider和单Provider回退）
router.post('/providers/test', async (req, res) => {
  try {
    let { provider } = req.body;

    // 如果 apiKey 为空，使用 .env 中的单Provider配置回退
    if (provider && !provider.apiKey) {
      provider = {
        baseUrl: provider.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY || '',
        model: provider.model || process.env.OPENAI_MODEL || 'gpt-4o',
      };
    }

    if (!provider || !provider.baseUrl || !provider.model) {
      return res.status(400).json({ error: '缺少测试参数（需要 baseUrl 和 model）' });
    }
    if (!provider.apiKey) {
      return res.status(400).json({ error: '缺少 API Key，请配置 openai_providers 或在 .env 中设置 OPENAI_API_KEY' });
    }

    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl,
    });

    // 发送测试请求
    const start = Date.now();
    try {
      const response = await client.chat.completions.create({
        model: provider.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      });
      const latency = Date.now() - start;
      res.json({
        success: true,
        latency,
        model: response.model,
        message: `连接成功，延迟 ${latency}ms`,
      });
    } catch (apiErr) {
      res.json({
        success: false,
        message: apiErr.message || '连接失败',
      });
    }
  } catch (err) {
    res.status(500).json({ error: '测试失败' });
  }
});

// ==================== 小说管理 ====================

// 所有小说列表
router.get('/novels', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const { db } = require('../config/database');
    const offset = (page - 1) * limit;

    let base = db('novels').join('users', 'novels.user_id', 'users.id');
    if (req.query.user_id) base = base.where('novels.user_id', parseInt(req.query.user_id, 10));
    if (req.query.status) base = base.where('novels.status', req.query.status);

    const [rows, [{ total }]] = await Promise.all([
      base.clone().select('novels.*', 'users.username')
        .orderBy('novels.updated_at', 'desc').limit(limit).offset(offset),
      base.clone().count('* as total'),
    ]);
    res.json({ rows, total: parseInt(total, 10), page, limit });
  } catch (err) {
    res.status(500).json({ error: '获取小说列表失败' });
  }
});

// 小说详情
router.get('/novels/:id', async (req, res) => {
  try {
    const novel = await novelDao.findById(parseInt(req.params.id, 10));
    if (!novel) return res.status(404).json({ error: '小说不存在' });
    const chapterDao = require('../dao/chapterDao');
    const characterDao = require('../dao/characterDao');
    const [chapters, characters] = await Promise.all([
      chapterDao.findByNovelId(novel.id),
      characterDao.findByNovelId(novel.id),
    ]);
    res.json({ novel: { ...novel, chapters, characters } });
  } catch (err) {
    res.status(500).json({ error: '获取小说详情失败' });
  }
});

// 删除小说
router.delete('/novels/:id', async (req, res) => {
  try {
    const novel = await novelDao.findById(parseInt(req.params.id, 10));
    if (!novel) return res.status(404).json({ error: '小说不存在' });
    await novelDao.remove(novel.id);
    res.json({ success: true, message: `小说 "${novel.title}" 已删除` });
  } catch (err) {
    res.status(err.status || 500).json({ error: '删除小说失败' });
  }
});

// ==================== 模型 Token 限额管理 ====================

// 获取所有模型 Token 限额
router.get('/model-limits', async (req, res) => {
  try {
    const limits = await modelTokenService.getAllLimits();
    res.json({ limits });
  } catch (err) {
    res.status(500).json({ error: '获取模型限额失败' });
  }
});

// 保存/更新模型 Token 限额
router.put('/model-limits', async (req, res) => {
  try {
    const { providerName, modelName, dailyLimit, monthlyLimit, enabled } = req.body;
    if (!providerName || !modelName) {
      return res.status(400).json({ error: '缺少 providerName 或 modelName' });
    }
    const result = await modelTokenService.saveLimit(providerName, modelName, {
      daily_limit: dailyLimit ?? 0,
      monthly_limit: monthlyLimit ?? 0,
      enabled: enabled !== undefined ? enabled : true,
    });
    res.json({ success: true, limit: result });
  } catch (err) {
    res.status(500).json({ error: '保存模型限额失败' });
  }
});

// 删除模型 Token 限额
router.delete('/model-limits/:id', async (req, res) => {
  try {
    await modelTokenService.deleteLimit(parseInt(req.params.id, 10));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除模型限额失败' });
  }
});

// 获取可选模型列表（管理员接口）
router.get('/selectable-models', async (req, res) => {
  try {
    const models = listSelectableModels();
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: '获取模型列表失败' });
  }
});

// ==================== 分组管理 ====================

// 获取所有分组
router.get('/groups', async (req, res) => {
  try {
    const groups = await userGroupDao.findAll();
    // 附加每个分组的用户数量
    const groupsWithCount = await Promise.all(groups.map(async (g) => ({
      ...g,
      user_count: await userGroupDao.getUserCount(g.id),
    })));
    res.json({ groups: groupsWithCount });
  } catch (err) {
    res.status(500).json({ error: '获取分组列表失败' });
  }
});

// 获取分组详情
router.get('/groups/:id', async (req, res) => {
  try {
    const group = await userGroupDao.findById(parseInt(req.params.id, 10));
    if (!group) return res.status(404).json({ error: '分组不存在' });
    const userCount = await userGroupDao.getUserCount(group.id);
    res.json({ group: { ...group, user_count: userCount } });
  } catch (err) {
    res.status(500).json({ error: '获取分组详情失败' });
  }
});

// 创建分组
router.post('/groups', async (req, res) => {
  try {
    const { name, token_limit_per_day, rate_limit_per_minute, max_novels,
            max_chapters_per_novel, can_export, can_customize, description } = req.body;

    if (!name) return res.status(400).json({ error: '分组名称为必填项' });

    // 检查名称唯一性
    const existing = await userGroupDao.findByName(name);
    if (existing) return res.status(409).json({ error: '分组名称已存在' });

    const group = await userGroupDao.create({
      name,
      token_limit_per_day,
      rate_limit_per_minute,
      max_novels,
      max_chapters_per_novel,
      can_export,
      can_customize,
      description,
    });

    res.status(201).json({ group });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '创建分组失败' });
  }
});

// 更新分组
router.put('/groups/:id', async (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const group = await userGroupDao.findById(groupId);
    if (!group) return res.status(404).json({ error: '分组不存在' });

    // 禁止管理员取消自己所在分组的管理员权限（防止误操作锁死）
    if (req.body.is_admin !== undefined && req.user.group_id === groupId && !req.body.is_admin) {
      return res.status(403).json({ error: '不能取消自己所在分组的管理员权限，请让其他管理员操作' });
    }

    // 如果修改名称，检查唯一性
    if (req.body.name && req.body.name !== group.name) {
      const existing = await userGroupDao.findByName(req.body.name);
      if (existing) return res.status(409).json({ error: '分组名称已存在' });
    }

    const updated = await userGroupDao.update(groupId, req.body);

    // 返回纯对象，避免 knex 内部引用
    res.json({
      group: {
        id: updated.id,
        name: updated.name,
        token_limit_per_day: updated.token_limit_per_day,
        rate_limit_per_minute: updated.rate_limit_per_minute,
        max_novels: updated.max_novels,
        max_chapters_per_novel: updated.max_chapters_per_novel,
        can_export: updated.can_export,
        can_customize: updated.can_customize,
        description: updated.description,
        queue_priority: updated.queue_priority,
        is_admin: updated.is_admin,
        user_count: updated.user_count,
      }
    });
  } catch (err) {
    console.error(`更新分组失败:`, err.message);
    res.status(err.status || 500).json({ error: err.message || '更新分组失败' });
  }
});

// 删除分组
router.delete('/groups/:id', async (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const group = await userGroupDao.findById(groupId);
    if (!group) return res.status(404).json({ error: '分组不存在' });

    await userGroupDao.delete(groupId);
    res.json({ success: true, message: `分组 "${group.name}" 已删除` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '删除分组失败' });
  }
});

// ==================== 封禁管理 ====================

// 获取封禁记录列表
router.get('/bans', async (req, res) => {
  try {
    const banService = require('../services/banService');
    const { page = 1, limit = 20, status } = req.query;
    const result = await banService.listBans({ page: parseInt(page), limit: parseInt(limit), status });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取封禁列表失败' });
  }
});

// 封禁用户
router.post('/users/:id/ban', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (userId === req.user.id) {
      return res.status(403).json({ error: '不能封禁自己的账号' });
    }
    const { reason } = req.body;
    const banService = require('../services/banService');
    const result = await banService.banUser(userId, req.user.id, reason);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '封禁失败' });
  }
});

// 解封用户
router.post('/bans/:banId/unban', async (req, res) => {
  try {
    const banId = parseInt(req.params.banId, 10);
    const banService = require('../services/banService');
    const result = await banService.unbanUser(banId, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '解封失败' });
  }
});

// ==================== 申诉审核 ====================

// 获取申诉列表
router.get('/appeals', async (req, res) => {
  try {
    const banService = require('../services/banService');
    const { page = 1, limit = 20, status } = req.query;
    const result = await banService.listAppeals({ page: parseInt(page), limit: parseInt(limit), status });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取申诉列表失败' });
  }
});

// 审核申诉
router.post('/appeals/:id/review', async (req, res) => {
  try {
    const appealId = parseInt(req.params.id, 10);
    const { action, note } = req.body;
    const banService = require('../services/banService');
    const result = await banService.reviewAppeal(appealId, { action, note }, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '审核失败' });
  }
});

// 获取申诉审核模式配置
router.get('/appeal-review-mode', async (req, res) => {
  try {
    const banService = require('../services/banService');
    const config = await banService.getReviewModeConfig();
    res.json(config);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取配置失败' });
  }
});

// 设置申诉审核模式
router.put('/appeal-review-mode', async (req, res) => {
  try {
    const banService = require('../services/banService');
    const result = await banService.setReviewModeConfig(req.body.mode);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '设置失败' });
  }
});

// 获取申诉AI审核Provider配置
router.get('/appeal-ai-review-config', async (req, res) => {
  try {
    const banService = require('../services/banService');
    const config = await banService.getAiReviewProviderConfig();
    res.json(config);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '获取配置失败' });
  }
});

// 设置申诉AI审核Provider配置
router.put('/appeal-ai-review-config', async (req, res) => {
  try {
    const banService = require('../services/banService');
    const { providerName, modelName } = req.body;
    const result = await banService.setAiReviewProviderConfig(providerName, modelName);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '设置失败' });
  }
});

// ==================== favicon 管理 ====================
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const faviconStorage = multer.diskStorage({
  destination: path.join(__dirname, '../../../uploads'),
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `favicon${ext}`);
  },
});

const faviconUpload = multer({
  storage: faviconStorage,
  limits: { fileSize: 1024 * 1024 }, // 1MB
  fileFilter(_req, file, cb) {
    const allowed = ['.png', '.svg', '.ico', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('仅支持 PNG、SVG、ICO、JPG、JPEG 格式的图标文件'));
    }
    cb(null, true);
  },
});

// 上传 favicon（管理员）
router.post('/favicon', authenticate, authorize('admin'), (req, res) => {
  faviconUpload.single('favicon')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '文件大小不能超过 1MB' });
      }
      return res.status(400).json({ error: err.message || '上传失败' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的图标文件' });
    }

    try {
      // 删除旧的自定义 favicon（如果有不同扩展名的）
      const oldPath = await configService.get('favicon_path');
      if (oldPath) {
        const oldFull = path.join(__dirname, '../../../uploads', oldPath);
        if (fs.existsSync(oldFull) && oldPath !== req.file.filename) {
          fs.unlinkSync(oldFull);
        }
      }

      await configService.set('favicon_path', req.file.filename);
      await configService.set('favicon_original_name', req.file.originalname);
      res.json({
        success: true,
        url: `/uploads/${req.file.filename}`,
        filename: req.file.originalname,
        size: req.file.size,
      });
    } catch (e) {
      res.status(500).json({ error: '保存配置失败' });
    }
  });
});

// 删除自定义 favicon，恢复默认图标（管理员）
router.delete('/favicon', authenticate, authorize('admin'), async (req, res) => {
  try {
    const oldPath = await configService.get('favicon_path');
    if (oldPath) {
      const fullPath = path.join(__dirname, '../../../uploads', oldPath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
    await configService.set('favicon_path', '');
    await configService.set('favicon_original_name', '');
    res.json({ success: true, message: '已恢复默认图标' });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

// 获取当前 favicon 信息（管理员）
router.get('/favicon', authenticate, authorize('admin'), async (_req, res) => {
  try {
    const faviconPath = await configService.get('favicon_path');
    const originalName = await configService.get('favicon_original_name');
    const uploadsDir = path.join(__dirname, '../../../uploads');
    let fileSize = 0;
    if (faviconPath) {
      const fullPath = path.join(uploadsDir, faviconPath);
      if (fs.existsSync(fullPath)) {
        fileSize = fs.statSync(fullPath).size;
      }
    }
    res.json({
      hasCustom: !!faviconPath && fileSize > 0,
      url: faviconPath && fileSize > 0 ? `/uploads/${faviconPath}` : null,
      originalName: originalName || null,
      size: fileSize || null,
    });
  } catch {
    res.json({ hasCustom: false, url: null, originalName: null, size: null });
  }
});

module.exports = router;
