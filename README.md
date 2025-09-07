📅 NRTK Schedule Bot
======
Telegram bot for automatic analysis and display of the schedule Below the classes of the city radio engineering college.

✨ **Possibilities**
----
* 🤖 Automatic schedule update from PDF files
* 📊 Schedule parsing into SQLite database
* 👥 Schedule search by groups and teachers
* ⏰ Student arrival schedule
* 🔔 Automatic update check every 30 minutes
* 💾 Saving user selection ("My schedule")

🛠 **Technologies**
----
* Node.js - server platform
* Telegram Bot API - interaction with Telegram
* SQLite3 - database
* Python - parsing PDF files
* Docker - application containerization
* pdfplumber/pandas - processing PDF and Excel files

📦 **Installation and Run**
----
**Prerequisites**
* Docker Desktop (Windows/Mac) or Docker Engine (Linux)
* Telegram Bot Token by @BotFather

**1. Clone the repository**
```bash
git clone https://github.com/your-username/nrtk-schedule-bot.git
cd nrtk-schedule-bot
```

**2. Set up the environment**

* *Create a .env file based on the example:*
```bash
cp .env.example .env
```
* *Edit the .env file:*
```bash
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

**3. Adding a time schedule file**

* Place the time.png file in the assets/ folder

**4. Launching the application**

* For Windows:
```bash
deploy.bat
```

* For Linux/macOS:
```bash
chmod +x deploy.sh
./deploy.sh
```

📋 Using the bot
----
**Main commands:**

* 📋 My schedule - quick access to the saved schedule
* 👥 Groups - search for a schedule by groups
* 👨‍🏫 Teachers - search for a schedule by teachers
* 🕒 Arrival schedule - view arrival time
* 🌐 Website - link to the schedule source

Schedule settings (in code)
----
* URL for downloading a PDF schedule
* Update check interval (30 minutes)
* Paths to files and databases

🔧 Project structure
----
```bash
nrtk-schedule-bot/
├── 📁 assets/ # Static files
│ └── time.png # Arrival schedule
├── 📁 data/ # Database (created automatically)
├── 📜 .env # Environment variables
├── 📜 .env.example # Example of .env file
├── 📜 Dockerfile # Docker configuration
├── 📜 docker-compose.yml # Docker Compose configuration
├── 📜 package.json # Dependencies Node.js
├── 📜 deploy.bat # Deployment script (Windows)
├── 📜 deploy.sh # Deployment script (Linux/macOS)
├── 📜 stop.bat # Stop script (Windows)
├── 📜 stop.sh # Stop script (Linux/macOS)
├── 📜 telegram-bot.js # Main bot file
├── 📜 update-schedule.js # Schedule update script
├── 📜 update-schedule-cron.js # Cron tasks
├── 📜 main.py # Python script for PDF parsing
└── 📜 init-db.js # Initialize the database
```

📄 License
----
MIT License
