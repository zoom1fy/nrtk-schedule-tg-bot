@echo off
chcp 65001 >nul

set CONTAINER_NAME=schedule-bot

echo 🛑 Stopping Schedule Bot container...
docker stop %CONTAINER_NAME% >nul 2>&1
docker rm %CONTAINER_NAME% >nul 2>&1
echo ✅ Container stopped and removed.

pause