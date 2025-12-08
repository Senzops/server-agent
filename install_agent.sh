#!/bin/bash

# --- senzor Installer ---

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "   _____ "
echo "  / ____| "
echo " | (___   ___ _ __  _______  _ __ "
echo "  \___ \ / _ \ '_ \|_  / _ \| '__|"
echo "  ____) |  __/ | | |/ / (_) | | "
echo " |_____/ \___|_| |_/___|\___/|_| "
echo " "
echo -e "${NC}"
echo "Welcome to the Senzor Server Agent Installer."
echo "------------------------------------------------"

# --- CONFIGURATION ---
# Target Image from GitHub Container Registry
IMAGE_NAME="ghcr.io/senzops/server-agent:latest"

# 1. Check for Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[Error] Docker is not installed.${NC}"
    echo "Please install Docker first: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

# 2. Configuration Prompts
if [ -z "$SERVER_ID" ]; then
    read -p "Enter your SERVER ID: " SERVER_ID
fi

if [ -z "$API_KEY" ]; then
    read -p "Enter your Agent API KEY: " API_KEY
fi

if [ -z "$API_ENDPOINT" ]; then
    read -p "Enter API Endpoint (Default: https://api.senzor.dev/api/ingest/stats): " API_ENDPOINT
    API_ENDPOINT=${API_ENDPOINT:-https://api.senzor.dev/api/ingest/stats}
fi

echo -e "\n${BLUE}Configuring Agent...${NC}"

# 3. Stop existing container if running
if [ "$(docker ps -q -f name=senzor)" ]; then
    echo "Stopping existing agent..."
    docker stop senzor
    docker rm senzor
fi

# 4. Pull Latest Image from GHCR
echo "Pulling latest senzor image from GitHub Container Registry..."
echo "Target: $IMAGE_NAME"
docker pull $IMAGE_NAME

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to pull image. Please check if the repository/package is Public.${NC}"
    exit 1
fi

echo -e "\n${GREEN}Starting senzor...${NC}"

# 5. THE RUN COMMAND
# We mount host directories strictly read-only (:ro) for security
docker run -d \
  --name senzor \
  --restart unless-stopped \
  --network host \
  --pid host \
  -v /:/host/root:ro \
  -v /sys:/host/sys:ro \
  -v /proc:/host/proc:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e SERVER_ID="$SERVER_ID" \
  -e API_KEY="$API_KEY" \
  -e API_ENDPOINT="$API_ENDPOINT" \
  -e INTERVAL=60 \
  $IMAGE_NAME

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✔ Agent installed and running successfully!${NC}"
    echo "Logs: docker logs -f senzor"
else
    echo -e "\n${RED}✘ Failed to start agent.${NC}"
fi