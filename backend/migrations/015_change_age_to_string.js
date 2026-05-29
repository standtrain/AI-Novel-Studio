exports.up = function (knex) {
  return knex.schema.alterTable('characters', (t) => {
    t.string('age', 50).nullable().alter().comment('年龄（支持描述性文本，如25岁、十七八岁、中年等）');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('characters', (t) => {
    t.integer('age').unsigned().nullable().alter().comment('年龄');
  });
};
