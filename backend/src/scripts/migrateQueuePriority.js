/**
 * 数据库迁移脚本
 * 添加排队优先级相关字段
 */

const { db } = require('../config/database');

async function migrate() {
  console.log('开始数据库迁移...');

  // 1. 添加 queue_priority 字段到 user_groups 表
  try {
    const hasColumn = await db.schema.hasColumn('user_groups', 'queue_priority');
    if (!hasColumn) {
      await db.schema.table('user_groups', (table) => {
        table.integer('queue_priority').defaultTo(10).comment('排队优先级，默认10');
      });
      console.log('✓ user_groups 表添加 queue_priority 字段成功');
    } else {
      console.log('- user_groups.queue_priority 字段已存在，跳过');
    }
  } catch (err) {
    console.error('添加 queue_priority 字段失败:', err.message);
  }

  // 2. 创建 queue_tasks 表
  try {
    const hasTable = await db.schema.hasTable('queue_tasks');
    if (!hasTable) {
      await db.schema.createTable('queue_tasks', (table) => {
        table.increments('id').primary();
        table.integer('user_id').notNullable();
        table.integer('novel_id').notNullable();
        table.string('phase', 50).notNullable();
        table.integer('user_group_priority').notNullable().comment('用户所属分组的优先级');
        table.string('status', 20).defaultTo('waiting').comment('waiting/running/completed/cancelled/interrupted');
        table.string('interrupted_reason', 255).nullable();
        table.datetime('created_at').defaultTo(db.fn.now());
        table.datetime('updated_at').defaultTo(db.fn.now());

        table.index(['user_id', 'status']);
        table.index(['user_group_priority']);
      });
      console.log('✓ queue_tasks 表创建成功');
    } else {
      console.log('- queue_tasks 表已存在，跳过');
    }
  } catch (err) {
    console.error('创建 queue_tasks 表失败:', err.message);
  }

  console.log('数据库迁移完成');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('迁移失败:', err);
  process.exit(1);
});