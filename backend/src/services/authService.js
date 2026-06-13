const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('../config/database');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/auth');
const userDao = require('../dao/userDao');
const userGroupDao = require('../dao/userGroupDao');
const emailVerificationDao = require('../dao/emailVerificationDao');
const emailService = require('./emailService');
const configService = require('./configService');
const usageService = require('./usageService');

const SALT_ROUNDS = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_CODE_PATTERN = /^\d{6}$/;
const VERIFICATION_TYPES = ['register', 'reset_password', 'change_email', 'login'];

// 生成 6 位随机数字验证码
function generateCode() {
  const range = 900000;
  const limit = Math.floor(0x100000000 / range) * range;
  let value;
  do {
    value = crypto.randomBytes(4).readUInt32BE(0);
  } while (value >= limit);
  return String(100000 + (value % range));
}

/** 检查邮箱域名是否在允许的白名单中 */
async function checkEmailDomainWhitelist(email) {
  const whitelistEnabled = await configService.get('email_domain_whitelist_enabled');
  if (whitelistEnabled !== 'true') return; // 未启用白名单，放行

  const raw = await configService.get('email_domain_whitelist');
  if (!raw || !raw.trim()) return; // 白名单为空，放行

  const allowedDomains = raw
    .split(/[\n,]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  if (allowedDomains.length === 0) return;

  const domain = (email.split('@')[1] || '').toLowerCase();
  if (!allowedDomains.includes(domain)) {
    throw { status: 403, message: `仅允许以下邮箱域名注册：${allowedDomains.join('、')}` };
  }
}

async function attachActualDailyUsage(user) {
  const dailyUsed = await usageService.syncDailyUsage(user.id, user);
  return { ...user, actual_daily_tokens_used: dailyUsed };
}

function ensureActiveUser(user) {
  if (user.status !== 'disabled') return;

  const err = {
    status: 403,
    message: '账号已被禁用',
    banInfo: {
      userId: user.id,
      type: 'unknown',
      reason: '账号已被管理员禁用',
      createdAt: user.updated_at,
      canAppeal: false,
    },
  };
  throw err;
}

async function buildDisabledUserError(user) {
  const banDao = require('../dao/banDao');
  const ban = await banDao.getActiveBan(user.id);
  const banInfo = {
    userId: user.id,
    type: ban ? ban.type : 'unknown',
    reason: ban?.reason || '账号已被管理员禁用',
    createdAt: ban?.created_at || user.updated_at,
    canAppeal: ban ? ban.type === 'ban' : false,
  };
  if (ban) banInfo.banId = ban.id;
  return { status: 403, message: '账号已被禁用', banInfo };
}

async function issueLoginResult(user) {
  await userDao.update(user.id, { last_login_at: db.fn.now() });
  const updatedUser = await userDao.findById(user.id);
  const dailyUsed = await usageService.syncDailyUsage(user.id, updatedUser);
  const token = authService.generateToken(updatedUser);

  return {
    token,
    user: authService.sanitizeUser({ ...updatedUser, actual_daily_tokens_used: dailyUsed }),
  };
}

const authService = {
  // 注册新用户（可选邮箱验证码校验）
  async register({ username, email, password, code }) {
    // 检查是否启用邮箱验证
    const verificationEnabled = await configService.get('email_verification_enabled');
    if (verificationEnabled === 'true') {
      if (!code) {
        throw { status: 400, message: '请先验证邮箱' };
      }
      const lockRemain = await emailVerificationDao.checkLock(email, 'register');
      if (lockRemain > 0) {
        throw { status: 429, message: `验证失败次数过多，请 ${Math.ceil(lockRemain / 60)} 分钟后再试` };
      }
      // 校验验证码
      const validRecord = await emailVerificationDao.verify(email, code, 'register');
      if (!validRecord) {
        await emailVerificationDao.recordFailure(email, 'register');
        throw { status: 400, message: '验证码错误或已过期' };
      }
      await emailVerificationDao.markUsed(validRecord.id);
      await emailVerificationDao.clearFailures(email, 'register');
    }

    // 检查邮箱域名白名单
    await checkEmailDomainWhitelist(email);

    // 检查用户名和邮箱唯一性
    const existingUser = await userDao.findByUsername(username);
    if (existingUser) {
      throw { status: 409, message: '用户名已存在' };
    }
    const existingEmail = await userDao.findByEmail(email);
    if (existingEmail) {
      throw { status: 409, message: '邮箱已被注册' };
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    // 从站点配置读取默认分组，未配置时回退到分组 1
    const defaultGroupId = await userGroupDao.resolveAssignableGroupId(await configService.get('default_group'));
    const userId = await userDao.create({
      username,
      email,
      password_hash: passwordHash,
      group_id: defaultGroupId,
    });

    const user = await userDao.findById(userId);
    const token = this.generateToken(user);

    return {
      token,
      user: this.sanitizeUser(await attachActualDailyUsage(user)),
    };
  },

  // 发送验证码（注册/密码重置/邮箱变更）
  async sendVerificationCode(email, type, userId) {
    const verificationEnabled = await configService.get('email_verification_enabled');
    if (verificationEnabled !== 'true') {
      throw { status: 403, message: '邮箱验证功能未启用' };
    }

    if (!VERIFICATION_TYPES.includes(type)) {
      throw { status: 400, message: '验证码类型不正确' };
    }

    // 检查邮箱格式
    if (!email || !EMAIL_PATTERN.test(email)) {
      throw { status: 400, message: '邮箱格式不正确' };
    }

    // 原子化检查发送频率并记录（60 秒冷却 + 每日上限），配额立即消费防止竞态绕过
    await emailService.checkAndRecordSend(email, type);

    // 注册验证：检查邮箱域名白名单和邮箱是否已被使用
    if (type === 'register') {
      await checkEmailDomainWhitelist(email);
      const existing = await userDao.findByEmail(email);
      if (existing) {
        throw { status: 409, message: '该邮箱已被注册' };
      }
    }

    // 密码重置：检查邮箱是否存在
    if (type === 'reset_password') {
      const user = await userDao.findByEmail(email);
      if (!user) {
        // 不暴露用户是否存在，直接返回成功
        return { success: true, message: '如果该邮箱已注册，将收到验证码邮件' };
      }
    }

    // 邮箱验证码登录：未注册邮箱不暴露账号状态，直接返回成功。
    if (type === 'login') {
      const user = await userDao.findByEmail(email);
      if (!user) {
        return { success: true, message: '如果该邮箱已注册，将收到验证码邮件' };
      }
      ensureActiveUser(user);
    }

    // 邮箱变更：需要登录态
    if (type === 'change_email' && userId) {
      const existing = await userDao.findByEmail(email);
      if (existing) {
        throw { status: 409, message: '该邮箱已被其他账号使用' };
      }
    }

    // 使之前的同类型验证码失效
    await emailVerificationDao.invalidatePrevious(email, type);

    // 生成新验证码
    const code = generateCode();

    // 存储到数据库
    await emailVerificationDao.create({
      userId,
      email,
      code,
      type,
      newEmail: type === 'change_email' ? email : null,
    });

    // 发送邮件
    const purposeMap = {
      register: '注册',
      reset_password: '密码重置',
      change_email: '邮箱变更',
      login: '登录',
    };
    const result = await emailService.sendVerificationCode(email, code, purposeMap[type] || type);

    if (!result.success) {
      throw { status: 500, message: `验证码发送失败：${result.error}` };
    }

    return { success: true, message: '验证码已发送至您的邮箱' };
  },

  // 忘记密码（发送重置验证码）
  async forgotPassword(email) {
    return this.sendVerificationCode(email, 'reset_password');
  },

  // 重置密码
  async resetPassword(email, code, newPassword) {
    if (!newPassword || newPassword.length < 6) {
      throw { status: 400, message: '新密码至少6个字符' };
    }
    if (!EMAIL_PATTERN.test(String(email || '')) || !VERIFY_CODE_PATTERN.test(String(code || ''))) {
      throw { status: 400, message: '邮箱或验证码格式不正确' };
    }

    const lockRemain = await emailVerificationDao.checkLock(email, 'reset_password');
    if (lockRemain > 0) {
      throw { status: 429, message: `验证失败次数过多，请 ${Math.ceil(lockRemain / 60)} 分钟后再试` };
    }

    // 校验验证码
    const validRecord = await emailVerificationDao.verify(email, code, 'reset_password');
    if (!validRecord) {
      await emailVerificationDao.recordFailure(email, 'reset_password');
      throw { status: 400, message: '验证码错误或已过期' };
    }

    // 查找用户
    const user = await userDao.findByEmail(email);
    if (!user) {
      throw { status: 404, message: '用户不存在' };
    }

    // 更新密码
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await userDao.update(user.id, { password_hash: passwordHash });

    // 标记验证码已使用并清除失败计数
    await emailVerificationDao.markUsed(validRecord.id);
    await emailVerificationDao.clearFailures(email, 'reset_password');

    return { success: true, message: '密码重置成功，请使用新密码登录' };
  },

  // 通过验证码变更邮箱（需登录）
  async changeEmail(userId, currentEmail, newEmail, code) {
    if (!EMAIL_PATTERN.test(String(newEmail || '')) || !VERIFY_CODE_PATTERN.test(String(code || ''))) {
      throw { status: 400, message: '邮箱或验证码格式不正确' };
    }

    const lockRemain = await emailVerificationDao.checkLock(newEmail, 'change_email');
    if (lockRemain > 0) {
      throw { status: 429, message: `验证失败次数过多，请 ${Math.ceil(lockRemain / 60)} 分钟后再试` };
    }

    // 校验验证码（发送到新邮箱的）
    const validRecord = await emailVerificationDao.verify(newEmail, code, 'change_email');
    if (!validRecord) {
      await emailVerificationDao.recordFailure(newEmail, 'change_email');
      throw { status: 400, message: '验证码错误或已过期' };
    }

    // 检查新邮箱未被占用
    const existing = await userDao.findByEmail(newEmail);
    if (existing && existing.id !== userId) {
      throw { status: 409, message: '该邮箱已被其他账号使用' };
    }

    // 更新邮箱
    await userDao.update(userId, { email: newEmail });
    await emailVerificationDao.markUsed(validRecord.id);
    await emailVerificationDao.clearFailures(newEmail, 'change_email');

    // 获取更新后的用户信息
    const user = await userDao.findById(userId);
    return { success: true, message: '邮箱变更成功', user: this.sanitizeUser(await attachActualDailyUsage(user)) };
  },

  // 登录
  async login({ username, password }) {
    const loginName = String(username || '').trim();
    const user = await userDao.findByLogin(loginName);
    if (!user) {
      throw { status: 401, message: '用户名或密码错误' };
    }
    if (user.status === 'disabled') {
      throw await buildDisabledUserError(user);
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw { status: 401, message: '用户名或密码错误' };
    }

    return issueLoginResult(user);
  },

  // 邮箱验证码登录
  async loginWithEmailCode({ email, code }) {
    const normalizedEmail = String(email || '').trim();
    const normalizedCode = String(code || '').trim();
    if (!EMAIL_PATTERN.test(normalizedEmail) || !VERIFY_CODE_PATTERN.test(normalizedCode)) {
      throw { status: 400, message: '邮箱或验证码格式不正确' };
    }

    const lockRemain = await emailVerificationDao.checkLock(normalizedEmail, 'login');
    if (lockRemain > 0) {
      throw { status: 429, message: `验证失败次数过多，请 ${Math.ceil(lockRemain / 60)} 分钟后再试` };
    }

    const validRecord = await emailVerificationDao.verify(normalizedEmail, normalizedCode, 'login');
    if (!validRecord) {
      await emailVerificationDao.recordFailure(normalizedEmail, 'login');
      throw { status: 400, message: '验证码错误或已过期' };
    }

    const user = await userDao.findByEmail(normalizedEmail);
    if (!user) {
      throw { status: 401, message: '邮箱或验证码错误' };
    }

    if (user.status === 'disabled') {
      throw await buildDisabledUserError(user);
    }

    await emailVerificationDao.markUsed(validRecord.id);
    await emailVerificationDao.clearFailures(normalizedEmail, 'login');
    return issueLoginResult(await userDao.findByLogin(normalizedEmail));
  },

  // 生成 JWT
  generateToken(user) {
    return jwt.sign(
      { id: user.id, username: user.username, group_name: user.group_name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  },

  // 脱敏用户信息（移除密码等敏感字段）
  sanitizeUser(user) {
    const dailyTokensUsed = user.actual_daily_tokens_used !== undefined && user.actual_daily_tokens_used !== null
      ? Number(user.actual_daily_tokens_used)
      : user.daily_tokens_used;

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      group: {
        id: user.group_id,
        name: user.group_name,
        tokenLimitPerDay: user.token_limit_per_day,
        rateLimitPerMinute: user.rate_limit_per_minute,
        maxNovels: user.max_novels,
        maxChaptersPerNovel: user.max_chapters_per_novel,
        canExport: user.can_export,
        canCustomize: user.can_customize,
        canChooseModel: user.can_choose_model,
        isAdmin: !!user.is_admin,
      },
      status: user.status,
      dailyTokensUsed,
      preferredModel: user.preferred_model || null,
      temperaturePreset: user.temperature_preset || 'balanced',
      customTemperature: user.custom_temperature !== undefined && user.custom_temperature !== null
        ? Number(user.custom_temperature)
        : null,
      lastLoginAt: user.last_login_at || null,
      createdAt: user.created_at,
    };
  },
};

module.exports = authService;
