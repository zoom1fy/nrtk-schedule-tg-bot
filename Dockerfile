FROM node:18-alpine

# Устанавливаем системные зависимости
RUN apk add --no-cache \
    python3 \
    py3-pip \
    build-base \
    python3-dev \
    # Добавляем зависимости для pdfplumber
    gcc \
    musl-dev \
    jpeg-dev \
    zlib-dev \
    freetype-dev \
    lcms2-dev \
    openjpeg-dev \
    tiff-dev \
    tk-dev \
    tcl-dev \
    harfbuzz-dev \
    fribidi-dev

# Создаем виртуальное окружение для Python
RUN python3 -m venv /app/venv

# Устанавливаем зависимости Python в виртуальном окружении
RUN /app/venv/bin/pip install --upgrade pip && \
    /app/venv/bin/pip install pdfplumber pandas xlsxwriter

# Создаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости Node.js
RUN npm install

# Копируем все файлы приложения
COPY . .

# Создаем директорию для assets
RUN mkdir -p assets

# Добавляем виртуальное окружение в PATH
ENV PATH="/app/venv/bin:$PATH"

# Указываем порт (если нужно)
EXPOSE 3030

# Запускаем приложение с предварительным обновлением расписания
CMD ["sh", "-c", "npm run update && node telegram-bot.js"]
