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

// 注册
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6).max(100),
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

// 检查注册是否开放（公开接口）
router.get('/register-status', async (_req, res) => {
  try {
    const allowRegistration = await configService.get('allow_registration');
    const allowed = allowRegistration !== 'false' && allowRegistration !== '0';
    res.json({ allowRegistration: allowed });
  } catch {
    res.json({ allowRegistration: true }); // 出错时默认允许
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
    const { email, password, currentPassword } = req.body;

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
      data.email = email;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: '没有需要修改的内容' });
    }

    await userDao.update(req.user.id, data);
    res.json({ success: true, message: '修改成功' });
  } catch (err) {
    res.status(500).json({ error: '修改失败' });
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

// 更新用户创作温度偏好（全局预设）
router.put('/me/temperature-preference', authenticate, async (req, res) => {
  try {
    const { preset, customTemperature } = req.body;
    const validPresets = ['precise', 'balanced', 'creative', 'wild', 'custom'];
    if (preset && !validPresets.includes(preset)) {
      return res.status(400).json({ error: '无效的温度预设，可选值：' + validPresets.join(', ') });
    }
    const data = {};
    if (preset) data.temperature_preset = preset;
    if (preset === 'custom' && customTemperature !== undefined) {
      const temp = parseFloat(customTemperature);
      if (isNaN(temp) || temp < 0 || temp > 2) {
        return res.status(400).json({ error: '自定义温度值必须在 0-2 之间' });
      }
      data.custom_temperature = temp;
    } else if (preset && preset !== 'custom') {
      data.custom_temperature = null;
    }
    await userDao.update(req.user.id, data);
    const updatedUser = await userDao.findById(req.user.id);
    res.json({ user: authService.sanitizeUser(updatedUser) });
  } catch (err) {
    res.status(500).json({ error: '更新温度偏好失败' });
  }
});

// 获取用户逐阶段温度配置
router.get('/me/temperature-config', authenticate, async (req, res) => {
  try {
    const temperatureConfig = require('../services/temperatureConfig');
    const userTemperatureDao = require('../dao/userTemperatureDao');
    const phases = temperatureConfig.getUserConfigurablePhases();
    const userOverrides = await userTemperatureDao.getByUserId(req.user.id);
    res.json({ phases, overrides: userOverrides });
  } catch (err) {
    res.status(500).json({ error: '获取温度配置失败' });
  }
});

// 保存用户逐阶段温度配置
router.put('/me/temperature-config', authenticate, async (req, res) => {
  try {
    const temperatureConfig = require('../services/temperatureConfig');
    const userTemperatureDao = require('../dao/userTemperatureDao');
    const { configs } = req.body;
    if (!configs || typeof configs !== 'object') {
      return res.status(400).json({ error: '请提供有效的温度配置' });
    }
    // 校验每个阶段值
    const validPhases = temperatureConfig.getUserConfigurablePhases().map(p => p.phase);
    for (const [phase, value] of Object.entries(configs)) {
      if (!validPhases.includes(phase)) {
        return res.status(400).json({ error: `无效的阶段：${phase}` });
      }
      if (value !== null && (typeof value !== 'number' || value < 0 || value > 2)) {
        return res.status(400).json({ error: `${phase} 的温度值必须在 0-2 之间` });
      }
    }
    await userTemperatureDao.saveBatch(req.user.id, configs);
    const overrides = await userTemperatureDao.getByUserId(req.user.id);
    res.json({ overrides });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '保存温度配置失败' });
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
