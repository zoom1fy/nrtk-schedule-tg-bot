const { checkForChangesAndDownload } = require("./update-schedule");
const cron = require("node-cron");

// Каждые 15 минут, 24/7
cron.schedule(
  "*/15 * * * *",
  () => {
    console.log("🔄 [Каждые 15 мин] Проверка обновлений...");
    checkForChangesAndDownload();
  },
  {
    timezone: "Europe/Moscow",
  }
);

console.log("⏰ Планировщик обновлений запущен...");