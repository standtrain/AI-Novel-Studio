exports.up = function (knex) {
  return knex.schema.createTable('chapters', (t) => {
    t.increments('id').primary();
    t.integer('novel_id').unsigned().notNullable().references('id').inTable('novels').onDelete('CASCADE').comment('所属小说');
    t.integer('chapter_number').unsigned().notNullable().comment('章节编号');
    t.string('title', 200).notNullable().comment('章节标题');
    t.string('brief', 500).nullable().comment('一句话概述');
    t.json('scenes').nullable().comment('场景描述数组');
    t.string('conflict', 500).nullable().comment('本章核心冲突');
    t.string('turning_point', 500).nullable().comment('转折点');
    t.json('characters_involved').nullable().comment('涉及角色列表');
    t.string('emotional_tone', 100).nullable().comment('情感基调');
    t.string('ending_hook', 500).nullable().comment('结尾悬念');
    t.text('content', 'mediumtext').nullable().comment('正文内容（约2500字中文）');
    t.string('summary', 255).nullable().comment('自动生成的章节摘要');
    t.enu('status', ['outline', 'writing', 'completed']).notNullable().defaultTo('outline').comment('章节状态');
    t.integer('word_count').unsigned().defaultTo(0).comment('字数');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['novel_id', 'chapter_number'], 'uq_novel_chapter');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('chapters');
};
