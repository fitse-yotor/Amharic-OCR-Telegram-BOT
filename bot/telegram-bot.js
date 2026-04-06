import 'dotenv/config'
import axios from 'axios'
import sharp from 'sharp'
import TelegramBot from 'node-telegram-bot-api'
import Tesseract from 'tesseract.js'

const { recognize } = Tesseract

const token = process.env.TELEGRAM_BOT_TOKEN
const language = process.env.OCR_LANG || 'amh+eng'
const ocrServiceUrl = process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8000'

if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN in .env')
  console.error('Create a .env file in project root from .env.example and set TELEGRAM_BOT_TOKEN.')
  process.exit(1)
}

const bot = new TelegramBot(token, { polling: true })

function startWaitingAnimation(chatId) {
  bot.sendChatAction(chatId, 'typing').catch(() => {})
  const intervalId = setInterval(() => {
    bot.sendChatAction(chatId, 'typing').catch(() => {})
  }, 4000)

  return () => clearInterval(intervalId)
}

async function preprocessForAmharic(imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata()
  const width = Math.max(1200, (metadata.width || 1000) * 2)

  return sharp(imageBuffer)
    .resize({ width, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .threshold(145)
    .png()
    .toBuffer()
}

async function extractWithPythonService(imageBuffer, langCode) {
  const formData = new FormData()
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' })
  formData.append('file', blob, 'telegram-photo.jpg')
  formData.append('languages', langCode)

  const response = await fetch(`${ocrServiceUrl}/ocr`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Python OCR service failed: ${response.status} ${message}`)
  }

  const payload = await response.json()
  return cleanText(payload.text || '')
}

async function extractWithTesseractFallback(originalBuffer, langCode) {
  const preprocessed = await preprocessForAmharic(originalBuffer)
  const [{ data: baseData }, { data: enhancedData }] = await Promise.all([
    recognize(originalBuffer, langCode),
    recognize(preprocessed, langCode),
  ])

  const baseText = cleanText(baseData.text || '')
  const enhancedText = cleanText(enhancedData.text || '')
  return enhancedText.length >= baseText.length ? enhancedText : baseText
}

function cleanText(text) {
  const normalized = text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/(\p{L})-\n(\p{L})/gu, '$1$2')
    .trim()

  const rawLines = normalized.split('\n').map((line) => line.trim())
  const paragraphs = []
  let current = []

  for (const line of rawLines) {
    if (!line) {
      if (current.length > 0) {
        paragraphs.push(current.join(' '))
        current = []
      }
      continue
    }
    current.push(line)
  }
  if (current.length > 0) paragraphs.push(current.join(' '))

  return paragraphs
    .join('\n\n')
    .replace(/(?<=\p{L})[|~`^_*#<>]+(?=\p{L})/gu, '')
    .replace(/(?<=\p{L})[^\p{L}\p{N}\s.,!?;:።፧፨፣፤'"()\[\]{}\-\/]+(?=\p{L})/gu, '')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitForTelegram(text, max = 3900) {
  if (text.length <= max) return [text]
  const parts = []
  let rest = text
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max)
    if (cut < max * 0.5) cut = max
    parts.push(rest.slice(0, cut))
    rest = rest.slice(cut).trimStart()
  }
  if (rest) parts.push(rest)
  return parts
}

bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    'Welcome to Amharic OCR bot!\n\nSend a clear image with text, and I will extract and reply with the text (Amharic + English supported).',
  )
})

bot.on('photo', async (msg) => {
  const chatId = msg.chat.id
  const photos = msg.photo || []
  if (!photos.length) return

  let stopWaiting = null
  try {
    stopWaiting = startWaitingAnimation(chatId)
    await bot.sendMessage(chatId, 'Reading image... please wait ⏳')

    const bestPhoto = photos[photos.length - 1]
    const fileLink = await bot.getFileLink(bestPhoto.file_id)
    const imageResponse = await axios.get(fileLink, { responseType: 'arraybuffer', timeout: 30000 })
    const originalBuffer = Buffer.from(imageResponse.data)
    let selected = ''

    try {
      selected = await extractWithPythonService(originalBuffer, language)
    } catch (serviceError) {
      console.warn('Python OCR unavailable, using Tesseract fallback:', serviceError.message)
      selected = await extractWithTesseractFallback(originalBuffer, language)
    }

    if (!selected) {
      await bot.sendMessage(chatId, 'I could not read text. Try a clearer or closer image.')
      return
    }

    const chunks = splitForTelegram(selected)
    for (let i = 0; i < chunks.length; i += 1) {
      const prefix = chunks.length > 1 ? `Part ${i + 1}/${chunks.length}\n\n` : ''
      await bot.sendMessage(chatId, `${prefix}${chunks[i]}`)
    }
  } catch (error) {
    console.error('OCR bot error:', error)
    await bot.sendMessage(
      chatId,
      'Sorry, OCR failed for this image. Please send a clearer photo and try again.',
    )
  } finally {
    if (stopWaiting) stopWaiting()
  }
})

bot.on('message', async (msg) => {
  const chatId = msg.chat.id
  const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0
  if (hasPhoto || (msg.text && msg.text.startsWith('/start'))) return

  await bot.sendMessage(chatId, 'Please send an image. I only read text from photos.')
})

console.log('Telegram OCR bot is running...')
