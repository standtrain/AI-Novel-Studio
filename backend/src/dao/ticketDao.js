const { db } = require('../config/database');

const TICKET_TABLE = 'tickets';
const REPLY_TABLE = 'ticket_replies';
const APPEAL_TABLE = 'user_appeals';
const BAN_TABLE = 'user_bans';

function applyTicketFilters(query, { userId, type, status, priority, q } = {}) {
  if (userId) query.where(`${TICKET_TABLE}.user_id`, userId);
  if (type) query.where(`${TICKET_TABLE}.type`, type);
  if (status) query.where(`${TICKET_TABLE}.status`, status);
  if (priority) query.where(`${TICKET_TABLE}.priority`, priority);
  if (q) {
    const term = `%${q}%`;
    query.where(function () {
      this.where(`${TICKET_TABLE}.title`, 'like', term)
        .orWhere(`${TICKET_TABLE}.content`, 'like', term)
        .orWhere('u.username', 'like', term)
        .orWhere('u.email', 'like', term);
    });
  }
}

function baseTicketQuery() {
  return db(TICKET_TABLE)
    .leftJoin('users as u', `${TICKET_TABLE}.user_id`, 'u.id')
    .leftJoin(APPEAL_TABLE, function () {
      this.on(`${TICKET_TABLE}.source_type`, '=', db.raw('?', ['appeal']))
        .andOn(`${TICKET_TABLE}.source_id`, '=', `${APPEAL_TABLE}.id`);
    })
    .leftJoin(BAN_TABLE, `${APPEAL_TABLE}.ban_id`, `${BAN_TABLE}.id`)
    .leftJoin('users as rv', `${APPEAL_TABLE}.reviewed_by`, 'rv.id')
    .select(
      `${TICKET_TABLE}.*`,
      'u.username',
      'u.email',
      `${APPEAL_TABLE}.id as appeal_id`,
      `${APPEAL_TABLE}.ban_id as appeal_ban_id`,
      `${APPEAL_TABLE}.status as appeal_status`,
      `${APPEAL_TABLE}.review_note as appeal_review_note`,
      `${APPEAL_TABLE}.reviewed_by as appeal_reviewed_by`,
      `${APPEAL_TABLE}.ai_result as appeal_ai_result`,
      'rv.username as appeal_reviewer_name',
      `${BAN_TABLE}.type as ban_type`,
      `${BAN_TABLE}.reason as ban_reason`,
      `${BAN_TABLE}.status as ban_status`,
    );
}

function serializeJsonValue(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const ticketDao = {
  async createTicket(data, trx = db) {
    const [id] = await trx(TICKET_TABLE).insert(data);
    return id;
  },

  async createReply(data, trx = db) {
    const [id] = await trx(REPLY_TABLE).insert(data);
    return id;
  },

  async getById(id) {
    return baseTicketQuery().where(`${TICKET_TABLE}.id`, id).first();
  },

  async getByAppealId(appealId) {
    return baseTicketQuery()
      .where(`${TICKET_TABLE}.source_type`, 'appeal')
      .where(`${TICKET_TABLE}.source_id`, appealId)
      .first();
  },

  async list({ page = 1, limit = 20, userId, type, status, priority, q } = {}) {
    const offset = (page - 1) * limit;
    const query = baseTicketQuery();
    applyTicketFilters(query, { userId, type, status, priority, q });

    const countQuery = db(TICKET_TABLE)
      .leftJoin('users as u', `${TICKET_TABLE}.user_id`, 'u.id')
      .count('* as total');
    applyTicketFilters(countQuery, { userId, type, status, priority, q });

    const [rows, [{ total }]] = await Promise.all([
      query.orderBy(`${TICKET_TABLE}.updated_at`, 'desc').limit(limit).offset(offset),
      countQuery,
    ]);
    return { rows, total: parseInt(total, 10) || 0, page, limit };
  },

  async listReplies(ticketId) {
    return db(REPLY_TABLE)
      .leftJoin('users as u', `${REPLY_TABLE}.sender_id`, 'u.id')
      .select(`${REPLY_TABLE}.*`, 'u.username as sender_name')
      .where(`${REPLY_TABLE}.ticket_id`, ticketId)
      .orderBy(`${REPLY_TABLE}.created_at`, 'asc')
      .orderBy(`${REPLY_TABLE}.id`, 'asc');
  },

  async getLastReply(ticketId, trx = db, lock = false) {
    const query = trx(REPLY_TABLE)
      .where(`${REPLY_TABLE}.ticket_id`, ticketId)
      .orderBy(`${REPLY_TABLE}.id`, 'desc')
      .first();
    return lock ? query.forUpdate() : query;
  },

  async updateTicket(id, data, trx = db) {
    return trx(TICKET_TABLE).where({ id }).update({
      ...data,
      updated_at: db.fn.now(),
    });
  },

  async markReplyNotified(replyId) {
    return db(REPLY_TABLE)
      .where({ id: replyId })
      .whereNull('notification_sent_at')
      .update({ notification_sent_at: db.fn.now() });
  },

  async clearReplyNotified(replyId) {
    return db(REPLY_TABLE)
      .where({ id: replyId })
      .update({ notification_sent_at: null });
  },

  async createGeneralTicketWithFirstReply({ userId, title, content, priority }) {
    const trx = await db.transaction();
    try {
      const ticketId = await this.createTicket({
        user_id: userId,
        type: 'general',
        title,
        content,
        status: 'open',
        priority,
        source_type: 'manual',
        source_id: null,
      }, trx);
      await this.createReply({
        ticket_id: ticketId,
        sender_id: userId,
        sender_type: 'user',
        content,
        is_ai: false,
      }, trx);
      await trx.commit();
      return ticketId;
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  },

  async createAppealTicketWithFirstReply({ appealId, userId, content, aiResult, status = 'open' }) {
    const trx = await db.transaction();
    try {
      const ticketId = await this.createTicket({
        user_id: userId,
        type: 'appeal',
        title: `封禁申诉 #${appealId}`,
        content,
        status,
        priority: 'normal',
        source_type: 'appeal',
        source_id: appealId,
        ai_result: serializeJsonValue(aiResult),
        closed_at: ['resolved', 'closed'].includes(status) ? db.fn.now() : null,
      }, trx);
      await this.createReply({
        ticket_id: ticketId,
        sender_id: userId,
        sender_type: 'user',
        content,
        is_ai: false,
      }, trx);
      await trx(APPEAL_TABLE).where({ id: appealId }).update({ ticket_id: ticketId });
      await trx.commit();
      return ticketId;
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  },

  async linkAppealTicket(appealId, ticketId) {
    return db(APPEAL_TABLE).where({ id: appealId }).update({ ticket_id: ticketId });
  },
};

module.exports = ticketDao;
