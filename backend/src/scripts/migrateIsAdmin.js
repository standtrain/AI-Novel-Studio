/**
 * 数据库迁移脚本
 * 添加 is_admin 字段到 user_groups 表
 */

const { db } = require('../config/database');

async function migrate() {
  console.log('开始数据库迁移...');

  try {
    const hasColumn = await db.schema.hasColumn('user_groups', 'is_admin');
    if (!hasColumn) {
      await db.schema.table('user_groups', (table) => {
        table.boolean('is_admin').defaultTo(false).comment('是否具有管理员权限');
      });
      console.log('✓ user_groups 表添加 is_admin 字段成功');
    } else {
      console.log('- user_groups.is_admin 字段已存在，跳过');
    }
  } catch (err) {
    console.error('添加 is_admin 字段失败:', err.message);
  }

  console.log('数据库迁移完成');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('迁移失败:', err);
  process.exit(1);
});