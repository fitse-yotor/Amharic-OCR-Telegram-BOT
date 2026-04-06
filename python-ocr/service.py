from io import BytesIO
from typing import Dict, List

import easyocr
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from PIL import Image, ImageOps

app = FastAPI(title="Amharic OCR Service")
reader_cache: Dict[str, easyocr.Reader] = {}


LANG_MAP = {
    "amh": "am",
    "eng": "en",
    "ara": "ar",
    "fra": "fr",
    "spa": "es",
}


def parse_languages(language_string: str) -> List[str]:
    requested = [item.strip() for item in language_string.split("+") if item.strip()]
    mapped = [LANG_MAP[item] for item in requested if item in LANG_MAP]
    if not mapped:
        mapped = ["am", "en"]
    # Preserve order while removing duplicates.
    return list(dict.fromkeys(mapped))


def get_reader(languages: List[str]) -> easyocr.Reader:
    key = ",".join(languages)
    if key not in reader_cache:
        reader_cache[key] = easyocr.Reader(languages, gpu=False)
    return reader_cache[key]


def preprocess_image(file_bytes: bytes) -> np.ndarray:
    image = Image.open(BytesIO(file_bytes)).convert("RGB")
    image = ImageOps.exif_transpose(image)
    # Upscale and auto-contrast helps different Amharic fonts.
    image = image.resize((image.width * 2, image.height * 2), Image.Resampling.LANCZOS)
    image = ImageOps.autocontrast(image)
    return np.array(image)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...), languages: str = Form("amh+eng")) -> dict:
    file_bytes = await file.read()
    lang_list = parse_languages(languages)
    reader = get_reader(lang_list)
    image_array = preprocess_image(file_bytes)
    lines = reader.readtext(image_array, detail=0, paragraph=True)
    text = "\n".join(line.strip() for line in lines if line.strip()).strip()
    return {"text": text, "engine": "easyocr", "languages": lang_list}
