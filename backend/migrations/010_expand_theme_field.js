// 将 novels 表的 theme 字段从 string(255) 扩展为 text，以支持更长的主题描述

exports.up = function (knex) {
  return knex.schema.alterTable('novels', (t) => {
    // 将 theme 字段从 varchar(255) 改为 text
    t.text('theme').alter();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('novels', (t) => {
    // 回退到 varchar(255)
    t.string('theme', 255).alter();
  });
};