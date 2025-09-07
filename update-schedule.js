const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs").promises;
const { spawn } = require("child_process");
const path = require("path");
const xlsx = require("xlsx");
const sqlite3 = require("sqlite3").verbose();

// URL для проверки и скачивания
const PDF_URL =
  "https://cloud.nntc.nnov.ru/index.php/s/fYpXD39YccFB5gM/download";
const PDF_PATH = path.join(__dirname, "downloaded.pdf");
const XLSX_PATH = path.join(__dirname, "downloaded.xlsx");

// Настройки и инициализация SQLite3
const DB_PATH = path.join(__dirname, "database.db");
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Ошибка при открытии базы данных SQLite3:", err.message);
  } else {
    console.log("Успешное подключение к базе данных SQLite3.");
  }
});

let lastModified = null;

// Функция для парсинга специального формата Excel
function parseSpecialExcelFormat(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const data = [];
  let currentGroup = "";
  let currentDate = "";
  let currentDay = "";
  let lastSubject = ""; // Запоминаем последний предмет
  let lastTeacher = ""; // Запоминаем последнего преподавателя

  // Получаем все данные в виде массива массивов
  const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  console.log("Содержимое файла для отладки:");
  console.log(JSON.stringify(jsonData.slice(0, 20), null, 2));

  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i];

    // Пропускаем пустые строки
    if (!row || row.length === 0) continue;

    // Определяем день недели и дату (ищем во второй колонке, так как первая часто пустая)
    const dateCell = row[1] || row[0];
    if (dateCell && typeof dateCell === "string") {
      if (
        dateCell.includes("понедельник") ||
        dateCell.includes("вторник") ||
        dateCell.includes("среда") ||
        dateCell.includes("четверг") ||
        dateCell.includes("пятница") ||
        dateCell.includes("суббота") ||
        dateCell.includes("воскресенье")
      ) {
        const parts = dateCell.split(" ");
        currentDay = parts[0];
        currentDate = parts.slice(1).join(" ");
        console.log(`Установлена дата: ${currentDate}, день: ${currentDay}`);
        continue;
      }
    }

    // Определяем группу (ищем во второй колонке, так как первая может быть пустой)
    const groupCell = row[1] || row[0];
    if (
      groupCell &&
      typeof groupCell === "string" &&
      (groupCell.match(/^\d[А-Яа-я]+-\d{2}-\d{1,2}/) ||
        groupCell.match(/^\d[А-Яа-я]+-\d{2}-\d[кс]/) ||
        groupCell.match(/^\d[А-Яа-я]+-\d{2}-\dуп/))
    ) {
      currentGroup = groupCell;
      console.log(`Установлена группа: ${currentGroup}`);
      // Сбрасываем запомненные данные при смене группы
      lastSubject = "";
      lastTeacher = "";
      lastClassroom = "";
      continue;
    }

    // Пропускаем заголовки
    if (row[1] === "Преподаватель" || row[0] === "График прихода обучающихся") {
      continue;
    }

    // Это данные о паре (преподаватель во второй колонке, предмет в третьей)
    // Проверяем, что во второй колонке есть ФИО преподавателя (содержит точку)
    if (
      row[1] &&
      typeof row[1] === "string" &&
      row[1].includes(".") &&
      !row[1].match(/^\d[А-Яа-я]+-\d{2}-\d{1,2}/) &&
      !row[1].match(/^\d[А-Яа-я]+-\d{2}-\d[кс]/) &&
      !row[1].match(/^\d[А-Яа-я]+-\d{2}-\dуп/) &&
      row[1] !== "Преподаватель"
    ) {
      const teacher = row[1].trim();
      let subject = row[2] || "";
      let lesson_number = row[3] || "";
      let classroom = row[4] || "";

      if (!subject && teacher === lastTeacher && lastSubject) {
        subject = lastSubject;
        console.log(`Использован предыдущий предмет: ${subject}`);
      }

      if (!classroom && teacher === lastTeacher && subject === lastSubject) {
        classroom = lastClassroom;
        console.log(`Использована предыдущая аудитория: ${classroom}`);
      }

      if (lesson_number.includes("(" || ")")) {
        classroom = lesson_number;
        lesson_number = "";
      }

      const record = {
        date: currentDate,
        day: currentDay,
        group: currentGroup,
        teacher: teacher,
        subject: subject,
        lesson_number: lesson_number,
        classroom: classroom,
        arrival_time: row[5] || "",
      };

      // Проверяем, что это действительно данные
      if (record.teacher && record.group) {
        console.log(`Добавлена запись: ${record.teacher} - ${record.subject}`);
        data.push(record);

        // Запоминаем предмет и преподавателя для следующих строк
        if (subject) {
          lastSubject = subject;
          lastTeacher = teacher;
          lastClassroom = classroom;
        }
      }
    }
  }

  console.log(`Всего распаршено ${data.length} записей`);
  return data;
}

// Функция для записи данных в базу данных
async function saveDataToDb(filePath) {
  try {
    // Проверяем существование файла
    try {
      await fs.access(filePath);
      console.log("XLSX файл найден:", filePath);
    } catch (error) {
      console.error(`Файл не найден: ${filePath}`);
      return;
    }

    // Используем специальный парсер для вашего формата
    const data = parseSpecialExcelFormat(filePath);

    if (data.length === 0) {
      console.log("В файле XLSX нет данных для записи.");
      return;
    }

    console.log(`Найдено ${data.length} записей для сохранения`);

    // 1. Удаляем старую таблицу если существует
    await new Promise((resolve, reject) => {
      db.run(`DROP TABLE IF EXISTS schedules`, (err) => {
        if (err) reject(err);
        else {
          console.log("Старая таблица удалена.");
          resolve();
        }
      });
    });

    // 2. Создаем таблицу с правильной структурой
    const createTableQuery = `
            CREATE TABLE schedules (
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
        `;

    await new Promise((resolve, reject) => {
      db.run(createTableQuery, (err) => {
        if (err) reject(err);
        else {
          console.log("Таблица создана успешно");
          resolve();
        }
      });
    });

    // 3. Вставляем данные
    const insertQuery = `
            INSERT INTO schedules 
            (date, day, group_name, teacher, subject, lesson_number, classroom, arrival_time) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

    let insertedCount = 0;
    let errorCount = 0;

    for (const record of data) {
      try {
        await new Promise((resolve, reject) => {
          const values = [
            record.date || "",
            record.day || "",
            record.group || "",
            record.teacher || "",
            record.subject || "",
            record.lesson_number || "",
            record.classroom || "",
            record.arrival_time || "",
          ];

          db.run(insertQuery, values, function (err) {
            if (err) {
              console.error("Ошибка при вставке:", err);
              errorCount++;
              reject(err);
            } else {
              insertedCount++;
              resolve();
            }
          });
        });
      } catch (error) {
        console.error("Ошибка при обработке записи:", record);
      }
    }

    console.log(
      `Успешно вставлено ${insertedCount} записей, ошибок: ${errorCount}`
    );
  } catch (error) {
    console.error("Ошибка при работе с базой данных:", error);
  }
}

async function runPythonScript() {
  return new Promise((resolve, reject) => {
    fs.access(PDF_PATH)
      .then(() => {
        console.log("Запуск Python скрипта...");
        const pythonProcess = spawn("python", ["main.py", PDF_PATH]);

        pythonProcess.stdout.on("data", (data) => {
          console.log(`Python: ${data}`);
        });

        pythonProcess.stderr.on("data", (data) => {
          console.error(`Python ошибка: ${data}`);
        });

        pythonProcess.on("close", (code) => {
          if (code === 0) {
            console.log("Python скрипт завершен успешно");
            resolve();
          } else {
            reject(new Error(`Код ошибки: ${code}`));
          }
        });
      })
      .catch(() => {
        reject(new Error("PDF файл не найден"));
      });
  });
}

async function checkForChangesAndDownload() {
  console.log("Проверка изменений...");
  try {
    const response = await axios.head(PDF_URL);
    const currentLastModified = response.headers["last-modified"];

    const localFileExists = await fs
      .access(PDF_PATH)
      .then(() => true)
      .catch(() => false);

    if (
      !localFileExists ||
      (currentLastModified && currentLastModified !== lastModified)
    ) {
      console.log(
        "Обнаружены изменения или файл отсутствует. Скачивание нового файла..."
      );
      lastModified = currentLastModified;

      const downloadResponse = await axios.get(PDF_URL, {
        responseType: "arraybuffer",
      });
      await fs.writeFile(PDF_PATH, downloadResponse.data);
      console.log("PDF файл успешно скачан.");

      await runPythonScript();

      try {
        await fs.access(XLSX_PATH);
        console.log("XLSX файл создан, начинаем обработку...");
        await saveDataToDb(XLSX_PATH);
      } catch (error) {
        console.error(
          "XLSX файл не найден после выполнения Python скрипта:",
          error.message
        );
      }
    } else {
      console.log("Изменений не обнаружено.");
    }
  } catch (error) {
    console.error("Ошибка при проверке или скачивании:", error.message);
  }
}

// Функция для ручного запуска обновления
async function manualUpdate() {
  console.log("=== Ручное обновление расписания ===");
  await checkForChangesAndDownload();
  console.log("=== Обновление завершено ===");
  db.close();
}

// Запуск при непосредственном вызове скрипта
if (require.main === module) {
  manualUpdate();
}

// Экспортируем функции для использования в боте
module.exports = {
  db,
  checkForChangesAndDownload,
  manualUpdate,
};
