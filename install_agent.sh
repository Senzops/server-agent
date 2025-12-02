#!/bin/bash

# --- SysSentinel Installer ---

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "   _____            _____            _   _            _ "
echo "  / ____|          / ____|          | | (_)          | |"
echo " | (___  _   _ ___| (___   ___ _ __ | |_ _ _ __   ___| |"
echo "  \___ \| | | / __|\___ \ / _ \ '_ \| __| | '_ \ / _ \ |"
echo "  ____) | |_| \__ \____) |  __/ | | | |_| | | | |  __/ |"
echo " |_____/ \__, |___/_____/ \___|_| |_|\__|_|_| |_|\___|_|"
echo "          __/ |                                         "
echo "         |___/                                          "
echo -e "${NC}"
echo "Welcome to the SysSentinel Agent Installer."
echo "------------------------------------------------"

# --- CONFIGURATION ---
GITHUB_REPO="SysSentinel/agent-ts"
IMAGE_NAME="ghcr.io/$GITHUB_REPO:latest"

# Convert to lowercase because Docker images must be lowercase
IMAGE_NAME=$(echo "$IMAGE_NAME" | tr '[:upper:]' '[:lower:]')

# 1. Check for Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[Error] Docker is not installed.${NC}"
    echo "Please install Docker first: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

# 2. Configuration Prompts
# In a real production app, you might pass these as flags to this script
if [ -z "$VPS_ID" ]; then
    read -p "Enter your VPS ID: " VPS_ID
fi

if [ -z "$API_KEY" ]; then
    read -p "Enter your Agent API KEY: " API_KEY
fi

if [ -z "$API_ENDPOINT" ]; then
    # Default to localhost for dev, change to your production URL later
    read -p "Enter API Endpoint (Default: http://localhost:3000/api/ingest/stats): " API_ENDPOINT
    API_ENDPOINT=${API_ENDPOINT:-http://localhost:3000/api/ingest/stats}
fi

echo -e "\n${BLUE}Configuring Agent...${NC}"

# 3. Stop existing container if running
if [ "$(docker ps -q -f name=sys-sentinel)" ]; then
    echo "Stopping existing agent..."
    docker stop sys-sentinel
    docker rm sys-sentinel
fi

# 4. Build/Pull and Run
# NOTE: In production, replace 'docker build' with 'docker pull your-repo/sys-sentinel:latest'
echo "Building SysSentinel Agent..."
docker build -t sys-sentinel-agent .

echo -e "\n${GREEN}Starting SysSentinel...${NC}"

# 5. THE RUN COMMAND
# We mount host directories strictly read-only (:ro) for security
docker run -d \
  --name sys-sentinel \
  --restart unless-stopped \
  --network host \
  --pid host \
  -v /:/host/root:ro \
  -v /sys:/host/sys:ro \
  -v /proc:/host/proc:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e VPS_ID="$VPS_ID" \
  -e API_KEY="$API_KEY" \
  -e API_ENDPOINT="$API_ENDPOINT" \
  -e INTERVAL=60 \
  $IMAGE_NAME

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✔ Agent installed and running successfully!${NC}"
    echo "Logs: docker logs -f sys-sentinel"
else
    echo -e "\n${RED}✘ Failed to start agent.${NC}"
fi