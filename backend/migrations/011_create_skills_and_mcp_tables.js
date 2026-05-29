// 创建 Skills 和 MCP 相关表
exports.up = function (knex) {
  return knex.schema
    // 技能定义表（全局）
    .createTable('skills', (t) => {
      t.increments('id').primary();
      t.string('name', 100).notNullable().unique().comment('技能唯一标识名');
      t.string('display_name', 200).notNullable().comment('技能显示名称');
      t.text('description').notNullable().comment('技能描述');
      t.string('icon', 50).nullable().comment('Ant Design 图标名称');
      t.text('system_prompt').notNullable().comment('技能系统提示词，支持 {{变量}} 占位符');
      t.string('phase', 50).notNullable().defaultTo('all').comment('适用阶段：outline/characters/chapters_outline/write_chapter/all');
      t.json('parameters_schema').nullable().comment('可配置参数的 JSON Schema');
      t.boolean('enabled').notNullable().defaultTo(true).comment('全局启用状态');
      t.integer('sort_order').notNullable().defaultTo(0).comment('排序权重');
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    })
    // 用户技能配置表（个人配置）
    .createTable('user_skills', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable().comment('用户 ID');
      t.integer('skill_id').unsigned().notNullable().comment('技能 ID');
      t.boolean('enabled').notNullable().defaultTo(true).comment('用户启用状态');
      t.json('parameters').nullable().comment('用户自定义参数');
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

      t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      t.foreign('skill_id').references('id').inTable('skills').onDelete('CASCADE');
      t.unique(['user_id', 'skill_id']);
    })
    // MCP 服务器定义表（全局）
    .createTable('mcp_servers', (t) => {
      t.increments('id').primary();
      t.string('name', 100).notNullable().unique().comment('服务器名称');
      t.string('transport', 20).notNullable().defaultTo('http').comment('传输协议：stdio/http/sse');
      t.string('command', 255).nullable().comment('stdio 模式下的启动命令');
      t.json('args').nullable().comment('stdio 模式下的命令参数数组');
      t.string('url', 500).nullable().comment('HTTP/SSE 模式下的服务端点 URL');
      t.json('headers').nullable().comment('自定义请求头，如 {"Authorization": "Bearer xxx"}');
      t.boolean('enabled').notNullable().defaultTo(true).comment('全局启用状态');
      t.text('description').nullable().comment('服务器描述/备注');
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    })
    // 用户 MCP 配置表（个人配置）
    .createTable('user_mcp_configs', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable().comment('用户 ID');
      t.integer('server_id').unsigned().notNullable().comment('MCP 服务器 ID');
      t.boolean('enabled').notNullable().defaultTo(true).comment('用户启用状态');
      t.string('api_key', 500).nullable().comment('用户个人 API Key（覆盖全局）');
      t.json('extra_config').nullable().comment('用户自定义额外配置');
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

      t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      t.foreign('server_id').references('id').inTable('mcp_servers').onDelete('CASCADE');
      t.unique(['user_id', 'server_id']);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('user_mcp_configs')
    .dropTableIfExists('mcp_servers')
    .dropTableIfExists('user_skills')
    .dropTableIfExists('skills');
};
