// 将早期默认分组名 free 兼容迁移为 default，保持新旧安装行为一致。
exports.up = async function (knex) {
  const freeGroup = await knex('user_groups').where('name', 'free').first();
  const defaultGroup = await knex('user_groups').where('name', 'default').first();

  if (freeGroup && !defaultGroup) {
    await knex('user_groups').where('id', freeGroup.id).update({
      name: 'default',
      description: freeGroup.description === '免费用户' ? '默认用户' : freeGroup.description,
      updated_at: knex.fn.now(),
    });
  }
};

exports.down = async function (knex) {
  const defaultGroup = await knex('user_groups').where('name', 'default').first();
  const freeGroup = await knex('user_groups').where('name', 'free').first();

  if (defaultGroup && !freeGroup) {
    await knex('user_groups').where('id', defaultGroup.id).update({
      name: 'free',
      description: defaultGroup.description === '默认用户' ? '免费用户' : defaultGroup.description,
      updated_at: knex.fn.now(),
    });
  }
};
