[中文](./README.md) | **English**

# BookAgent - AI Novel Writing Platform

A creative workbench for novel writers that goes beyond simple "AI ghostwriting." BookAgent is a **human-AI collaborative platform** — the author steers the story while AI handles structural analysis, context maintenance, and content generation, freeing creators to focus on imagination rather than repetitive labor.

## Why BookAgent

### 1. Structured Multi-Phase Pipeline

Most AI writing tools offer a single "chat and generate" flow. BookAgent decomposes the creative process into **four distinct phases**, each handled by a dedicated Agent:

- **Outline** — Analyze genre, build world settings, plan main plot and subplots
- **Characters** — Extract personality traits, abilities, and relationship networks into structured profiles
- **Chapter Outlines** — Plan per-chapter summaries, key events, involved characters, and end-of-chapter hooks
- **Writing** — Stream-generate chapter content based on outlines and accumulated context for narrative coherence

This phased design produces more controllable, consistent output — avoiding plot discontinuity and character inconsistency common in one-shot generation.

### 2. Smart Import: Preserves Your Original Content

Paste existing novel text and the platform will:
- Automatically detect chapter boundaries (supports "第X章", "Chapter N", and other formats)
- AI-analyze the overview and extract character profiles
- **Preserve original content** for submitted chapters — no overwriting, no rewriting
- Only infer **missing preceding chapters** (e.g., submit chapters 5-8, auto-generate outlines for chapters 1-4) — no content generated beyond what you submitted
- Accept supplementary instructions to guide AI analysis direction

### 3. Multi-Provider Smart Routing

Different creative phases have different model requirements. BookAgent lets you assign different AI models per phase:

```json
[
  {
    "name": "openai",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "${OPENAI_API_KEY}",
    "models": [{"name": "gpt-4o", "phases": ["outline", "characters"]}]
  },
  {
    "name": "deepseek",
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKey": "${DEEPSEEK_API_KEY}",
    "models": [{"name": "deepseek-chat", "phases": ["write_chapter"]}]
  }
]
```

Use powerful models for outlines and character design (requiring creativity and logic), and cost-effective models for writing (requiring speed and throughput) — mix and match freely.

### 4. Context Memory Management

The core challenge of long-form novel writing is **coherence**. BookAgent's ContextManager implements:

- **Rolling chapter summary window** — Automatically maintains summaries for the latest 50 chapters, trimming when exceeding 100 entries
- **Persistent character data** — Character profiles accessible throughout the writing process, auto-injected into prompts
- **Conversation history** — Records AI interactions for context backtracking
- **Deferred persistence** — Dirty flag + timer pattern reduces database write frequency
- **Crash recovery** — Context state persisted to MySQL, auto-restored on restart

### 5. Bidirectional MCP Integration

Supports Model Context Protocol as both client and server:

**As Server** — Exposes novel management as MCP tools for external AI apps like Claude and Cursor:
- `list_novels` — List novel projects
- `get_novel` — Get novel details
- `create_novel` — Create a new novel
- `write_chapter` — Generate chapter content

**As Client** — Calls external MCP tools (search engines, knowledge bases) during writing to enrich creative material.

### 6. Skill System

Inject custom skills to extend AI writing capabilities:
- Attach specialized prompts to specific creative phases
- Global writing style directives for consistent tone across the entire book
- Skills matched precisely by phase (`outline` / `characters` / `write_chapter` / `all`)

### 7. Real-Time Streaming Output

All AI generation uses SSE (Server-Sent Events) for real-time streaming:
- Character-by-character rendering, no waiting for full responses
- Mid-stream cancellation via AbortController
- Progress callbacks showing current phase and completion percentage
- `proxy_buffering off` ensures zero latency under Nginx

### 8. Multi-Format Export

Five export formats for different use cases:

| Format | Use Case |
|--------|----------|
| TXT | Plain text, universal compatibility |
| DOCX | Word document, easy editing and formatting |
| PDF | Formal document, consistent layout |
| EPUB | E-book, reader-friendly |
| JSON | Structured data, secondary development |

Export scope supports full book, single chapter, or chapter range. Outline-only export available.

### 9. Mobile-Responsive Design

Cross-platform responsive layout:
- Adaptive modal widths (`95vw` on mobile)
- Auto-stacking form layouts
- Compact step indicators
- Touch-optimized controls (enhanced delete button visibility)
- Self-adjusting streaming output area height

### 10. Security & Operations

- **JWT Authentication** — All API endpoints protected, token renewal support
- **Rate Limiting** — Login throttling + global limits to prevent abuse
- **Token Tracking** — Logs token consumption for every AI call
- **User Groups** — Admin / regular user permission isolation
- **Structured Logging** — pino logging system, production-ready log collection
- **Environment Management** — Sensitive config stays out of code, `.env` files in `.gitignore`

## Feature Summary

### Creative Workbench
- Smart import (preserve original + infer preceding chapters)
- Full book outline generation
- Character profile generation & editing
- Per-chapter outline generation
- Per-chapter streaming writing
- Manual trigger / batch continuation

### System Administration
- Multi AI Provider configuration & routing
- User registration / login / groups / permissions
- Template store (create / share / reuse)
- MCP tool management
- Data export (TXT / DOCX / PDF / EPUB / JSON)
- Skill system

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript + Ant Design 5 + Zustand + Vite |
| Backend | Node.js + Express 5 + Knex.js (MySQL) |
| AI | OpenAI-compatible API with multi-provider routing |
| Auth | JWT + bcrypt |
| Deployment | PM2 + Nginx |

## Project Structure

```
bookagent/
├── backend/
│   ├── src/
│   │   ├── config/         # Database & OpenAI configuration
│   │   ├── core/
│   │   │   ├── agents/     # AI Agents (outline / characters / chapters / writing / import)
│   │   │   ├── mcp/        # MCP client / server / tool adapter
│   │   │   └── utils/      # Context management, word counting
│   │   ├── dao/            # Data access layer (Knex wrappers)
│   │   ├── middleware/     # Auth, rate limiting, token tracking
│   │   ├── routes/         # REST API routes
│   │   ├── services/       # Business logic layer
│   │   └── scripts/        # Admin scripts
│   ├── migrations/         # Database migrations
│   ├── seeds/              # Initial data seeds
│   └── .env.example        # Environment variable template
├── frontend/
│   ├── src/
│   │   ├── api/            # API wrappers (incl. SSE streaming)
│   │   ├── components/     # Shared components
│   │   ├── pages/          # Pages (login / dashboard / novel workbench / admin / template store)
│   │   ├── store/          # Zustand state management
│   │   └── styles/         # Global styles
│   └── vite.config.ts
└── deploy-bookagent.tar.gz # Deployment archive
```

## Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8.0+
- npm

### Install Dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install
```

### Configure Environment Variables

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your database credentials, JWT secret, and AI API keys:

```env
# Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PWD}
DB_NAME=novel_writing

# JWT (use a strong random string)
JWT_SECRET=${JWT_SECRET}

# AI Provider (single-provider simple mode)
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_MODEL=gpt-4o

# Multi-provider mode (overrides single-provider config above)
# OPENAI_PROVIDERS=[{"name":"openai","baseUrl":"https://api.openai.com/v1","apiKey":"${OPENAI_API_KEY}","models":[{"name":"gpt-4o","phases":["all"]}]},{"name":"deepseek","baseUrl":"https://api.deepseek.com/v1","apiKey":"${DEEPSEEK_API_KEY}","models":[{"name":"deepseek-chat","phases":["outline","write_chapter"]}]}]
```

### Initialize Database

```bash
cd backend
npm run migrate       # Run migrations
npm run seed          # Seed initial config
npm run create-admin  # Create admin account
```

### Start Development Servers

```bash
# Backend (default http://localhost:3000)
cd backend && npm run dev

# Frontend (default http://localhost:5173)
cd frontend && npm run dev
```

## Deployment

### Build & Package

```bash
# Build frontend
cd frontend && npx vite build

# Create deployment archive (excludes node_modules, .env, logs)
cd .. && tar -czf deploy-bookagent.tar.gz \
  --exclude='node_modules' --exclude='.env' --exclude='*.log' \
  --exclude='.git' --exclude='.claude' \
  backend/ frontend/dist/
```

### Linux Server Deployment

```bash
# Upload and extract
scp deploy-bookagent.tar.gz user@server:/opt/
ssh user@server "cd /opt && tar -xzf deploy-bookagent.tar.gz"

# Install production dependencies
cd /opt/backend && npm install --production

# Configure environment
cp .env.example .env && vim .env

# Initialize database
npm run migrate && npm run seed && npm run create-admin

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend static assets
    location / {
        root /opt/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;  # Required for SSE streaming
    }
}
```

## API Overview

| Module | Path Prefix | Description |
|--------|-------------|-------------|
| Auth | `/api/auth` | Registration, login, captcha |
| Novels | `/api/novels` | CRUD, import, export |
| Chapters | `/api/chapters` | Chapter content read/write |
| Agent | `/api/agents` | AI generation (outline / characters / chapters / writing / smart import) |
| MCP | `/api/mcp` | MCP tool management and invocation |
| Admin | `/api/admin` | User management, system config, AI provider config |
| Templates | `/api/templates` | Template store |
| Skills | `/api/skills` | Skill system |

## License

This project is licensed under the [Apache License 2.0](http://www.apache.org/licenses/LICENSE-2.0).
