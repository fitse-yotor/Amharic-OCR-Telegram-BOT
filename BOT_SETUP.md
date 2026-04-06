## Telegram OCR Bot Setup

### 1) Configure environment

Create `.env` in project root from `.env.example`:

```env
TELEGRAM_BOT_TOKEN=your_new_bot_token
OCR_LANG=amh+eng
OCR_SERVICE_URL=http://127.0.0.1:8000
```

### 2) Install Python OCR dependencies (EasyOCR service)

```bash
pip install -r python-ocr/requirements.txt
```

### 3) Run options

- **Bot only (uses Python OCR if running, else Tesseract fallback):**

```bash
npm run bot
```

- **Frontend + Bot:**

```bash
npm run dev:all
```

- **Frontend + Bot + Python EasyOCR service (recommended):**

```bash
npm run dev:stack
```

### 4) Test in Telegram

Open your bot, send `/start`, then send a text image.

### Notes

- Best results: clear image, good contrast, text not too small.
- The bot handles Telegram photo messages and replies with extracted text.
