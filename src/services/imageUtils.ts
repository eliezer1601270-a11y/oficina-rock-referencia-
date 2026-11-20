/**
 * Client-side image compression and sanitization utilities.
 * Ensures uploaded photos stay fast, crisp, and well below Firestore's 1MB document limit
 * and browser localStorage limits.
 */

export interface CompressOptions {
  maxDimension?: number;
  quality?: number;
  maxChars?: number;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Falha ao ler arquivo de imagem.'));
      }
    };
    reader.onerror = () => reject(new Error('Erro ao carregar imagem do dispositivo.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Formato de imagem inválido ou corrompido.'));
    img.src = src;
  });
}

export async function compressImageFile(
  file: File,
  options: CompressOptions = {}
): Promise<string> {
  const {
    maxDimension = 1024,
    quality = 0.78,
    maxChars = 240_000,
  } = options;

  const isImageMime = file.type.startsWith('image/');
  const hasImageExt = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || '');
  if (!isImageMime && !hasImageExt) {
    throw new Error('Selecione um arquivo de imagem válido (JPG, PNG, WEBP).');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const img = await loadImageElement(rawDataUrl);

  let targetWidth = img.naturalWidth || img.width;
  let targetHeight = img.naturalHeight || img.height;

  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error('Dimensões da imagem inválidas.');
  }

  // Scale down proportionally to fit within maxDimension
  if (targetWidth > maxDimension || targetHeight > maxDimension) {
    const ratio = Math.min(maxDimension / targetWidth, maxDimension / targetHeight);
    targetWidth = Math.max(1, Math.round(targetWidth * ratio));
    targetHeight = Math.max(1, Math.round(targetHeight * ratio));
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Navegador sem suporte a processamento de imagem.');
  }

  // Iteratively adjust quality & scale if needed so output stays <= maxChars
  let currentQuality = quality;
  let currentWidth = targetWidth;
  let currentHeight = targetHeight;
  let result = '';

  for (let attempt = 0; attempt < 6; attempt++) {
    canvas.width = currentWidth;
    canvas.height = currentHeight;
    ctx.clearRect(0, 0, currentWidth, currentHeight);
    ctx.fillStyle = '#0c0c0e';
    ctx.fillRect(0, 0, currentWidth, currentHeight);
    ctx.drawImage(img, 0, 0, currentWidth, currentHeight);

    result = canvas.toDataURL('image/jpeg', currentQuality);
    if (result.length <= maxChars) {
      return result;
    }

    // Reduce quality first, then scale down dimensions if still large
    if (currentQuality > 0.45) {
      currentQuality = Math.max(0.38, currentQuality - 0.14);
    } else {
      currentWidth = Math.max(200, Math.round(currentWidth * 0.75));
      currentHeight = Math.max(200, Math.round(currentHeight * 0.75));
    }
  }

  if (result.length > 390_000) {
    throw new Error('A imagem é muito grande mesmo após compressão. Escolha outra foto menor.');
  }

  return result;
}

export async function compressDataUrlIfNeeded(
  value: string | undefined,
  options: CompressOptions = {}
): Promise<string> {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  const { maxDimension = 1024, quality = 0.76, maxChars = 240_000 } = options;
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  try {
    const img = await loadImageElement(trimmed);
    let currentWidth = img.naturalWidth || img.width;
    let currentHeight = img.naturalHeight || img.height;
    if (currentWidth <= 0 || currentHeight <= 0) return '';

    if (currentWidth > maxDimension || currentHeight > maxDimension) {
      const ratio = Math.min(maxDimension / currentWidth, maxDimension / currentHeight);
      currentWidth = Math.max(1, Math.round(currentWidth * ratio));
      currentHeight = Math.max(1, Math.round(currentHeight * ratio));
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    let currentQuality = quality;
    let result = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      canvas.width = currentWidth;
      canvas.height = currentHeight;
      ctx.clearRect(0, 0, currentWidth, currentHeight);
      ctx.fillStyle = '#0c0c0e';
      ctx.fillRect(0, 0, currentWidth, currentHeight);
      ctx.drawImage(img, 0, 0, currentWidth, currentHeight);
      result = canvas.toDataURL('image/jpeg', currentQuality);
      if (result.length <= maxChars) return result;
      if (currentQuality > 0.36) {
        currentQuality = Math.max(0.28, currentQuality - 0.12);
      } else {
        currentWidth = Math.max(120, Math.round(currentWidth * 0.72));
        currentHeight = Math.max(120, Math.round(currentHeight * 0.72));
      }
    }
    return result.length <= maxChars ? result : '';
  } catch {
    return '';
  }
}

export function sanitizeImageString(value: string | undefined, maxChars = 390_000): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.length > maxChars) {
    // Never slice a base64 data URL (it corrupts the image or PDF)
    if (trimmed.startsWith('data:image/') || trimmed.startsWith('data:application/pdf')) {
      return '';
    }
    return trimmed.slice(0, maxChars);
  }
  return trimmed;
}

export async function processReceiptFile(
  file: File
): Promise<{ dataUrl: string; fileName: string }> {
  const safeName = (file.name || 'comprovante').slice(0, 120);

  if (file.type === 'application/pdf' || safeName.toLowerCase().endsWith('.pdf')) {
    const rawDataUrl = await readFileAsDataUrl(file);
    if (rawDataUrl.length > 380_000) {
      throw new Error(
        'O PDF do comprovante excede o limite de tamanho (~270 KB). Envie uma foto/print da tela ou um PDF menor.'
      );
    }
    return { dataUrl: rawDataUrl, fileName: safeName };
  }

  if (file.type.startsWith('image/')) {
    const compressed = await compressImageFile(file, {
      maxDimension: 1200,
      quality: 0.78,
      maxChars: 260_000,
    });
    return { dataUrl: compressed, fileName: safeName };
  }

  throw new Error('Formato não suportado. Envie uma imagem (JPG, PNG, WEBP) ou PDF pequeno.');
}

export interface ProcessedClubDocument {
  fileType: 'pdf' | 'image';
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  dataUrl: string;
}

export async function processClubDocumentFile(file: File): Promise<ProcessedClubDocument> {
  const safeName = (file.name || 'documento').slice(0, 180);
  const lower = safeName.toLowerCase();
  const isPdf = file.type === 'application/pdf' || lower.endsWith('.pdf');
  const isImage =
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(lower);

  if (isPdf) {
    // Up to 25MB raw PDF (~35.5M chars base64, stored in up to 65 Firestore chunks of 550k)
    if (file.size > 25_500_000) {
      throw new Error(
        'O arquivo PDF excede o limite de 25 MB por documento. Reduza o tamanho do PDF antes de enviar.'
      );
    }
    const rawDataUrl = await readFileAsDataUrl(file);
    if (rawDataUrl.length > 35_500_000) {
      throw new Error(
        'O arquivo PDF codificado excede o limite suportado (até 25 MB / 65 partes).'
      );
    }
    return {
      fileType: 'pdf',
      fileName: safeName,
      mimeType: 'application/pdf',
      fileSizeBytes: file.size || Math.round((rawDataUrl.length * 3) / 4),
      dataUrl: rawDataUrl,
    };
  }

  if (isImage) {
    const compressed = await compressImageFile(file, {
      maxDimension: 1400,
      quality: 0.82,
      maxChars: 380_000,
    });
    return {
      fileType: 'image',
      fileName: safeName,
      mimeType: 'image/jpeg',
      fileSizeBytes: Math.round((compressed.length * 3) / 4),
      dataUrl: compressed,
    };
  }

  throw new Error('Formato não suportado. Envie um arquivo PDF ou uma foto (JPG, PNG, WEBP).');
}

function normalizeBase64Payload(raw: string): string {
  // Remove whitespace/newlines and convert base64url characters to standard base64
  let cleaned = raw.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const mod = cleaned.length % 4;
  if (mod === 2) cleaned += '==';
  else if (mod === 3) cleaned += '=';
  else if (mod === 1) cleaned = cleaned.slice(0, -1);
  return cleaned;
}

function decodeBase64ToBytes(base64Input: string): Uint8Array {
  const b64 = normalizeBase64Payload(base64Input);
  // Decode in 4MB-aligned chunks so multi-megabyte PDFs don't cause memory spikes
  const CHUNK_CHARS = 1024 * 1024 * 3; // multiple of 4
  if (b64.length <= CHUNK_CHARS) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }

  const decodedParts: string[] = [];
  let totalBytes = 0;
  for (let offset = 0; offset < b64.length; offset += CHUNK_CHARS) {
    const part = atob(b64.slice(offset, offset + CHUNK_CHARS));
    decodedParts.push(part);
    totalBytes += part.length;
  }
  const out = new Uint8Array(totalBytes);
  let writePos = 0;
  for (const part of decodedParts) {
    for (let i = 0; i < part.length; i++) {
      out[writePos++] = part.charCodeAt(i);
    }
  }
  return out;
}

export function normalizeDocumentDataUrl(
  raw: string,
  fallbackMime = 'application/pdf'
): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  if (trimmed.startsWith('data:')) {
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx === -1) return trimmed;
    const header = trimmed.slice(0, commaIdx);
    const payload = trimmed.slice(commaIdx + 1);
    if (/;base64/i.test(header)) {
      const cleaned = payload.replace(/\s+/g, '');
      return `${header},${cleaned}`;
    }
    return trimmed;
  }
  // Raw base64 stored without data URI header
  const cleaned = trimmed.replace(/\s+/g, '');
  return `data:${fallbackMime};base64,${cleaned}`;
}

export function dataUrlToUint8Array(
  dataUrl: string,
  fallbackMime = 'application/octet-stream'
): { bytes: Uint8Array; mime: string } | null {
  const normalized = normalizeDocumentDataUrl(dataUrl, fallbackMime);
  if (!normalized || !normalized.startsWith('data:')) {
    return null;
  }
  const commaIdx = normalized.indexOf(',');
  if (commaIdx === -1) return null;

  const header = normalized.slice(0, commaIdx);
  const payload = normalized.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:([^;,]+)/i);
  let mime = mimeMatch ? mimeMatch[1].trim() : fallbackMime;

  let bytes: Uint8Array;
  if (/;base64/i.test(header)) {
    bytes = decodeBase64ToBytes(payload);
  } else {
    const decodedText = decodeURIComponent(payload);
    bytes = new TextEncoder().encode(decodedText);
  }

  // Auto-detect PDF magic header "%PDF-" if mime was generic
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    mime = 'application/pdf';
  }

  return { bytes, mime };
}

export function dataUrlToBlobUrl(
  dataUrl: string,
  fallbackMime = 'application/octet-stream'
): string {
  const normalized = normalizeDocumentDataUrl(dataUrl, fallbackMime);
  if (!normalized) return '';
  if (!normalized.startsWith('data:')) return normalized;

  const decoded = dataUrlToUint8Array(normalized, fallbackMime);
  if (!decoded) return normalized;

  const bufferCopy = new Uint8Array(decoded.bytes.byteLength);
  bufferCopy.set(decoded.bytes);
  const blob = new Blob([bufferCopy.buffer], { type: decoded.mime });
  return URL.createObjectURL(blob);
}
