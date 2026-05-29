// 为 skills 表添加 allowed_tools 和 metadata 字段，支持 Claude Code Skill 格式
exports.up = function (knex) {
  return knex.schema.table('skills', (t) => {
    t.text('allowed_tools').nullable().comment('Claude Code SKILL.md 声明的允许工具列表');
    t.json('metadata').nullable().comment('扩展元数据（原始 frontmatter 额外字段、references 文件列表等）');
  });
};

exports.down = function (knex) {
  return knex.schema.table('skills', (t) => {
    t.dropColumn('metadata');
    t.dropColumn('allowed_tools');
  });
};
