#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

CONTAINER_NAME="schedule-bot"

echo -e "${RED}🛑 Stopping Schedule Bot container...${NC}"
docker stop $CONTAINER_NAME
docker rm $CONTAINER_NAME
echo -e "${GREEN}✅ Container stopped and removed.${NC}"