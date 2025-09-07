const { checkForChangesAndDownload } = require('./update-schedule');
const cron = require('node-cron');

// Запуск каждые 30 минут
cron.schedule("*/30 * * * *", () => {
    console.log("🔄 Автоматическая проверка обновлений...");
    checkForChangesAndDownload();
});

console.log("⏰ Планировщик обновлений запущен...");