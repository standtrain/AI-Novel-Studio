require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { db, testConnection } = require('./config/database');
const { initLimiters } = require('./middleware/rateLimiter');
const { createLogger } = require('./utils/logger');

// 路由
const authRoutes = require('./routes/auth');
const novelRoutes = require('./routes/novels');
const chapterRoutes = require('./routes/chapters');
const agentRoutes = require('./routes/agents');
const adminRoutes = require('./routes/admin');
const siteRoutes = require('./routes/site');
const skillsRoutes = require('./routes/skills');
const adminSkillsRoutes = require('./routes/adminSkills');
const mcpRoutes = require('./routes/mcp');
const adminMcpRoutes = require('./routes/adminMcp');
const mcpEndpointRoutes = require('./routes/mcpEndpoint');
const exportRoutes = require('./routes/export');
const templateRoutes = require('./routes/templates');

const logger = createLogger('app');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ---------- 全局中间件 ----------

// 动态 CORS：从 site_config 读取，默认关闭，管理员可在后台开启（60 秒缓存）
const configDao = require('./dao/configDao');

let _corsCache = null;
let _corsCacheTime = 0;
const CORS_CACHE_MS = 60 * 1000;

async function getCorsConfig() {
  const now = Date.now();
  if (_corsCache && (now - _corsCacheTime < CORS_CACHE_MS)) return _corsCache;

  try {
    const [enabledRaw, originsRaw] = await Promise.all([
      configDao.get('cors_enabled'),
      configDao.get('cors_origins'),
    ]);

    const enabled = enabledRaw === 'true';
    let origins = [];
    if (originsRaw && originsRaw.trim()) {
      try {
        origins = JSON.parse(originsRaw);
        if (!Array.isArray(origins)) origins = [];
      } catch {
        origins = originsRaw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      }
    }

    _corsCache = { enabled, origins };
  } catch {
    _corsCache = { enabled: false, origins: [] };
  }
  _corsCacheTime = now;
  return _corsCache;
}

// CORS 中间件：仅在管理员启用 cors_enabled 后生效
app.use(async (req, res, next) => {
  const config = await getCorsConfig();
  if (!config.enabled) return next();

  cors({
    origin: (origin, callback) => {
      // 服务端请求（无 origin 头）始终放行
      if (!origin) return callback(null, true);
      if (config.origins.length === 0 || config.origins.includes('*') || config.origins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })(req, res, next);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb', type: 'text/plain' }));

// 请求日志
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ---------- 路由挂载 ----------
app.use('/api/auth', authRoutes);
app.use('/api/novels', agentRoutes);
app.use('/api/novels', exportRoutes);
app.use('/api/novels', novelRoutes);
app.use('/api/novels/:id/chapters', chapterRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/site', siteRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/admin/skills', adminSkillsRoutes);
app.use('/api/mcp', mcpRoutes);
app.use('/api/admin/mcp', adminMcpRoutes);
app.use('/api/mcp-endpoint', mcpEndpointRoutes);
app.use('/api/templates', templateRoutes);

const path = require('path');
const fs = require('fs');

// uploads 静态文件目录
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// 默认 favicon SVG（内联生成，匹配站点设计风格）
const DEFAULT_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#22d3ee"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="1.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#bg)"/>
  <text x="32" y="44" text-anchor="middle" font-size="36" font-family="serif" fill="white" filter="url(#glow)">✦</text>
</svg>`;

// favicon 路由：优先使用上传的自定义图标，否则返回默认 SVG
app.get(['/favicon.ico', '/favicon.svg'], async (_req, res) => {
  try {
    const configDao = require('./dao/configDao');
    const faviconPath = await configDao.get('favicon_path');
    if (faviconPath) {
      const fullPath = path.join(uploadsDir, faviconPath);
      if (fs.existsSync(fullPath)) {
        const ext = path.extname(faviconPath).toLowerCase();
        const mimeMap = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
        return res.type(mimeMap[ext] || 'image/png').sendFile(fullPath);
      }
    }
    res.type('image/svg+xml').send(DEFAULT_FAVICON_SVG);
  } catch {
    res.type('image/svg+xml').send(DEFAULT_FAVICON_SVG);
  }
});

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- 生产模式：托管前端静态文件 ----
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback：非 API 路由全部返回 index.html
  app.get('{*path}', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: '接口不存在' });
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  logger.info('已启用前端静态文件托管（生产模式）');
}

// ---------- 全局错误处理 ----------
app.use((err, _req, res, _next) => {
  logger.error(err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
  });
});

// ---------- 启动 ----------
async function start() {
  try {
    // 测试数据库连接
    await testConnection();

    // 注入 configDao 到 openai 配置模块，使 Provider 配置可从 DB 加载
    const configDao = require('./dao/configDao');
    const { setConfigDao, initFromDB } = require('./config/openai');
    setConfigDao(configDao);
    await initFromDB();

    // 初始化分组限流器
    const groups = await db('user_groups').select('*');
    initLimiters(groups);
    logger.info(`已加载 ${groups.length} 个用户组的限流配置`);

    app.listen(PORT, () => {
      logger.info(`小说写作平台后端已启动：http://localhost:${PORT}`);
      logger.info(`API 文档：http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    logger.error('启动失败：' + err.message);
    process.exit(1);
  }
}

start();
