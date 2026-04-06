# Amharic OCR Platform

Multilingual OCR platform with:

- **React frontend** for image upload/paste, crop, and OCR preview
- **Telegram bot** that reads text from images and replies with extracted text
- **Hybrid OCR architecture**:
  - Python **EasyOCR** service (primary)
  - Node **Tesseract.js** fallback (automatic)

Supports Amharic-focused extraction with preprocessing and text cleanup.

## Features

- Upload image or paste from clipboard
- Crop target area before OCR
- Multi-language OCR (default `amh+eng`)
- Telegram bot `/start` welcome + OCR from photo messages
- Waiting indicator while bot processes image
- OCR post-processing to reduce noisy characters and broken lines

## Tech Stack

- Frontend: React + Vite
- Bot: Node.js + `node-telegram-bot-api`
- OCR service: Python + FastAPI + EasyOCR
- Fallback OCR: Tesseract.js

## Project Structure

`src/` - frontend app  
`bot/` - Telegram bot  
`python-ocr/` - Python OCR microservice  
`BOT_SETUP.md` - detailed bot setup notes

## Prerequisites

- Node.js 18+ (recommended)
- Python 3.10+
- pip

## Environment Variables

Create `.env` in project root:

```env
TELEGRAM_BOT_TOKEN=your_new_token_from_botfather
OCR_LANG=amh+eng
OCR_SERVICE_URL=http://127.0.0.1:8000
```

## Installation

```bash
npm install
pip install -r python-ocr/requirements.txt
```

## Run Commands

- Frontend only:

```bash
npm run dev
```

- Bot only:

```bash
npm run bot
```

- Python OCR service only:

```bash
npm run ocr:service
```

- Frontend + Bot:

```bash
npm run dev:all
```

- Frontend + Bot + Python OCR service (recommended):

```bash
npm run dev:stack
```

## Build

```bash
npm run build
```

## How OCR Flow Works

1. Telegram user sends photo.
2. Bot downloads best-quality image.
3. Bot calls Python OCR service (`/ocr`).
4. If Python service is unavailable, bot falls back to Tesseract pipeline.
5. Bot cleans extracted text and replies in one or multiple messages.

## Troubleshooting

- **`Missing TELEGRAM_BOT_TOKEN in .env`**
  - Ensure `.env` exists in project root and is not empty.
- **`No module named easyocr`**
  - Run `pip install -r python-ocr/requirements.txt`.
- **Vite port already in use**
  - Vite auto-selects next port (5174, 5175, ...). Use printed local URL.

## Security Notes

- Never commit `.env`.
- If token is exposed, regenerate token in BotFather immediately.

## License

Use and modify for your project needs.
