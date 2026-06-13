const { db } = require('../config/database');

const TABLE = 'email_verifications';
const FAILURE_TABLE = 'email_verification_failures';

// 暴力破解防护：每 10 分钟窗口最多允许 5 次失败，超出则锁定 30 分钟
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const FAILURE_MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000;

const emailVerificationDao = {
  /** 创建验证码记录 */
  async create({ userId, email, code, type, newEmail }) {
    const [id] = await db(TABLE).insert({
      user_id: userId || null,
      email,
      code,
      type,
      new_email: newEmail || null,
      used: false,
      expires_at: db.raw("DATE_ADD(NOW(), INTERVAL 10 MINUTE)"),
    });
    return id;
  },

  /** 校验验证码 */
  async verify(email, code, type) {
    const row = await db(TABLE)
      .where({ email, code, type, used: false })
      .where('expires_at', '>', db.fn.now())
      .orderBy('created_at', 'desc')
      .first();
    return row || null;
  },

  /** 标记验证码为已使用 */
  async markUsed(id) {
    return db(TABLE).where('id', id).update({ used: true });
  },

  /** 清除邮箱未使用的验证码（防止重复发送） */
  async invalidatePrevious(email, type) {
    return db(TABLE)
      .where({ email, type, used: false })
      .update({ used: true });
  },

  /** 清除过期验证码（定时任务可用） */
  async cleanExpired() {
    return db(TABLE).where('expires_at', '<', db.fn.now()).where('used', false).del();
  },

  /** 获取指定邮箱特定类型的最近一条有效验证码 */
  async getLatestValid(email, type) {
    return db(TABLE)
      .where({ email, type, used: false })
      .where('expires_at', '>', db.fn.now())
      .orderBy('created_at', 'desc')
      .first();
  },

  // ===== 失败计数与锁定 =====

  /**
   * 检查是否被锁定，被锁定则返回剩余秒数；否则返回 0
   */
  async checkLock(email, type) {
    const row = await db(FAILURE_TABLE).where({ email, type }).first();
    if (!row || !row.locked_until) return 0;
    const lockedUntil = new Date(row.locked_until).getTime();
    const remaining = lockedUntil - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  },

  /**
   * 记录一次失败，返回当前累计失败次数；达到上限会写入 locked_until。
   * 使用 INSERT 优先 + 事务内 SELECT FOR UPDATE 双路径，防止并发竞态导致失败计数丢失。
   */
  async recordFailure(email, type) {
    const now = Date.now();

    // 首次失败快速路径：直接 INSERT，由唯一索引 (email, type) 防重
    try {
      await db(FAILURE_TABLE).insert({
        email,
        type,
        fail_count: 1,
        window_started_at: db.fn.now(),
      });
      return 1;
    } catch (err) {
      if (!err || (err.code !== 'ER_DUP_ENTRY' && !/duplicate/i.test(err.message || ''))) {
        throw err;
      }
      // 并发 INSERT 冲突，落入下方事务路径
    }

    // 已有记录：在事务内 SELECT FOR UPDATE 保证读-改-写原子性
    return db.transaction(async (trx) => {
      const existing = await trx(FAILURE_TABLE)
        .where({ email, type })
        .forUpdate()
        .first();

      if (!existing) {
        await trx(FAILURE_TABLE).insert({
          email,
          type,
          fail_count: 1,
          window_started_at: db.fn.now(),
        });
        return 1;
      }

      const windowStart = existing.window_started_at ? new Date(existing.window_started_at).getTime() : 0;

      if (now - windowStart > FAILURE_WINDOW_MS) {
        // 窗口已过期，重置计数
        await trx(FAILURE_TABLE).where('id', existing.id).update({
          fail_count: 1,
          window_started_at: db.fn.now(),
          locked_until: null,
          updated_at: db.fn.now(),
        });
        return 1;
      }

      const nextCount = (existing.fail_count || 0) + 1;
      const update = {
        fail_count: nextCount,
        updated_at: db.fn.now(),
      };
      if (nextCount >= FAILURE_MAX_ATTEMPTS) {
        update.locked_until = db.raw(`DATE_ADD(NOW(), INTERVAL ${Math.floor(LOCK_DURATION_MS / 1000)} SECOND)`);
      }
      await trx(FAILURE_TABLE).where('id', existing.id).update(update);
      return nextCount;
    });
  },

  /** 验证成功后清除失败记录 */
  async clearFailures(email, type) {
    return db(FAILURE_TABLE).where({ email, type }).del();
  },
};

module.exports = emailVerificationDao;
