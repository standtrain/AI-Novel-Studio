const { db } = require('../config/database');

const TABLE = 'notifications';

const notificationDao = {
  async list({ page = 1, limit = 20, enabled } = {}) {
    const offset = (page - 1) * limit;
    let query = db(TABLE);
    if (enabled !== undefined) {
      query = query.where('enabled', enabled);
    }
    const [{ total }] = await query.clone().count('* as total');
    const rows = await query
      .orderBy('sort_order', 'desc')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
    return { rows, total: parseInt(total, 10), page, limit };
  },

  async getById(id) {
    return db(TABLE).where('id', id).first();
  },

  async create(data) {
    const { title, content, show_popup, show_banner, enabled, sort_order } = data;
    const [id] = await db(TABLE).insert({
      title,
      content,
      show_popup: show_popup ? 1 : 0,
      show_banner: show_banner ? 1 : 0,
      enabled: enabled !== false ? 1 : 0,
      sort_order: sort_order || 0,
    });
    return this.getById(id);
  },

  async update(id, data) {
    const fields = {};
    if (data.title !== undefined) fields.title = data.title;
    if (data.content !== undefined) fields.content = data.content;
    if (data.show_popup !== undefined) fields.show_popup = data.show_popup ? 1 : 0;
    if (data.show_banner !== undefined) fields.show_banner = data.show_banner ? 1 : 0;
    if (data.enabled !== undefined) fields.enabled = data.enabled ? 1 : 0;
    if (data.sort_order !== undefined) fields.sort_order = data.sort_order;
    fields.updated_at = db.fn.now();
    await db(TABLE).where('id', id).update(fields);
    return this.getById(id);
  },

  async delete(id) {
    return db(TABLE).where('id', id).del();
  },

  async getActiveForBanner() {
    return db(TABLE)
      .where('enabled', 1)
      .where('show_banner', 1)
      .orderBy('sort_order', 'desc')
      .orderBy('created_at', 'desc');
  },

  async getActiveForPopup() {
    return db(TABLE)
      .where('enabled', 1)
      .where('show_popup', 1)
      .orderBy('sort_order', 'desc')
      .orderBy('created_at', 'desc');
  },
};

module.exports = notificationDao;
