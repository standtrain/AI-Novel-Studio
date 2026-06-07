const { db } = require('../config/database');

const TABLE = 'usage_logs';

function todayUsageQuery(conn = db) {
  return conn(TABLE)
    // 今日用量按数据库自然日统计，使用开区间上界避免异常未来时间戳污染今日额度。
    .where('created_at', '>=', conn.raw('CURDATE()'))
    .where('created_at', '<', conn.raw('DATE_ADD(CURDATE(), INTERVAL 1 DAY)'));
}

const usageLogDao = {
  async create(data, trx = db) {
    const [id] = await trx(TABLE).insert(data);
    return id;
  },

  async getDailyUsage(userId, trx = db) {
    const [{ total }] = await todayUsageQuery(trx)
      .where('user_id', userId)
      .sum('tokens_used as total');
    return parseInt(total, 10) || 0;
  },

  async getTodayTotalUsage(trx = db) {
    const [{ total }] = await todayUsageQuery(trx).sum('tokens_used as total');
    return parseInt(total, 10) || 0;
  },

  todayUsageByUserSubquery() {
    return todayUsageQuery()
      .select('user_id')
      .sum('tokens_used as tokens_used')
      .groupBy('user_id');
  },

  async getTotalUsage({ startDate, endDate } = {}) {
    let query = db(TABLE);
    if (startDate) query = query.where('created_at', '>=', startDate);
    if (endDate) query = query.where('created_at', '<=', endDate);
    const [result] = await query.sum('tokens_used as total');
    return parseInt(result.total, 10) || 0;
  },

  async listByUser(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const [rows, [{ total }]] = await Promise.all([
      db(TABLE).where('user_id', userId).orderBy('created_at', 'desc').limit(limit).offset(offset),
      db(TABLE).where('user_id', userId).count('* as total'),
    ]);
    return { rows, total: parseInt(total, 10), page, limit };
  },

  async list({ page = 1, limit = 50, userId } = {}) {
    let query = db(TABLE)
      .join('users', 'usage_logs.user_id', 'users.id')
      .select('usage_logs.*', 'users.username');
    if (userId) query = query.where('usage_logs.user_id', userId);
    const offset = (page - 1) * limit;
    const [rows, [{ total }]] = await Promise.all([
      query.clone().orderBy('usage_logs.created_at', 'desc').limit(limit).offset(offset),
      query.clone().count('* as total'),
    ]);
    return { rows, total: parseInt(total, 10), page, limit };
  },
};

module.exports = usageLogDao;
