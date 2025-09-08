const { checkForChangesAndDownload } = require("./update-schedule");
const cron = require("node-cron");

// Каждые 10 минут с 9:00 до 14:59 (по МСК)
// "*/10 * 9-14 * *" → каждые 10 мин, часы 9–14
cron.schedule(
  "*/10 9-14 * * *",
  () => {
    console.log("🔄 [Каждые 10 мин, 9:00-14:59] Проверка обновлений...");
    checkForChangesAndDownload();
  },
  {
    timezone: "Europe/Moscow",
  }
);

// Каждые 30 минут вне диапазона 9–14
cron.schedule(
  "*/30 0-8,15-23 * * *",
  () => {
    console.log("🔄 [Каждые 30 мин, вне 9:00-14:59] Проверка обновлений...");
    checkForChangesAndDownload();
  },
  {
    timezone: "Europe/Moscow",
  }
);

console.log("⏰ Планировщик обновлений запущен...");
