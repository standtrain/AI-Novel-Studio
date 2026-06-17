require('dotenv').config();

const dbPassword = process.env.DB_PASSWORD ?? process.env.DB_PWD ?? '';

module.exports = {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT, 10) || 3306,
      user: process.env.DB_USER || '',
      password: dbPassword,
      database: process.env.DB_NAME || 'novel_writing',
      charset: 'utf8mb4',
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './seeds',
    },
    pool: { min: 2, max: 10 },
  },
};
