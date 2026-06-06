const { Router } = require('express');
const { z } = require('zod');
const authService = require('../services/authService');
const configService = require('../services/configService');
const captchaService = require('../services/captchaService');
const authenticate = require('../middleware/authenticate');
const loginRateLimiter = require('../middleware/loginRateLimiter');
const userDao = require('../dao/userDao');
const userGroupDao = require('../dao/userGroupDao');

const router = Router();

// 发送邮箱验证码（注册/密码重置/邮箱变更）
const sendCodeSchema = z.object({
  email: z.string().email(),
  type: z.enum(['register', 'reset_password', 'change_email']),
  captchaId: z.string().optional(),
  captchaCode: z.string().optional(),
});

router.post('/send-verify-code', async (req, res) => {
  try {
    const body = sendCodeSchema.parse(req.body);
    // change_email 需要登录态
    if (body.type === 'change_email') {
      return res.status(400).json({ error: '邮箱变更验证码需要通过认证接口发送' });
    }

    // 验证码校验（仅在管理员启用时）
    const captchaEnabled = await configService.get('captcha_enabled');
    if (captchaEnabled === 'true') {
      if (!body.captchaId || body.captchaCode === undefined) {
        return res.status(400).json({ error: '请输入图形验证码' });
      }
      if (!captchaService.validate(body.captchaId, body.captchaCode)) {
        return res.status(400).json({ error: '验证码错误或已过期，请刷新后重试' });
      }
    }

    const result = await authService.sendVerificationCode(body.email, body.type);
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: '输入数据格式不正确', details: err.errors });
    }
    res.status(err.status || 500).json({ error: err.message || '发送验证码失败' });
  }
});

// 注册
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  code: z.string().length(6).optional(),
});

router.post('/register', async (req, res) => {
  try {
    // 检查站点是否允许注册
    const allowRegistration = await configService.get('allow_registration');
    if (allowRegistration === 'false' || allowRegistration === '0') {
      return res.status(403).json({ error: '站点已关闭注册功能' });
    }

    const body = registerSchema.parse(req.body);
    const result = await authService.register(body);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: '输入数据格式不正确', details: err.errors });
    }
    res.status(err.status || 500).json({ error: err.message || '注册失败' });
  }
});

// 忘记密码（发送重置验证码）
const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

router.post('/forgot-password', async (req, res) => {
  try {
    const body = forgotPasswordSchema.parse(req.body);
    const result = await authService.forgotPassword(body.email);
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: '输入数据格式不正确', details: err.errors });
    }
    res.status(err.status || 500).json({ error: err.message || '发送验证码失败' });
  }
});

// 重置密码
const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  password: z.string().min(6).max(100),
});

router.post('/reset-password', async (req, res) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const result = await authService.resetPassword(body.email, body.code, body.password);
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: '输入数据格式不正确', details: err.errors });
    }
    res.status(err.status || 500).json({ error: err.message || '重置密码失败' });
  }
});

// 检查注册是否开放（公开接口）
router.get('/register-status', async (_req, res) => {
  try {
    const allowRegistration = await configService.get('allow_registration');
    const allowed = allowRegistration !== 'false' && allowRegistration !== '0';
    const verificationEnabled = await configService.get('email_verification_enabled');
    const whitelistEnabledRaw = await configService.get('email_domain_whitelist_enabled');
    const whitelistEnabled = whitelistEnabledRaw === 'true';
    let allowedDomains = [];
    if (whitelistEnabled) {
      const raw = await configService.get('email_domain_whitelist');
      if (raw && raw.trim()) {
        allowedDomains = raw.split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
      }
    }
    res.json({
      allowRegistration: allowed,
      emailVerificationEnabled: verificationEnabled === 'true',
      emailDomainWhitelistEnabled: whitelistEnabled,
      allowedDomains: whitelistEnabled ? allowedDomains : [],
    });
  } catch {
    res.json({ allowRegistration: true, emailVerificationEnabled: false, emailDomainWhitelistEnabled: false, allowedDomains: [] });
  }
});

// 获取登录验证码
router.get('/captcha', async (_req, res) => {
  try {
    const enabled = await configService.get('captcha_enabled');
    if (enabled !== 'true') {
      return res.json({ captchaId: null, svg: null, enabled: false });
    }
    const { captchaId, svg } = captchaService.generate();
    res.json({ captchaId, svg, enabled: true });
  } catch (err) {
    res.status(500).json({ error: '生成验证码失败' });
  }
});

// 登录
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  captchaId: z.string().optional(),
  captchaCode: z.string().optional(),
});

router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const body = loginSchema.parse(req.body);

    // 验证码校验（仅在管理员启用时）
    const captchaEnabled = await configService.get('captcha_enabled');
    if (captchaEnabled === 'true') {
      if (!body.captchaId || body.captchaCode === undefined) {
        return res.status(400).json({ error: '请输入验证码' });
      }
      if (!captchaService.validate(body.captchaId, body.captchaCode)) {
        return res.status(400).json({ error: '验证码错误或已过期，请刷新后重试' });
      }
    }

    const result = await authService.login(body);
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: '输入数据格式不正确', details: err.errors });
    }
    res.status(err.status || 500).json({
      error: err.message || '登录失败',
      banInfo: err.banInfo || undefined,
    });
  }
});

// 获取当前用户信息
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = authService.sanitizeUser(req.user);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 修改自己的账号信息（邮箱/密码）
router.put('/me', authenticate, async (req, res) => {
  try {
    const userDao = require('../dao/userDao');
    const bcrypt = require('bcrypt');
    const data = {};
    const { email, password, currentPassword, username } = req.body;

    // 修改用户名
    if (username) {
      if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50) {
        return res.status(400).json({ error: '用户名长度需在 3-50 个字符之间' });
      }
      const trimmed = username.trim();
      const existing = await userDao.findByUsername(trimmed);
      if (existing && existing.id !== req.user.id) {
        return res.status(409).json({ error: '该用户名已被使用' });
      }
      data.username = trimmed;
    }

    // 修改密码需验证当前密码
    if (password) {
      if (!currentPassword) {
        return res.status(400).json({ error: '修改密码需要提供当前密码' });
      }
      const valid = await bcrypt.compare(currentPassword, req.user.password_hash);
      if (!valid) {
        return res.status(400).json({ error: '当前密码不正确' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: '新密码至少6个字符' });
      }
      data.password_hash = await bcrypt.hash(password, 10);
    }

    if (email) {
      // 邮箱变更需要通过验证码流程
      return res.status(400).json({ error: '请使用邮箱验证码完成邮箱变更。先通过 /me/send-change-email-code 发送验证码，再通过 /me/change-email 完成变更' });
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: '没有需要修改的内容' });
    }

    await userDao.update(req.user.id, data);
    const updatedUser = await userDao.findById(req.user.id);
    res.json({ success: true, message: '修改成功', user: authService.sanitizeUser(updatedUser) });
  } catch (err) {
    res.status(500).json({ error: '修改失败' });
  }
});

// 发送邮箱变更验证码（需登录）
router.post('/me/send-change-email-code', authenticate, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '请提供有效的邮箱地址' });
    }
    const result = await authService.sendVerificationCode(email, 'change_email', req.user.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '发送验证码失败' });
  }
});

// 完成邮箱变更（需登录，验证码确认）
router.post('/me/change-email', authenticate, async (req, res) => {
  try {
    const { newEmail, code } = req.body;
    if (!newEmail || !code) {
      return res.status(400).json({ error: '请提供新邮箱和验证码' });
    }
    const result = await authService.changeEmail(req.user.id, req.user.email, newEmail, code);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '邮箱变更失败' });
  }
});

// 注销账号（用户自行禁用，记录到封禁表）
router.post('/cancel', authenticate, async (req, res) => {
  try {
    const banService = require('../services/banService');
    const result = await banService.deactivateUser(req.user.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '注销失败' });
  }
});

// 用户提交申诉（公开接口，无需登录）
router.post('/appeal', async (req, res) => {
  try {
    const { banId, userId, content } = req.body;
    if (!banId || !userId) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    const banService = require('../services/banService');
    const result = await banService.submitAppeal(parseInt(banId), parseInt(userId), content);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '提交申诉失败' });
  }
});

// 更新用户首选模型偏好
router.put('/me/preferred-model', authenticate, async (req, res) => {
  try {
    const { modelName } = req.body;
    // modelName 为 null 或空字符串表示"默认（按管理员优先级）"

    // 校验用户组是否有自选模型权限
    const userGroup = await userGroupDao.findById(req.user.group_id);
    if (!userGroup || !userGroup.can_choose_model) {
      return res.status(403).json({ error: '你的用户组不允许自定义模型选择' });
    }

    await userDao.updatePreferredModel(req.user.id, modelName || null);

    // 重新获取完整用户信息
    const updatedUser = await userDao.findById(req.user.id);
    res.json({ user: authService.sanitizeUser(updatedUser) });
  } catch (err) {
    res.status(500).json({ error: '更新模型偏好失败' });
  }
});

// 获取可选模型列表（非管理员接口）
router.get('/available-models', authenticate, async (req, res) => {
  try {
    const userGroup = await userGroupDao.findById(req.user.group_id);
    if (!userGroup || !userGroup.can_choose_model) {
      return res.json({ models: [], canChoose: false });
    }
    const { listSelectableModels } = require('../config/openai');
    const models = listSelectableModels();
    res.json({ models, canChoose: true });
  } catch (err) {
    res.status(500).json({ error: '获取模型列表失败' });
  }
});

module.exports = router;
