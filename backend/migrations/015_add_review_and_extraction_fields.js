// 为 chapters 表添加审查结果和提取结果字段
exports.up = function (knex) {
  return knex.schema.table('chapters', (t) => {
    t.json('review_result').nullable().comment('审查结果 JSON（issues 数组和 summary）');
    t.json('extraction_result').nullable().comment('数据提取结果 JSON（实体/状态变更/事件/场景/摘要）');
  });
};

exports.down = function (knex) {
  return knex.schema.table('chapters', (t) => {
    t.dropColumn('extraction_result');
    t.dropColumn('review_result');
  });
};
