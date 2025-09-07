#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="schedule-bot"
IMAGE_NAME="schedule-bot"
DATA_DIR="./data"
ASSETS_DIR="./assets"
ENV_FILE=".env"

echo -e "${GREEN}🚀 Starting deployment of Schedule Bot...${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from .env.example...${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  Please edit .env file and add your Telegram Bot Token${NC}"
        exit 1
    else
        echo -e "${RED}❌ .env.example not found. Please create .env file manually.${NC}"
        exit 1
    fi
fi

# Create directories if they don't exist
mkdir -p $DATA_DIR
mkdir -p $ASSETS_DIR

# Check if assets/time.png exists
if [ ! -f "$ASSETS_DIR/time.png" ]; then
    echo -e "${YELLOW}⚠️  WARNING: assets/time.png not found!${NC}"
    echo -e "${YELLOW}📋 Please add your time.png file to assets folder.${NC}"
fi

echo -e "${GREEN}📦 Building Docker image...${NC}"
docker build -t $IMAGE_NAME .

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed!${NC}"
    echo -e "${YELLOW}📋 Check the error messages above.${NC}"
    exit 1
fi

# Stop and remove existing container if it exists
echo -e "${GREEN}🔍 Checking for existing container...${NC}"
if docker ps -a --format '{{.Names}}' | grep -q "^$CONTAINER_NAME$"; then
    echo -e "${YELLOW}🛑 Stopping and removing existing container...${NC}"
    docker stop $CONTAINER_NAME
    docker rm $CONTAINER_NAME
else
    echo -e "${GREEN}✅ No existing container found.${NC}"
fi

echo -e "${GREEN}🐳 Starting new container...${NC}"
docker run -d \
    --name $CONTAINER_NAME \
    --restart unless-stopped \
    -v $(pwd)/$DATA_DIR:/app/data \
    -v $(pwd)/$ASSETS_DIR:/app/assets \
    --env-file $ENV_FILE \
    $IMAGE_NAME

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to start container!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Deployment completed!${NC}"
echo -e "${YELLOW}📋 Container status:${NC}"
docker ps --filter "name=$CONTAINER_NAME"

echo -e "${YELLOW}⏳ Waiting for initial schedule update (30 seconds)...${NC}"
sleep 30

echo -e "${YELLOW}📋 Showing logs after initialization:${NC}"
docker logs $CONTAINER_NAME --tail 20

echo -e "${YELLOW}📝 View logs: docker logs -f $CONTAINER_NAME${NC}"
echo -e "${YELLOW}⚡ Restart container: docker restart $CONTAINER_NAME${NC}"
echo -e "${YELLOW}🛑 Stop container: docker stop $CONTAINER_NAME${NC}"
echo -e "${YELLOW}🔄 Update container: ./update.sh${NC}"