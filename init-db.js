const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.join(__dirname, "database.db");

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Ошибка при создании базы данных:", err.message);
    process.exit(1);
  }
  console.log("Подключение к SQLite базе данных установлено.");
});

// Создаем таблицу schedules
db.run(
  `
  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    day TEXT,
    group_name TEXT,
    teacher TEXT,
    subject TEXT,
    lesson_number TEXT,
    classroom TEXT,
    arrival_time TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`,
  (err) => {
    if (err) {
      console.error("Ошибка при создании таблицы schedules:", err.message);
    } else {
      console.log("Таблица 'schedules' создана или уже существует.");
    }
  }
);

// Создаем таблицу users
db.run(
  `
  CREATE TABLE IF NOT EXISTS users (
    chat_id INTEGER PRIMARY KEY,
    last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`,
  (err) => {
    if (err) {
      console.error("Ошибка при создании таблицы users:", err.message);
    } else {
      console.log("Таблица 'users' создана или уже существует.");
    }
  }
);

// ❌ Убираем db.close() здесь!
// ✅ Можно закрывать соединение только при завершении процесса:
process.on("exit", () => {
  db.close((err) => {
    if (err) {
      console.error("Ошибка при закрытии базы данных:", err.message);
    } else {
      console.log("Подключение к базе данных закрыто.");
    }
  });
});

module.exports = db;
