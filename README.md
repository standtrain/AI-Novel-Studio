**中文** | [English](./README_EN.md)

# BookAgent - AI 小说写作平台

一个面向网文创作者的智能写作平台，提供从灵感到成稿的完整工作流。平台不是简单的"AI 代写工具"，而是一个**人机协作的创作工作台** — 作者掌控故事方向，AI 负责结构化分析、上下文维护和内容生成，让创作者专注于想象力而非重复劳动。

## 为什么选择 BookAgent

### 1. 全流程结构化创作

大多数 AI 写作工具只提供"对话式生成"，BookAgent 将创作过程拆解为**大纲 → 人设 → 章纲 → 正文**四个明确阶段，每个阶段有独立的 Agent 处理：

- **大纲阶段** — 分析题材、设定世界观、规划主线与支线
- **人设阶段** — 提取角色性格、能力、关系网，生成结构化档案
- **章纲阶段** — 逐章规划摘要、关键事件、出场角色、章尾钩子
- **写作阶段** — 基于章纲和上下文流式生成正文，保持前后连贯

这种分阶段设计让 AI 的输出更可控、更一致，避免一次性生成导致的剧情断裂和角色崩坏。

### 2. 智能导入：保留你的原文

粘贴已有小说文本，平台会：
- 自动识别章节边界（支持"第X章"、"Chapter N"等多种格式）
- AI 分析小说概览并提取角色信息
- 为已提交的章节保留**原始内容**，不覆盖、不改写
- 仅推断**缺失的前置章节**大纲（如提交第5-8章，自动推断第1-4章），不生成后续内容
- 支持补充意见引导 AI 分析方向

### 3. 多 Provider 智能路由

不同创作阶段对模型能力的要求不同。BookAgent 支持按阶段分配不同的 AI 模型：

```json
[
  {
    "name": "openai",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-xxx",
    "models": [{"name": "gpt-4o", "phases": ["outline", "characters"]}]
  },
  {
    "name": "deepseek",
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKey": "sk-xxx",
    "models": [{"name": "deepseek-chat", "phases": ["write_chapter"]}]
  }
]
```

用强模型做大纲和人设（需要创意和逻辑），用高性价比模型写正文（需要速度和成本优势），灵活组合。

### 4. 上下文记忆管理

长篇小说写作的核心挑战是**连贯性**。BookAgent 的 ContextManager 实现了：

- **章节摘要滚动窗口** — 自动维护最近 50 章的摘要，超过 100 条时自动裁剪
- **角色信息持久化** — 角色设定全程可访问，写作时自动注入
- **对话历史管理** — 记录 AI 交互过程，支持上下文回溯
- **延迟持久化** — 脏标记 + 定时器，减少数据库写入频率
- **中断恢复** — 上下文状态持久化到 MySQL，重启后自动恢复

### 5. MCP 双向集成

支持 Model Context Protocol，既可以作为 MCP 客户端调用外部工具，也可以作为 MCP 服务端暴露平台能力：

**作为服务端** — 将小说管理能力暴露为 MCP 工具，供 Claude、Cursor 等外部 AI 应用调用：
- `list_novels` — 列出小说项目
- `get_novel` — 获取小说详情
- `create_novel` — 创建新小说
- `write_chapter` — 生成章节内容

**作为客户端** — 在写作过程中调用外部 MCP 工具（如搜索引擎、知识库查询），丰富创作素材。

### 6. 技能系统

支持自定义技能注入，扩展 AI 的写作能力：
- 为特定创作阶段附加专业提示词
- 全局写作风格指令，统一全书语调
- 技能可按阶段（outline / characters / write_chapter / all）精确匹配

### 7. 实时流式输出

所有 AI 生成均采用 SSE（Server-Sent Events）实时流式传输：
- 逐字呈现，无需等待完整响应
- 支持中途取消（AbortController）
- 进度回调显示当前阶段和完成百分比
- 后端 `proxy_buffering off` 确保 Nginx 下无延迟

### 8. 多格式导出

支持 5 种导出格式，满足不同场景需求：

| 格式 | 用途 |
|------|------|
| TXT | 纯文本，通用兼容 |
| DOCX | Word 文档，便于编辑排版 |
| PDF | 正式文档，保持格式一致 |
| EPUB | 电子书，适配阅读器 |
| JSON | 结构化数据，便于二次开发 |

导出范围支持全书、单章、指定章节区间，大纲单独导出。

### 9. 移动端适配

全平台响应式设计：
- 弹窗宽度自适应（`95vw` on mobile）
- 表单布局自动堆叠
- 步骤条紧凑模式
- 触摸设备优化（删除按钮可见性提升）
- 流式输出区域高度自适应

### 10. 安全与运维

- **JWT 鉴权** — 全 API 接口认证，支持 Token 过期续签
- **速率限制** — 登录限流 + 全局限流，防止滥用
- **Token 统计** — 记录每次 AI 调用的 Token 消耗
- **用户分组** — 管理员/普通用户权限隔离
- **结构化日志** — pino 日志系统，支持生产环境日志采集
- **环境变量管理** — 敏感配置不入代码，`.env` 文件纳入 `.gitignore`

## 功能一览

### 创作工作台
- 智能导入（保留原文 + 推断前置章节）
- 整书大纲生成
- 人物设定生成与编辑
- 章节大纲逐章生成
- 逐章正文流式写作
- 手动触发 / 批量续写

### 系统管理
- 多 AI Provider 配置与路由
- 用户注册/登录/分组/权限
- 模板商店（创建/分享/复用）
- MCP 工具管理
- 数据导出（TXT/DOCX/PDF/EPUB/JSON）
- 技能系统

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Ant Design 5 + Zustand + Vite |
| 后端 | Node.js + Express 5 + Knex.js (MySQL) |
| AI | OpenAI 兼容 API（支持多 Provider 路由） |
| 认证 | JWT + bcrypt |
| 部署 | PM2 + Nginx |

## 项目结构

```
bookagent/
├── backend/
│   ├── src/
│   │   ├── config/         # 数据库、OpenAI 配置
│   │   ├── core/
│   │   │   ├── agents/     # AI Agent（大纲/人设/章纲/写作/导入）
│   │   │   ├── mcp/        # MCP 客户端/服务端/工具适配
│   │   │   └── utils/      # 上下文管理、字数统计
│   │   ├── dao/            # 数据访问层（Knex 封装）
│   │   ├── middleware/     # 鉴权、限流、Token 统计
│   │   ├── routes/         # REST API 路由
│   │   ├── services/       # 业务逻辑层
│   │   └── scripts/        # 管理脚本
│   ├── migrations/         # 数据库迁移
│   ├── seeds/              # 初始数据
│   └── .env.example        # 环境变量模板
├── frontend/
│   ├── src/
│   │   ├── api/            # API 封装（含 SSE 流式调用）
│   │   ├── components/     # 通用组件
│   │   ├── pages/          # 页面（登录/仪表盘/小说工作台/管理后台/模板商店）
│   │   ├── store/          # Zustand 状态管理
│   │   └── styles/         # 全局样式
│   └── vite.config.ts
└── deploy-bookagent.tar.gz # 部署包
```

## 快速开始

### 环境要求

- Node.js 18+
- MySQL 8.0+
- npm

### 安装依赖

```bash
# 后端
cd backend && npm install

# 前端
cd frontend && npm install
```

### 配置环境变量

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`，填写数据库连接、JWT 密钥、AI API 配置：

```env
# 数据库
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=novel_writing

# JWT（请使用强随机字符串）
JWT_SECRET=your_jwt_secret

# AI Provider（单 Provider 简易模式）
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4o

# 多 Provider 模式（设置后忽略上方单 Provider 配置）
# OPENAI_PROVIDERS=[{"name":"openai","baseUrl":"https://api.openai.com/v1","apiKey":"sk-xxx","models":[{"name":"gpt-4o","phases":["all"]}]},{"name":"deepseek","baseUrl":"https://api.deepseek.com/v1","apiKey":"sk-xxx","models":[{"name":"deepseek-chat","phases":["outline","write_chapter"]}]}]
```

### 初始化数据库

```bash
cd backend
npm run migrate       # 创建表结构
npm run seed          # 写入初始配置
npm run create-admin  # 创建管理员账号
```

### 启动开发服务

```bash
# 后端（默认 http://localhost:3000）
cd backend && npm run dev

# 前端（默认 http://localhost:5173）
cd frontend && npm run dev
```

## 部署

### 打包

```bash
# 构建前端
cd frontend && npx vite build

# 打包部署包（排除 node_modules、.env、日志）
cd .. && tar -czf deploy-bookagent.tar.gz \
  --exclude='node_modules' --exclude='.env' --exclude='*.log' \
  --exclude='.git' --exclude='.claude' \
  backend/ frontend/dist/
```

### Linux 服务器部署

```bash
# 上传并解压
scp deploy-bookagent.tar.gz user@server:/opt/
ssh user@server "cd /opt && tar -xzf deploy-bookagent.tar.gz"

# 安装生产依赖
cd /opt/backend && npm install --production

# 配置环境变量
cp .env.example .env && vim .env

# 初始化数据库
npm run migrate && npm run seed && npm run create-admin

# 使用 PM2 启动
pm2 start ecosystem.config.js
pm2 save
```

### Nginx 参考配置

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态资源
    location / {
        root /opt/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;  # SSE 流式输出需要关闭缓冲
    }
}
```

## API 概览

| 模块 | 路径前缀 | 说明 |
|------|----------|------|
| 认证 | `/api/auth` | 注册、登录、验证码 |
| 小说 | `/api/novels` | CRUD、导入、导出 |
| 章节 | `/api/chapters` | 章节内容读写 |
| Agent | `/api/agents` | AI 生成（大纲/人设/章纲/写作/智能导入） |
| MCP | `/api/mcp` | MCP 工具管理与调用 |
| 管理 | `/api/admin` | 用户管理、系统配置、AI Provider 配置 |
| 模板 | `/api/templates` | 模板商店 |
| 技能 | `/api/skills` | 技能系统 |

## 许可证

本项目基于 [Apache License 2.0](http://www.apache.org/licenses/LICENSE-2.0) 开源。
