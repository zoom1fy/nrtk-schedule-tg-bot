const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

require("dotenv").config();

// --- Инициализация ---
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DB_PATH = path.join(__dirname, "database.db");

// Проверка, что токен загрузился
if (!TOKEN) {
  console.error(
    "Ошибка: Токен бота не найден. Убедитесь, что вы создали .env файл и указали в нем TELEGRAM_BOT_TOKEN"
  );
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
const db = new sqlite3.Database(DB_PATH);

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
        teacher = ? 
        OR teacher LIKE ? 
        OR teacher LIKE ?
        OR teacher LIKE ?
      )
      ORDER BY date DESC
    `;
    const likePattern1 = `%/${name}%`;
    const likePattern2 = `%${name}/%`;
    const likePattern3 = `%${name}%`;
    params = [name, likePattern1, likePattern2, likePattern3];
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
  const query = `
    SELECT * FROM schedules 
    WHERE date = ? 
    AND (
      teacher = ? 
      OR teacher LIKE ? 
      OR teacher LIKE ?
      OR teacher LIKE ?
    )
    ORDER BY lesson_number
  `;

  const likePattern1 = `%/${teacher}%`;
  const likePattern2 = `%${teacher}/%`;
  const likePattern3 = `%${teacher}%`;

  db.all(
    query,
    [date, teacher, likePattern1, likePattern2, likePattern3],
    (err, rows) => {
      if (err) {
        console.error("Ошибка при получении расписания преподавателя:", err);
        callback([]);
      } else {
        callback(rows);
      }
    }
  );
}

function getTeacherPartners(teacher, callback) {
  const query = `
  SELECT DISTINCT teacher 
  FROM schedules 
  WHERE teacher LIKE ? 
  AND teacher != ?
  AND teacher LIKE '%/%'
  `;

  db.all(query, [`%${teacher}%`, teacher], (err, rows) => {
    if (err) {
      console.error("Ошибка при поиске партнеров преподавателя:", err);
      callback([]);
    } else {
      const partners = rows.map((row) => row.teacher);
      callback(partners);
    }
  });
}

// --- Функции для взаимодействия с пользователем ---

function formatSchedule(schedule) {
  if (schedule.length === 0) {
    return "✅ На выбранную дату занятий нет.";
  }

  let result = `Расписание для ${
    schedule[0].group_name
      ? `группы ${schedule[0].group_name}`
      : `преподавателя ${schedule[0].teacher}`
  }\n`;
  result += `📆 Дата: ${schedule[0].date} (${schedule[0].day})\n\n`;

  schedule.forEach((lesson) => {
    if (lesson.lesson_number) {
      result += `🕒 Пара ${lesson.lesson_number || "?"}\n`;
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

    if (lesson.classroom) {
      result += `🚪 Аудитория: ${lesson.classroom}\n`;
    } else {
      result += `🚪 Аудитория: нет\n`;
    }

    if (schedule[0].group_name) {
      result += `👨‍🏫 Преподаватель: ${lesson.teacher}\n`;
    } else {
      result += `👥 Группа: ${lesson.group_name}\n`;
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

    const formattedSchedule = formatSchedule(schedule);

    if (state.isSettingMySchedule) {
      userSelections.set(chatId, { type: state.type, name: state.name });
      //   bot.sendMessage(
      //     chatId,
      //     `✅ Отлично! Я запомнил ваш выбор: ${
      //       state.type === "group" ? "группа " + state.name : state.name
      //     }.`
      //   );
    }

    if (state.type === "teacher") {
      getTeacherPartners(state.name, (partners) => {
        let finalMessage = formattedSchedule;

        if (partners.length > 0) {
          finalMessage += `\n📝 Этот преподаватель также ведет занятия с:\n`;
          partners.forEach((partner) => {
            finalMessage += `• ${partner}\n`;
          });
        }

        bot.sendMessage(chatId, finalMessage);
        userStates.delete(chatId);
        showMainMenu(chatId, "Что-нибудь еще?");
      });
    } else {
      bot.sendMessage(chatId, formattedSchedule);
      userStates.delete(chatId);
      showMainMenu(chatId, "Что-нибудь еще?");
    }
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

console.log("🤖 Telegram бот запущен...");
