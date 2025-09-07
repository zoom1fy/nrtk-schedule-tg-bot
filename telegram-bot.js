const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

require("dotenv").config();

// --- Инициализация ---
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// const DB_PATH = path.join(__dirname, "database.db");

// Проверка, что токен загрузился
if (!TOKEN) {
  console.error(
    "Ошибка: Токен бота не найден. Убедитесь, что вы создали .env файл и указали в нем TELEGRAM_BOT_TOKEN"
  );
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
const db = require("./init-db.js");

// Хранилище для временных состояний диалога
const userStates = new Map();
// Хранилище для постоянного выбора пользователя ("Моё расписание")
const userSelections = new Map();

// --- Функции для работы с БД (без изменений) ---
function getGroups(callback) {
  db.all(
    "SELECT DISTINCT group_name FROM schedules ORDER BY group_name",
    (err, rows) => {
      if (err) {
        console.error("Ошибка при получении групп:", err);
        callback([]);
      } else {
        const groups = rows.map((row) => row.group_name).filter(Boolean);
        callback(groups);
      }
    }
  );
}

function getTeachers(callback) {
  db.all(
    "SELECT DISTINCT teacher FROM schedules WHERE teacher IS NOT NULL AND teacher != '' ORDER BY teacher",
    (err, rows) => {
      if (err) {
        console.error("Ошибка при получении преподавателей:", err);
        callback([]);
      } else {
        const allTeachers = new Set();

        rows.forEach((row) => {
          const teacher = row.teacher;
          if (teacher.includes("/")) {
            const splitTeachers = teacher
              .split("/")
              .map((t) => t.trim())
              .filter((t) => t);
            splitTeachers.forEach((t) => allTeachers.add(t));
          } else {
            allTeachers.add(teacher);
          }
        });

        const teachers = Array.from(allTeachers).sort();
        callback(teachers);
      }
    }
  );
}

function getAvailableDates(type, name, callback) {
  let query, params;

  if (type === "group") {
    query =
      "SELECT DISTINCT date, day FROM schedules WHERE group_name = ? ORDER BY date DESC";
    params = [name];
  } else {
    query = `
      SELECT DISTINCT date, day FROM schedules 
      WHERE (
        REPLACE(teacher, ' ', '') = ?
        OR REPLACE(teacher, ' ', '') LIKE ?
        OR REPLACE(teacher, ' ', '') LIKE ?
        OR REPLACE(teacher, ' ', '') LIKE ?
      )
      ORDER BY date DESC
    `;

    const teacherClean = name.replace(/\s+/g, "");
    const likePattern1 = `%/${teacherClean}%`;
    const likePattern2 = `%${teacherClean}/%`;
    const likePattern3 = `%${teacherClean}%`;
    params = [teacherClean, likePattern1, likePattern2, likePattern3];
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("Ошибка при получении дат:", err);
      callback([]);
    } else {
      callback(rows);
    }
  });
}

function getGroupSchedule(group, date, callback) {
  db.all(
    `SELECT * FROM schedules WHERE group_name = ? AND date = ? ORDER BY lesson_number`,
    [group, date],
    (err, rows) => {
      if (err) {
        console.error("Ошибка при получении расписания группы:", err);
        callback([]);
      } else {
        callback(rows);
      }
    }
  );
}

function getTeacherSchedule(teacher, date, callback) {
  const teacherClean = teacher.replace(/\s+/g, "");

  console.log(teacherClean, teacher);

  db.all(
    `
    SELECT * FROM schedules 
    WHERE date = ? 
      AND (
        REPLACE(teacher, ' ', '') = ?
        OR REPLACE(teacher, ' ', '') LIKE ?
        OR REPLACE(teacher, ' ', '') LIKE ?
        OR REPLACE(teacher, ' ', '') LIKE ?
      )
    ORDER BY lesson_number
    `,
    [
      date,
      teacherClean,
      `%/${teacherClean}%`, // если преподаватель в конце
      `%${teacherClean}/%`, // если преподаватель в начале
      `%${teacherClean}%`, // общий случай
    ],
    (err, rows) => {
      if (err) {
        console.error("Ошибка при получении расписания преподавателя:", err);
        callback([]);
      } else {
        console.log(rows);

        callback(rows);
      }
    }
  );
}

// --- Функции для взаимодействия с пользователем ---

function formatSchedule(schedule, type, name) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return "✅ На выбранную дату занятий нет.";
  }

  // заголовок: если type === "group" — показываем группу, иначе — преподавателя (если передано name, используем его)
  let result = `Расписание для ${
    type === "group"
      ? `группы ${schedule[0].group_name || name || "не указана"}`
      : `преподавателя ${name || schedule[0].teacher || "не указан"}`
  }\n`;
  result += `📆 Дата: ${schedule[0].date} (${schedule[0].day})\n\n`;

  schedule.forEach((lesson) => {
    if (lesson.lesson_number) {
      result += `🕒 Пара ${lesson.lesson_number}\n`;
      if (lesson.subject) {
        result += `📚 Предмет: ${lesson.subject}\n`;
      } else {
        result += `📚 Предмет: ⚠️Предмет не найден, перепроверьте расписание сами!\n`;
      }
    } else {
      result += `❗ Разговоры о важном\n`;
      if (lesson.arrival_time) {
        result += `⏰ Время прихода: ${lesson.arrival_time}\n`;
      }
    }

    result += lesson.classroom
      ? `🚪 Аудитория: ${lesson.classroom}\n`
      : `🚪 Аудитория: нет\n`;

    if (type === "group") {
      // для группы покажем всех преподавателей (если есть несколько через '/')
      const teachersList = lesson.teacher
        ? lesson.teacher
            .split("/")
            .map((t) => t.trim())
            .join(", ")
        : "не указан";
      result += `👨‍🏫 Преподаватель: ${teachersList}\n`;
    } else {
      // для преподавателя покажем группу
      result += `👥 Группа: ${lesson.group_name || "не указана"}\n`;
    }

    result += "────────────────────\n";
  });

  return result;
}

// ИЗМЕНЕНИЕ: Добавлена новая кнопка "График прихода"
function showMainMenu(chatId, message = "Выберите действие:") {
  bot.sendMessage(chatId, message, {
    reply_markup: {
      keyboard: [
        [{ text: "📋 Моё расписание" }],
        [{ text: "👥 Группы" }, { text: "👨‍🏫 Преподаватели" }],
        [{ text: "🔄 Сменить мою группу/преподавателя" }],
        [{ text: "🕒 График прихода" }, { text: "🌐 Сайт" }],
      ],
      resize_keyboard: true,
    },
  });
}

function showDateSelection(chatId, type, name, isSettingMySchedule = false) {
  getAvailableDates(type, name, (dates) => {
    if (dates.length === 0) {
      bot.sendMessage(chatId, "Нет доступных дат для выбранного варианта.");
      userStates.delete(chatId);
      showMainMenu(chatId);
      return;
    }

    const keyboard = dates.map((date) => [
      { text: `${date.date} (${date.day})` },
    ]);

    keyboard.push([{ text: "⬅️ Назад" }]);

    userStates.set(chatId, {
      step: "select_date",
      type,
      name,
      isSettingMySchedule,
      dates,
    });

    bot.sendMessage(chatId, "Выберите дату:", {
      reply_markup: {
        keyboard,
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  });
}

// --- Обработчики команд и сообщений ---

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userStates.delete(chatId);
  showMainMenu(
    chatId,
    "👋 Привет! Я бот для расписания занятий.\n\nВыберите действие:"
  );
});

// ИЗМЕНЕНИЕ: Добавлен case для "График прихода"
bot.on("message", (msg) => {
  if (msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const text = msg.text;
  const state = userStates.get(chatId);

  // Сохраняем chat_id в базу, если его там ещё нет
  db.run(
    "INSERT OR IGNORE INTO users (chat_id, last_interaction) VALUES (?, DATETIME('now'))",
    [chatId],
    (err) => {
      if (err) {
        console.error("Ошибка при сохранении пользователя:", err);
      }
    }
  );

  if (!state) {
    switch (text) {
      case "📋 Моё расписание":
        handleMySchedule(chatId);
        break;
      case "👥 Группы":
        handleGroups(chatId);
        break;
      case "👨‍🏫 Преподаватели":
        handleTeachers(chatId);
        break;
      case "🕒 График прихода":
        handleArrivalSchedule(chatId);
        break;
      case "🌐 Сайт":
        handleWebsite(chatId);
        break;
      case "🔄 Сменить мою группу/преподавателя":
        handleChangeMySchedule(chatId);
        break;
      default:
        showMainMenu(chatId, "Пожалуйста, используйте кнопки.");
    }
    return;
  }

  switch (state.step) {
    case "select_type_for_my_schedule":
      handleUserTypeSelection(chatId, text, true);
      break;
    case "select_group_for_my_schedule":
      handleGroupSelection(chatId, text, true);
      break;
    case "select_teacher_for_my_schedule":
      handleTeacherSelection(chatId, text, true);
      break;
    case "select_group_from_list":
      handleGroupSelection(chatId, text, false);
      break;
    case "select_teacher_from_list":
      handleTeacherSelection(chatId, text, false);
      break;
    case "select_date":
      handleDateSelection(chatId, text, state);
      break;
  }
});

bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;

  if (query.data === "change_my_schedule") {
    userSelections.delete(chatId);
    bot.answerCallbackQuery(query.id, { text: "Ваш выбор сброшен!" });
    bot.sendMessage(
      chatId,
      "Теперь вы можете выбрать новую группу или преподавателя."
    );
    promptUserType(chatId, true);
  }

  if (query.data.startsWith("teacher_")) {
    const teacherName = query.data.replace("teacher_", "");
    userStates.set(chatId, { step: "select_teacher_for_my_schedule" });
    handleTeacherSelection(chatId, teacherName, true);
  }
});

// --- Основные функции-обработчики ---

function handleMySchedule(chatId) {
  const selection = userSelections.get(chatId);

  if (selection) {
    const { type, name } = selection;
    showDateSelection(chatId, type, name, true);
  } else {
    promptUserType(chatId, true);
  }
}

function promptUserType(chatId, isSettingMySchedule) {
  const step = isSettingMySchedule
    ? "select_type_for_my_schedule"
    : "select_type_from_list";
  userStates.set(chatId, { step });

  bot.sendMessage(chatId, "Выберите ваш статус:", {
    reply_markup: {
      keyboard: [
        [{ text: "👥 Я студент" }, { text: "👨‍🏫 Я преподаватель" }],
        [{ text: "⬅️ Назад в меню" }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

function handleUserTypeSelection(chatId, text, isSettingMySchedule) {
  if (text === "⬅️ Назад в меню") {
    userStates.delete(chatId);
    showMainMenu(chatId);
    return;
  }

  const targetStep =
    text === "👥 Я студент"
      ? isSettingMySchedule
        ? "select_group_for_my_schedule"
        : "select_group_from_list"
      : isSettingMySchedule
      ? "select_teacher_for_my_schedule"
      : "select_teacher_from_list";

  userStates.set(chatId, { step: targetStep });

  if (text === "👥 Я студент") {
    showGroupSelection(chatId, isSettingMySchedule);
  } else if (text === "👨‍🏫 Я преподаватель") {
    showTeacherSelection(chatId, isSettingMySchedule);
  }
}

function showGroupSelection(chatId, isSettingMySchedule) {
  getGroups((groups) => {
    if (groups.length === 0) {
      bot.sendMessage(chatId, "Группы не найдены.");
      userStates.delete(chatId);
      showMainMenu(chatId);
      return;
    }
    const keyboard = groups.map((group) => [{ text: group }]);
    keyboard.push([
      { text: isSettingMySchedule ? "⬅️ Назад" : "⬅️ Назад в меню" },
    ]);
    bot.sendMessage(chatId, "Выберите группу:", {
      reply_markup: {
        keyboard,
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  });
}

function showTeacherSelection(chatId, isSettingMySchedule) {
  getTeachers((teachers) => {
    if (teachers.length === 0) {
      bot.sendMessage(chatId, "Преподаватели не найдены.");
      userStates.delete(chatId);
      showMainMenu(chatId);
      return;
    }
    const keyboard = teachers.map((teacher) => [{ text: teacher }]);
    keyboard.push([
      { text: isSettingMySchedule ? "⬅️ Назад" : "⬅️ Назад в меню" },
    ]);
    bot.sendMessage(chatId, "Выберите преподавателя:", {
      reply_markup: {
        keyboard,
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  });
}

function handleGroupSelection(chatId, groupName, isSettingMySchedule) {
  if (groupName === "⬅️ Назад") {
    promptUserType(chatId, isSettingMySchedule);
    return;
  }
  if (groupName === "⬅️ Назад в меню") {
    userStates.delete(chatId);
    showMainMenu(chatId);
    return;
  }

  showDateSelection(chatId, "group", groupName, isSettingMySchedule);
}

function handleTeacherSelection(chatId, teacherName, isSettingMySchedule) {
  if (teacherName === "⬅️ Назад") {
    promptUserType(chatId, isSettingMySchedule);
    return;
  }
  if (teacherName === "⬅️ Назад в меню") {
    userStates.delete(chatId);
    showMainMenu(chatId);
    return;
  }

  showDateSelection(chatId, "teacher", teacherName, isSettingMySchedule);
}

function handleChangeMySchedule(chatId) {
  userSelections.delete(chatId); // сбрасываем сохранённый выбор
  bot.sendMessage(chatId, "❌ Текущая группа/преподаватель сброшены.");
  promptUserType(chatId, true); // снова спрашиваем «я студент/преподаватель»
}

function handleDateSelection(chatId, text, state) {
  if (text === "⬅️ Назад") {
    // Возвращаемся к выбору группы/преподавателя
    userStates.set(chatId, {
      step:
        state.type === "group"
          ? "select_group_from_list"
          : "select_teacher_from_list",
      isSettingMySchedule: state.isSettingMySchedule,
    });
    if (state.type === "group") {
      showGroupSelection(chatId, state.isSettingMySchedule);
    } else {
      showTeacherSelection(chatId, state.isSettingMySchedule);
    }
    return;
  } // Извлекаем дату из текста (формат: "DD MMMM (day)")

  const selectedDate = text.split(" (")[0];

  const scheduleFunction =
    state.type === "group" ? getGroupSchedule : getTeacherSchedule;

  scheduleFunction(state.name, selectedDate, (schedule) => {
    if (schedule.length === 0) {
      bot.sendMessage(chatId, "❌ На выбранную дату занятий не найдено.");
      userStates.delete(chatId);
      showMainMenu(chatId);
      return;
    }

    const formattedSchedule = formatSchedule(schedule, state.type, state.name);

    if (state.isSettingMySchedule) {
      userSelections.set(chatId, { type: state.type, name: state.name });
    }

    bot.sendMessage(chatId, formattedSchedule);
    userStates.delete(chatId);
    showMainMenu(chatId, "Что-нибудь еще?");
  });
}

function handleGroups(chatId) {
  userStates.set(chatId, { step: "select_group_from_list" });
  showGroupSelection(chatId, false);
}

function handleTeachers(chatId) {
  userStates.set(chatId, { step: "select_teacher_from_list" });
  showTeacherSelection(chatId, false);
}

function handleArrivalSchedule(chatId) {
  const imagePath = path.join(__dirname, "./assets/time.png");
  bot
    .sendPhoto(chatId, imagePath, {
      caption: "График прихода обучающихся (В праздники может отличаться)",
    })
    .catch((error) => {
      console.error("Ошибка при отправке фото:", error.code);
      bot.sendMessage(
        chatId,
        "Не удалось загрузить изображение. Возможно, файл отсутствует или поврежден."
      );
    });
}

function handleWebsite(chatId) {
  const websiteUrl = "https://cloud.nntc.nnov.ru/index.php/s/fYpXD39YccFB5gM";
  bot.sendMessage(chatId, `🌐 Перейдите на наш сайт:\n${websiteUrl}`);
}

bot.on("polling_error", (error) => {
  console.error("Polling error:", error.code);
});

module.exports = { bot };

console.log("🤖 Telegram бот запущен...");
