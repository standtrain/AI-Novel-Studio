const { db } = require('../config/database');
const BAN_TABLE = 'user_bans';
const APPEAL_TABLE = 'user_appeals';

const banDao = {
  // ---- 封禁记录 ----

  // 获取用户当前生效的封禁
  async getActiveBan(userId) {
    return db(BAN_TABLE)
      .where({ user_id: userId, status: 'active' })
      .orderBy('created_at', 'desc')
      .first();
  },

  // 创建封禁记录，同时将用户状态设为 disabled
  async createBan(data) {
    const trx = await db.transaction();
    try {
      const [id] = await trx(BAN_TABLE).insert(data);
      await trx('users').where({ id: data.user_id }).update({ status: 'disabled' });
      await trx.commit();
      return id;
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  },

  // 解除封禁，同时恢复用户状态（仅当没有其他生效封禁时）
  async liftBan(banId, operatorId) {
    const trx = await db.transaction();
    try {
      const ban = await trx(BAN_TABLE).where({ id: banId }).first();
      if (!ban) { await trx.rollback(); throw { status: 404, message: '封禁记录不存在' }; }

      await trx(BAN_TABLE).where({ id: banId }).update({
        status: 'lifted',
        operator_id: operatorId,
        updated_at: db.fn.now(),
      });

      // 检查是否还有其他生效封禁
      const otherBans = await trx(BAN_TABLE)
        .where({ user_id: ban.user_id, status: 'active' })
        .whereNot({ id: banId });
      if (otherBans.length === 0) {
        await trx('users').where({ id: ban.user_id }).update({ status: 'active' });
      }
      await trx.commit();
      return ban;
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  },

  // 获取所有封禁记录（管理员视图，含用户名）
  async listAll({ page = 1, limit = 20, status } = {}) {
    const q = db(BAN_TABLE)
      .leftJoin('users as u', `${BAN_TABLE}.user_id`, 'u.id')
      .leftJoin('users as op', `${BAN_TABLE}.operator_id`, 'op.id')
      .select(
        `${BAN_TABLE}.*`,
        'u.username as username',
        'u.email as email',
        'op.username as operator_name',
      )
      .orderBy(`${BAN_TABLE}.created_at`, 'desc');

    if (status) q.where(`${BAN_TABLE}.status`, status);

    const offset = (page - 1) * limit;
    const [rows, [{ total }]] = await Promise.all([
      q.clone().offset(offset).limit(limit),
      q.clone().clearSelect().count('* as total'),
    ]);
    return { rows, total: parseInt(total) || 0, page, limit };
  },

  // ---- 申诉记录 ----

  // 创建申诉
  async createAppeal(data) {
    const [id] = await db(APPEAL_TABLE).insert(data);
    return id;
  },

  // 获取用户对某封禁的最后一次申诉
  async getLatestAppeal(banId, userId) {
    return db(APPEAL_TABLE)
      .where({ ban_id: banId, user_id: userId })
      .orderBy('created_at', 'desc')
      .first();
  },

  // 获取所有申诉（管理员视图）
  async listAppeals({ page = 1, limit = 20, status } = {}) {
    const q = db(APPEAL_TABLE)
      .leftJoin('users as u', `${APPEAL_TABLE}.user_id`, 'u.id')
      .leftJoin('users as rv', `${APPEAL_TABLE}.reviewed_by`, 'rv.id')
      .leftJoin(BAN_TABLE, `${APPEAL_TABLE}.ban_id`, `${BAN_TABLE}.id`)
      .select(
        `${APPEAL_TABLE}.*`,
        'u.username as username',
        'u.email as email',
        'rv.username as reviewer_name',
        `${BAN_TABLE}.type as ban_type`,
        `${BAN_TABLE}.reason as ban_reason`,
      )
      .orderBy(`${APPEAL_TABLE}.created_at`, 'asc');

    if (status) q.where(`${APPEAL_TABLE}.status`, status);

    const offset = (page - 1) * limit;
    const [rows, [{ total }]] = await Promise.all([
      q.clone().offset(offset).limit(limit),
      q.clone().clearSelect().count('* as total'),
    ]);
    return { rows, total: parseInt(total) || 0, page, limit };
  },

  // 审核申诉
  async reviewAppeal(appealId, { status, note, reviewerId }) {
    return db(APPEAL_TABLE).where({ id: appealId }).update({
      status,
      review_note: note || null,
      reviewed_by: reviewerId,
      updated_at: db.fn.now(),
    });
  },

  // 获取单个申诉
  async getAppealById(id) {
    return db(APPEAL_TABLE).where({ id }).first();
  },
};

module.exports = banDao;
