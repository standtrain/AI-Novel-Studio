exports.up = function (knex) {
  return knex.schema.createTable('characters', (t) => {
    t.increments('id').primary();
    t.integer('novel_id').unsigned().notNullable().references('id').inTable('novels').onDelete('CASCADE').comment('所属小说');
    t.string('name', 100).notNullable().comment('角色姓名');
    t.integer('age').unsigned().nullable().comment('年龄');
    t.string('gender', 10).nullable().comment('性别');
    t.string('role', 50).nullable().comment('主角/配角/反派');
    t.text('appearance').nullable().comment('外貌描写');
    t.text('personality').nullable().comment('性格特点');
    t.text('background').nullable().comment('人物背景故事');
    t.text('motivation').nullable().comment('核心动机/目标');
    t.text('arc').nullable().comment('人物成长弧线');
    t.json('relationships').nullable().comment('与其他角色的关系数组');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('characters');
};
