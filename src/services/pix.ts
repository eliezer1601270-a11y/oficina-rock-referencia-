/**
 * EMV QRCPS / BR Code Pix Payload Generator
 * Conforme especificações do Banco Central do Brasil
 */

function formatField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function calculateCRC16(payload: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface PixPayloadParams {
  pixKey: string; // CNPJ 33328135000130
  merchantName?: string; // Ex: CNPJ 33328135000130
  merchantCity?: string; // Ex: IBIUNA
  amount?: number; // e.g. 50.00
  txId?: string; // e.g. "MENSALIDADE11"
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizePixKey(rawKey: string): string {
  const trimmed = (rawKey || '').trim();
  if (!trimmed) return '33328135000130';
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase().replace(/\s+/g, '');
  }
  if (UUID_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (trimmed.startsWith('+')) {
    return `+${trimmed.replace(/\D/g, '')}`;
  }
  // CNPJ / CPF / Telefone nacional: apenas dígitos (remove pontos, barras e traços)
  const digits = trimmed.replace(/\D/g, '');
  return digits || '33328135000130';
}

export function formatPixRecipientCnpj(rawKey: string): string {
  const digits = (rawKey || '').replace(/\D/g, '') || '33328135000130';
  return `CNPJ ${digits}`.slice(0, 25);
}

function normalizeAsciiField(value: string, maxLength: number, fallback: string): string {
  const cleaned = (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return cleaned || fallback;
}

export function generatePixPayload({
  pixKey,
  merchantName,
  merchantCity = 'IBIUNA',
  amount,
  txId = '***',
}: PixPayloadParams): string {
  const cleanKey = sanitizePixKey(pixKey);
  // Destinatário obrigatório com o CNPJ do Motoclube em formato aceito por todos os bancos no EMV (Tag 59)
  const recipientBase =
    merchantName && /cnpj/i.test(merchantName)
      ? merchantName
      : formatPixRecipientCnpj(cleanKey);
  const cleanName = normalizeAsciiField(recipientBase, 25, 'CNPJ 33328135000130');
  const cleanCity = normalizeAsciiField(merchantCity, 15, 'IBIUNA');
  const rawTxId = (txId || '').trim();
  const cleanTxId =
    rawTxId === '***' || !rawTxId
      ? '***'
      : rawTxId
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9]/g, '')
          .slice(0, 25) || '***';

  // 00 - Payload Format Indicator
  let payload = formatField('00', '01');

  // 26 - Merchant Account Information (Pix)
  const gui = formatField('00', 'br.gov.bcb.pix');
  const key = formatField('01', cleanKey);
  payload += formatField('26', `${gui}${key}`);

  // 52 - Merchant Category Code
  payload += formatField('52', '0000');

  // 53 - Transaction Currency (986 = BRL)
  payload += formatField('53', '986');

  // 54 - Transaction Amount (optional)
  if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
    payload += formatField('54', amount.toFixed(2));
  }

  // 58 - Country Code
  payload += formatField('58', 'BR');

  // 59 - Merchant Name (Destinatário CNPJ do Motoclube)
  payload += formatField('59', cleanName);

  // 60 - Merchant City
  payload += formatField('60', cleanCity);

  // 62 - Additional Data Field Template (TxID)
  const txIdField = formatField('05', cleanTxId);
  payload += formatField('62', txIdField);

  // 63 - CRC16 placeholder + checksum
  payload += '6304';

  const crc = calculateCRC16(payload);
  return `${payload}${crc}`;
}

