// 创建管理员账号脚本
// 用法：node src/scripts/createAdmin.js --username admin --password xxx --email admin@example.com
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const bcrypt = require('bcrypt');
const { db, testConnection } = require('../config/database');

async function createAdmin() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : null;
  };

  const username = getArg('username') || 'admin';
  const password = getArg('password') || 'admin123';
  const email = getArg('email') || 'admin@example.com';

  try {
    await testConnection();

    // 检查 admin 组是否存在
    const adminGroup = await db('user_groups').where('name', 'admin').first();
    if (!adminGroup) {
      process.stderr.write('错误：admin 用户组不存在，请先运行 knex seed:run\n');
      process.exit(1);
    }

    // 检查是否已存在同名用户
    const existing = await db('users').where('username', username).first();
    if (existing) {
      process.stdout.write(`用户 "${username}" 已存在，正在更新为管理员...\n`);
      const passwordHash = await bcrypt.hash(password, 10);
      await db('users').where('id', existing.id).update({
        group_id: adminGroup.id,
        password_hash: passwordHash,
        status: 'active',
      });
      process.stdout.write(`管理员 "${username}" 已更新成功\n`);
    } else {
      const passwordHash = await bcrypt.hash(password, 10);
      await db('users').insert({
        username,
        email,
        password_hash: passwordHash,
        group_id: adminGroup.id,
        status: 'active',
      });
      process.stdout.write(`管理员 "${username}" 创建成功！\n`);
    }

    process.stdout.write(`\n登录信息：\n`);
    process.stdout.write(`  用户名：${username}\n`);
    process.stdout.write(`  密码：${password}\n`);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`创建管理员失败：${err.message}\n`);
    process.exit(1);
  }
}

createAdmin();
