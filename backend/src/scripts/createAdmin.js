// 创建管理员账号脚本
// 用法：node src/scripts/createAdmin.js --username admin --password xxx --email admin@example.com
// 也可以通过 ADMIN_PASSWORD 环境变量传入密码，脚本不会回显明文密码。
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
  const password = getArg('password') || process.env.ADMIN_PASSWORD;
  const email = getArg('email') || 'admin@example.com';

  if (!password) {
    process.stderr.write('错误：请通过 --password 或 ADMIN_PASSWORD 环境变量提供管理员密码。\n');
    process.exit(1);
  }
  if (password.length < 12) {
    process.stderr.write('错误：管理员密码长度不能少于 12 位。\n');
    process.exit(1);
  }

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
    process.stdout.write('  密码：已由命令行或环境变量设置，出于安全原因不回显。\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`创建管理员失败：${err.message}\n`);
    process.exit(1);
  }
}

createAdmin();
