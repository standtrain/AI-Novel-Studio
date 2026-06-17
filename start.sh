#!/usr/bin/env bash
# ============================================
# AI Novel Studio Startup Script (Linux / macOS)
# Prerequisites: Node.js + MySQL
# Usage: chmod +x start.sh && ./start.sh
# ============================================

set -e

# ---- Colors ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PID=""
FRONTEND_PID=""

# ---- Cleanup on exit ----
cleanup() {
    echo ""
    echo -e "${YELLOW}Stopping services...${NC}"
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null
        echo -e "${GREEN}  [OK] Backend stopped${NC}"
    fi
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null
        echo -e "${GREEN}  [OK] Frontend stopped${NC}"
    fi
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# ---- Banner ----
clear
echo ""
echo -e "${CYAN}  _____ _                   _ _              _"
echo -e "${CYAN} / ____| |                 | | |            |_|"
echo -e "${CYAN}| (___ | |_ __ _ _ ____   _| | |_  ___ _ _ _ _ ____"
echo -e "${CYAN} \___ \| __/ _\` | '__| |/ _  |  __/ /__/ _\` | '__| |"
echo -e "${CYAN} ____) | || (_| | |  | | (_| | |_ | | | (_| | |  | |"
echo -e "${CYAN}|_____/ \__\__,_|_|  |_| _ _/\___|| |  \__,_|_|  |_|${NC}"
echo ""
echo -e "${GREEN}  ==== AI Powered Novel Creation -by standtrain====${NC}"
echo ""
echo "================================================================="
echo "                          Starting..."
echo "================================================================="
echo ""

# ---- Check Node.js ----
if ! command -v node &>/dev/null; then
    echo -e "${RED}[ERROR] Node.js not found. Please install Node.js first.${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] Node.js $(node -v)${NC}"
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo -e "${RED}[ERROR] Current dependencies require Node.js >= 18. Detected $(node -v).${NC}"
    exit 1
fi
echo ""

# ---- Backend ----
echo -e "${CYAN}[1/2] Starting backend...${NC}"
cd "$BACKEND_DIR"

if [ ! -d "node_modules" ]; then
    echo "      Installing backend dependencies..."
    npm install
fi

npm run dev &
BACKEND_PID=$!
echo -e "${GREEN}      Backend: http://localhost:3000 (PID: $BACKEND_PID)${NC}"

sleep 2

# ---- Frontend ----
echo -e "${CYAN}[2/2] Starting frontend...${NC}"
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
    echo "      Installing frontend dependencies..."
    npm install
fi

npm run dev &
FRONTEND_PID=$!
echo -e "${GREEN}      Frontend: http://localhost:5173 (PID: $FRONTEND_PID)${NC}"

echo ""
echo "================================================================="
echo "  Startup complete!"
echo ""
echo "  Backend API : http://localhost:3000"
echo "  Frontend App: http://localhost:5173"
echo "================================================================="
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"

wait
