const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/auth');
const userDao = require('../dao/userDao');

const SALT_ROUNDS = 12;

const authService = {
  // 注册新用户
  async register({ username, email, password }) {
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
    const userId = await userDao.create({
      username,
      email,
      password_hash: passwordHash,
      group_id: 1, // 默认 free 组
    });

    const user = await userDao.findById(userId);
    const token = this.generateToken(user);

    return {
      token,
      user: this.sanitizeUser(user),
    };
  },

  // 登录
  async login({ username, password }) {
    const user = await userDao.findByUsername(username);
    if (!user) {
      throw { status: 401, message: '用户名或密码错误' };
    }
    if (user.status === 'disabled') {
      throw { status: 403, message: '账号已被禁用，请联系管理员' };
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw { status: 401, message: '用户名或密码错误' };
    }

    const token = this.generateToken(user);

    return {
      token,
      user: this.sanitizeUser(user),
    };
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
      },
      status: user.status,
      dailyTokensUsed: user.daily_tokens_used,
      preferredModel: user.preferred_model || null,
      createdAt: user.created_at,
    };
  },
};

module.exports = authService;
