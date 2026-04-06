import { useCallback, useMemo, useState } from 'react'
import Cropper from 'react-easy-crop'
import { recognize } from 'tesseract.js'
import './App.css'

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'eng' },
  { label: 'Amharic', value: 'amh' },
  { label: 'Arabic', value: 'ara' },
  { label: 'French', value: 'fra' },
  { label: 'Spanish', value: 'spa' },
]

function App() {
  const [selectedLanguages, setSelectedLanguages] = useState(['eng', 'amh'])
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [ocrText, setOcrText] = useState('')
  const [status, setStatus] = useState('Choose or paste an image to start.')
  const [isConverting, setIsConverting] = useState(false)
  const [amharicBoost, setAmharicBoost] = useState(true)

  const languageCode = useMemo(() => selectedLanguages.join('+'), [selectedLanguages])

  const onFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setCroppedAreaPixels(null)
    setZoom(1)
    setCrop({ x: 0, y: 0 })
    setStatus(`Image ready: ${file.name}`)
  }

  const onLanguageToggle = (language) => {
    setSelectedLanguages((current) => {
      if (current.includes(language)) {
        return current.filter((item) => item !== language)
      }
      return [...current, language]
    })
  }

  const onPasteFromClipboard = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read()
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const extension = imageType.split('/')[1] || 'png'
          const file = new File([blob], `pasted-image.${extension}`, { type: imageType })
          setImageFile(file)
          setImagePreview(URL.createObjectURL(file))
          setCroppedAreaPixels(null)
          setZoom(1)
          setCrop({ x: 0, y: 0 })
          setStatus('Image pasted from clipboard. Move/zoom in crop editor if needed.')
          return
        }
      }
      setStatus('Clipboard has no image. Copy an image first.')
    } catch (error) {
      setStatus('Clipboard access failed. Try using Ctrl+V in this page or upload a file.')
      window.addEventListener(
        'paste',
        (event) => {
          const file = event.clipboardData?.files?.[0]
          if (!file || !file.type.startsWith('image/')) return
          setImageFile(file)
          setImagePreview(URL.createObjectURL(file))
          setCroppedAreaPixels(null)
          setZoom(1)
          setCrop({ x: 0, y: 0 })
          setStatus('Image pasted into page. Move/zoom in crop editor if needed.')
        },
        { once: true },
      )
    }
  }

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const clearCrop = () => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setStatus('Crop reset. Convert will use the visible crop area.')
  }

  const createImage = (url) =>
    new Promise((resolve, reject) => {
      const image = new Image()
      image.addEventListener('load', () => resolve(image))
      image.addEventListener('error', reject)
      image.setAttribute('crossOrigin', 'anonymous')
      image.src = url
    })

  const createObjectUrlImage = (blob) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      const image = new Image()
      image.addEventListener('load', () => {
        URL.revokeObjectURL(url)
        resolve(image)
      })
      image.addEventListener('error', (error) => {
        URL.revokeObjectURL(url)
        reject(error)
      })
      image.src = url
    })

  const preprocessForAmharic = async (blob) => {
    const image = await createObjectUrlImage(blob)
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return blob

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const { data } = imageData

    // Improve readability for varied Amharic fonts: grayscale + contrast + threshold.
    const contrast = 1.35
    const threshold = 145
    for (let index = 0; index < data.length; index += 4) {
      const gray = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]
      let value = (gray - 128) * contrast + 128
      value = value > threshold ? 255 : 0
      data[index] = value
      data[index + 1] = value
      data[index + 2] = value
    }
    context.putImageData(imageData, 0, 0)

    return new Promise((resolve) => {
      canvas.toBlob((processedBlob) => resolve(processedBlob || blob), 'image/png')
    })
  }

  const scoreAmharicText = (text) => {
    const ethiopicChars = text.match(/[\u1200-\u137F]/g)?.length || 0
    const totalChars = text.replace(/\s+/g, '').length || 1
    return ethiopicChars * 3 + totalChars * 0.01
  }

  const getCroppedImageBlob = async () => {
    if (!imagePreview || !croppedAreaPixels) return imageFile

    const image = await createImage(imagePreview)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(croppedAreaPixels.width))
    canvas.height = Math.max(1, Math.round(croppedAreaPixels.height))
    const context = canvas.getContext('2d')
    if (!context) return imageFile

    context.drawImage(
      image,
      Math.round(croppedAreaPixels.x),
      Math.round(croppedAreaPixels.y),
      Math.round(croppedAreaPixels.width),
      Math.round(croppedAreaPixels.height),
      0,
      0,
      canvas.width,
      canvas.height,
    )

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || imageFile), imageFile?.type || 'image/png')
    })
  }

  const onConvert = async () => {
    if (!imageFile) {
      setStatus('Please upload or paste an image first.')
      return
    }
    if (selectedLanguages.length === 0) {
      setStatus('Select at least one language (for example: English + Amharic).')
      return
    }

    try {
      setIsConverting(true)
      setStatus('OCR in progress...')
      const croppedBlob = await getCroppedImageBlob()
      const useAmharicBoost = amharicBoost && selectedLanguages.includes('amh')

      const {
        data: { text: baseText },
      } = await recognize(croppedBlob, languageCode, {
        logger: (message) => {
          if (message.status === 'recognizing text' && typeof message.progress === 'number') {
            const percent = Math.round(message.progress * 100)
            setStatus(`Recognizing text... ${percent}%`)
          }
        },
      })

      let bestText = baseText || ''
      if (useAmharicBoost) {
        setStatus('Running Amharic enhancement pass...')
        const boostedBlob = await preprocessForAmharic(croppedBlob)
        const {
          data: { text: boostedText },
        } = await recognize(boostedBlob, languageCode, {
          logger: (message) => {
            if (message.status === 'recognizing text' && typeof message.progress === 'number') {
              const percent = Math.round(message.progress * 100)
              setStatus(`Enhancement OCR... ${percent}%`)
            }
          },
        })
        bestText =
          scoreAmharicText(boostedText || '') >= scoreAmharicText(baseText || '')
            ? boostedText || ''
            : baseText || ''
      }

      setOcrText(bestText.trim())
      setStatus('Conversion complete.')
    } catch (error) {
      setStatus(`OCR failed: ${error.message}`)
    } finally {
      setIsConverting(false)
    }
  }

  const copyText = async () => {
    if (!ocrText.trim()) return
    try {
      await navigator.clipboard.writeText(ocrText)
      setStatus('Extracted text copied to clipboard.')
    } catch {
      setStatus('Copy failed. Select and copy text manually.')
    }
  }

  return (
    <main className="app">
      <header className="hero">
        <p className="badge">Multilingual OCR Studio</p>
        <h1>Amharic OCR Converter</h1>
        <p className="subtitle">
          Upload or paste an image, choose language, crop what you need, and convert to clean text.
        </p>
      </header>

      <section className="panel">
        <h2 className="panel-title">Image Input</h2>
        <div className="actions">
          <label className="btn">
            Upload image
            <input type="file" accept="image/*" onChange={onFileChange} hidden />
          </label>
          <button type="button" className="btn secondary" onClick={onPasteFromClipboard}>
            Paste image
          </button>
          <button type="button" className="btn success" onClick={onConvert} disabled={isConverting}>
            {isConverting ? 'Converting...' : 'Convert'}
          </button>
          <button type="button" className="btn secondary" onClick={clearCrop} disabled={!imagePreview}>
            Reset crop
          </button>
        </div>

        <div className="languages">
          {LANGUAGE_OPTIONS.map((item) => (
            <label key={item.value} className="language-item">
              <input
                type="checkbox"
                checked={selectedLanguages.includes(item.value)}
                onChange={() => onLanguageToggle(item.value)}
              />
              {item.label}
            </label>
          ))}
        </div>
        <label className="boost-option">
          <input
            type="checkbox"
            checked={amharicBoost}
            onChange={(event) => setAmharicBoost(event.target.checked)}
          />
          Amharic enhancement mode (better for mixed or hard-to-read fonts)
        </label>

        <p className="status">{status}</p>

        <div className="preview-box">
          {imagePreview ? (
            <div className="cropper-wrap">
              <Cropper
                image={imagePreview}
                crop={crop}
                zoom={zoom}
                aspect={4 / 3}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                cropShape="rect"
                showGrid
              />
            </div>
          ) : (
            <span>No image selected</span>
          )}
        </div>

        {imagePreview ? (
          <div className="zoom-control">
            <label htmlFor="zoom-range">Zoom</label>
            <input
              id="zoom-range"
              type="range"
              min="1"
              max="3"
              step="0.1"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <span>{zoom.toFixed(1)}x</span>
          </div>
        ) : null}

        <div className="result-header">
          <h2 className="panel-title">Extracted Text</h2>
          <button type="button" className="btn ghost" onClick={copyText} disabled={!ocrText.trim()}>
            Copy text
          </button>
        </div>
        <textarea
          className="result"
          value={ocrText}
          onChange={(event) => setOcrText(event.target.value)}
          placeholder="Recognized text appears here..."
          rows={12}
        />
      </section>
    </main>
  )
}

export default App
