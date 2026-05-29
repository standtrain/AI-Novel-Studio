exports.up = function (knex) {
  return knex.schema.alterTable('novels', (t) => {
    t.index(['user_id', 'updated_at'], 'idx_novel_user_updated');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('novels', (t) => {
    t.dropIndex(['user_id', 'updated_at'], 'idx_novel_user_updated');
  });
};
