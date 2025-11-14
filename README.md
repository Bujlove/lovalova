# Alice Builder MVP

Простой прототип сервиса «российского Lovable» на базе Alice LLM в Yandex Cloud.

## Структура
- `backend/` — FastAPI (для локальной разработки), прокси к Alice LLM, in-memory хранилище проектов.
- `frontend/` — Vite + React, файловый редактор и чат.
- `api/` — Vercel Serverless Functions (Node.js) для продакшена.

## Настройка backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # заполните YANDEX_API_KEY и YANDEX_FOLDER_ID
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Настройка frontend
```bash
cd frontend
cp .env.example .env  # при необходимости смените URL API
npm install
npm run dev -- --host
```

## Запросы
- `POST /api/projects` — создать проект (`name`, `template`).
- `GET /api/projects/{id}` — получить проект.
- `GET /api/projects/{id}/files` — список файлов.
- `PUT /api/projects/{id}/files` — сохранить файл.
- `POST /api/chat` — чат с Alice LLM.

## Деплой на Vercel

1. Подключите репозиторий к Vercel
2. Установите переменные окружения в Vercel Dashboard:
   - `YANDEX_API_KEY` — API ключ Yandex Cloud
   - `YANDEX_FOLDER_ID` — ID папки в Yandex Cloud
3. Vercel автоматически определит настройки из `vercel.json`
4. Фронтенд будет собран из `frontend/`, API функции из `api/`

## Дальнейшие шаги
- Добавить авторизацию и постоянное хранилище (YDB/Postgres).
- Подключить sandbox для запуска кода.
- Обработать биллинг и тарификацию в рублях.
- Заменить in-memory store на постоянное хранилище для serverless функций.
