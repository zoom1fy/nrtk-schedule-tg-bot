@echo off
chcp 65001 >nul

echo 🚀 Starting deployment of Schedule Bot...
echo.

:: Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    echo 📋 Make sure Docker Desktop is installed and running.
    pause
    exit /b 1
)

:: Configuration
set CONTAINER_NAME=schedule-bot
set IMAGE_NAME=schedule-bot
set DATA_DIR=.\data
set ASSETS_DIR=.\assets
set ENV_FILE=.env

:: Check if .env file exists
if not exist "%ENV_FILE%" (
    echo ⚠️  .env file not found. Creating from .env.example...
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo ⚠️  Please edit .env file and add your Telegram Bot Token
        echo ⚠️  Then run this script again.
        pause
        exit /b 1
    ) else (
        echo ❌ .env.example not found. Please create .env file manually.
        echo 📋 Create .env file with: TELEGRAM_BOT_TOKEN=your_bot_token
        pause
        exit /b 1
    )
)

:: Create directories if they don't exist
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%ASSETS_DIR%" mkdir "%ASSETS_DIR%"

echo 📦 Building Docker image...
docker build -t %IMAGE_NAME% .

if errorlevel 1 (
    echo ❌ Docker build failed!
    pause
    exit /b 1
)

:: Stop and remove existing container if it exists
echo 🔍 Checking for existing container...
docker ps -a --filter "name=%CONTAINER_NAME%" --format "{{.Names}}" | findstr /C:"%CONTAINER_NAME%" >nul
if not errorlevel 1 (
    echo 🛑 Stopping and removing existing container...
    docker stop %CONTAINER_NAME% >nul 2>&1
    docker rm %CONTAINER_NAME% >nul 2>&1
) else (
    echo ✅ No existing container found.
)

echo 🐳 Starting new container...
docker run -d ^
    --name %CONTAINER_NAME% ^
    --restart unless-stopped ^
    -v %CD%\%DATA_DIR%:/app/data ^
    -v %CD%\%ASSETS_DIR%:/app/assets ^
    --env-file %ENV_FILE% ^
    %IMAGE_NAME%

if errorlevel 1 (
    echo ❌ Failed to start container!
    pause
    exit /b 1
)

echo ✅ Deployment completed!
echo.
echo 📋 Container status:
docker ps --filter "name=%CONTAINER_NAME%"

echo.
echo ⏳ Waiting for initial schedule update (30 seconds)...
timeout /t 30 /nobreak

echo 📋 Showing logs after initialization:
docker logs %CONTAINER_NAME% --tail 20

echo.
echo 📝 View logs: docker logs -f %CONTAINER_NAME%
echo ⚡ Restart container: docker restart %CONTAINER_NAME%
echo 🛑 Stop container: docker stop %CONTAINER_NAME%
echo 🔄 Update container: run update.bat

pause