#!/usr/bin/env bash
# ============================================
# AI 小说写作平台 - 部署打包脚本
# 用法: bash package.sh
# ============================================

set -e

# ---- 颜色 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
DEPLOY_DIR="$ROOT_DIR/deploy"
PACKAGE_NAME="bookagent-deploy-$(date +%Y%m%d-%H%M%S).tar.gz"
BUILD_DIR="$ROOT_DIR/.build-tmp"

echo ""
echo -e "${CYAN}=============================================${NC}"
echo -e "${CYAN}   AI 小说写作平台 - 部署打包${NC}"
echo -e "${CYAN}=============================================${NC}"
echo ""

# ---- 1. 构建前端 ----
echo -e "${CYAN}[1/4] 构建前端...${NC}"
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
    echo "      安装前端依赖..."
    npm install
fi

echo "      执行前端构建..."
npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}[ERROR] 前端构建失败，dist 目录不存在${NC}"
    exit 1
fi
echo -e "${GREEN}      [OK] 前端构建完成${NC}"
echo ""

# ---- 2. 准备临时构建目录 ----
echo -e "${CYAN}[2/4] 准备打包目录...${NC}"

# 清理旧的临时目录
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/bookagent"

# ---- 3. 复制后端 ----
echo -e "${CYAN}[3/4] 复制后端文件...${NC}"

# 创建后端目录结构
mkdir -p "$BUILD_DIR/bookagent/backend/logs"
mkdir -p "$BUILD_DIR/bookagent/backend/uploads"

# 复制后端必要文件（排除 node_modules、.env、日志等）
rsync -av --progress \
    --exclude='node_modules' \
    --exclude='.env' \
    --exclude='*.log' \
    --exclude='logs/*' \
    --exclude='uploads/*' \
    --exclude='.vscode' \
    --exclude='.idea' \
    "$BACKEND_DIR/" \
    "$BUILD_DIR/bookagent/backend/" 2>/dev/null || \
    cp -r "$BACKEND_DIR"/. "$BUILD_DIR/bookagent/backend/" 2>/dev/null

# 清理 cp 可能带入的不需要文件
rm -rf "$BUILD_DIR/bookagent/backend/node_modules" 2>/dev/null
rm -f "$BUILD_DIR/bookagent/backend/.env" 2>/dev/null
rm -f "$BUILD_DIR/bookagent/backend/server.log" 2>/dev/null
rm -f "$BUILD_DIR/bookagent/backend/test-novel-save.js" 2>/dev/null

echo -e "${GREEN}      [OK] 后端文件复制完成${NC}"

# ---- 4. 复制前端构建产物 ----
echo "      复制前端构建产物..."
mkdir -p "$BUILD_DIR/bookagent/frontend/dist"
cp -r "$FRONTEND_DIR/dist/." "$BUILD_DIR/bookagent/frontend/dist/" 2>/dev/null

echo -e "${GREEN}      [OK] 前端构建产物复制完成${NC}"

# ---- 5. 创建服务端部署脚本 ----
echo "      生成服务端部署脚本..."

cat > "$BUILD_DIR/bookagent/deploy.sh" << 'DEPLOYEOF'
#!/usr/bin/env bash
# ============================================
# AI 小说写作平台 - 服务端部署脚本
# 用法: chmod +x deploy.sh && sudo bash deploy.sh
# 目标路径: /opt/bookagent
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTALL_DIR="/opt/bookagent"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo -e "${CYAN}=============================================${NC}"
echo -e "${CYAN}   AI 小说写作平台 - 服务端部署${NC}"
echo -e "${CYAN}=============================================${NC}"
echo ""
echo -e "安装目录: ${INSTALL_DIR}"
echo ""

# ---- 检查 root 权限 ----
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERROR] 请使用 sudo 运行此脚本${NC}"
    exit 1
fi

# ---- 检查 Node.js ----
if ! command -v node &>/dev/null; then
    echo -e "${RED}[ERROR] 未找到 Node.js，请先安装 Node.js 18+${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] Node.js $(node -v)${NC}"

# ---- 检查 PM2 ----
if ! command -v pm2 &>/dev/null; then
    echo -e "${YELLOW}[WARN] 未找到 PM2，正在安装...${NC}"
    npm install -g pm2
fi
echo -e "${GREEN}[OK] PM2 已就绪${NC}"

# ---- 停止旧服务 ----
if pm2 list | grep -q "bookagent-backend"; then
    echo -e "${YELLOW}      停止旧服务...${NC}"
    pm2 stop bookagent-backend 2>/dev/null || true
    pm2 delete bookagent-backend 2>/dev/null || true
fi

# ---- 创建目标目录 ----
echo ""
echo -e "${CYAN}[1/3] 部署文件...${NC}"
mkdir -p "$INSTALL_DIR"

# 复制后端
if [ -d "$SCRIPT_DIR/backend" ]; then
    # 备份旧上传文件
    if [ -d "$INSTALL_DIR/backend/uploads" ]; then
        cp -r "$INSTALL_DIR/backend/uploads" "$SCRIPT_DIR/backend/" 2>/dev/null || true
    fi

    rm -rf "$INSTALL_DIR/backend"
    cp -r "$SCRIPT_DIR/backend" "$INSTALL_DIR/backend"
    echo -e "${GREEN}      [OK] 后端已部署${NC}"
fi

# 复制前端
if [ -d "$SCRIPT_DIR/frontend/dist" ]; then
    rm -rf "$INSTALL_DIR/frontend"
    mkdir -p "$INSTALL_DIR/frontend"
    cp -r "$SCRIPT_DIR/frontend/dist" "$INSTALL_DIR/frontend/dist"
    echo -e "${GREEN}      [OK] 前端已部署${NC}"
fi

# ---- 安装后端依赖 ----
echo ""
echo -e "${CYAN}[2/3] 安装后端依赖...${NC}"
cd "$INSTALL_DIR/backend"

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}      [WARN] .env 文件不存在，从 .env.example 创建...${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${RED}      [重要] 请编辑 ${INSTALL_DIR}/backend/.env 配置数据库和 API 密钥！${NC}"
    fi
fi

npm install --production
echo -e "${GREEN}      [OK] 依赖安装完成${NC}"

# ---- 运行数据库迁移 ----
echo ""
echo -e "${YELLOW}      运行数据库迁移..."
cd "$INSTALL_DIR/backend"
npm run migrate 2>/dev/null || echo -e "${YELLOW}      [WARN] 数据库迁移失败，请手动执行: cd ${INSTALL_DIR}/backend && npm run migrate${NC}"

# ---- 配置 PM2 启动 ----
echo ""
echo -e "${CYAN}[3/3] 启动服务...${NC}"
cd "$INSTALL_DIR/backend"

# 更新 ecosystem.config.js 中的路径
if [ -f "ecosystem.config.js" ]; then
    pm2 start ecosystem.config.js
else
    pm2 start src/index.js --name bookagent-backend \
        -i 2 \
        --max-memory-restart 800M \
        --log-date-format 'YYYY-MM-DD HH:mm:ss Z' \
        --merge-logs
fi

pm2 save
pm2 startup systemd -u "$(whoami)" --hp "$HOME" 2>/dev/null || \
    echo -e "${YELLOW}      [WARN] 请手动执行: pm2 startup systemd${NC}"

echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}   部署完成！${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo -e "  后端 API:  http://localhost:3000"
echo -e "  前端页面:  使用 Nginx 反向代理到 ${INSTALL_DIR}/frontend/dist"
echo ""
echo -e "  PM2 管理命令:"
echo -e "    pm2 status              查看状态"
echo -e "    pm2 logs bookagent-backend  查看日志"
echo -e "    pm2 restart bookagent-backend  重启服务"
echo ""
echo -e "${RED}  [重要] 请确保已配置:${NC}"
echo -e "    1. ${INSTALL_DIR}/backend/.env - 数据库和 API 密钥"
echo -e "    2. 数据库已创建并运行了迁移"
echo -e "    3. Nginx 已配置前端静态文件服务"
echo ""
DEPLOYEOF

chmod +x "$BUILD_DIR/bookagent/deploy.sh"
echo -e "${GREEN}      [OK] 部署脚本生成完成${NC}"

# ---- 6. 创建 Nginx 配置模板 ----
echo "      生成 Nginx 配置模板..."

cat > "$BUILD_DIR/bookagent/nginx.conf.example" << 'NGINXEOF'
# AI 小说写作平台 Nginx 配置示例
# 将本文件复制到 /etc/nginx/sites-available/bookagent 后启用

server {
    listen 80;
    server_name your-domain.com;  # 替换为实际域名

    # 前端静态文件
    root /opt/bookagent/frontend/dist;
    index index.html;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # 前端 SPA 路由
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理到后端
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 上传文件大小限制
        client_max_body_size 50m;
    }

    # 上传文件直接访问
    location /uploads/ {
        alias /opt/bookagent/backend/uploads/;
    }
}
NGINXEOF

echo -e "${GREEN}      [OK] Nginx 配置模板生成完成${NC}"

# ---- 7. 打包 ----
echo ""
echo -e "${CYAN}[4/4] 打包压缩...${NC}"

cd "$BUILD_DIR"
tar -czf "$DEPLOY_DIR/$PACKAGE_NAME" bookagent/

# 清理临时目录
rm -rf "$BUILD_DIR"

# 计算文件大小
SIZE=$(du -h "$DEPLOY_DIR/$PACKAGE_NAME" | cut -f1)

echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}   打包完成！${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo -e "  文件名: ${CYAN}deploy/${PACKAGE_NAME}${NC}"
echo -e "  大小:   ${SIZE}"
echo ""
echo -e "${YELLOW}  部署步骤:${NC}"
echo -e "  1. 将 deploy/${PACKAGE_NAME} 上传到服务器"
echo -e "  2. tar -xzf ${PACKAGE_NAME} && cd bookagent"
echo -e "  3. sudo bash deploy.sh"
echo ""
