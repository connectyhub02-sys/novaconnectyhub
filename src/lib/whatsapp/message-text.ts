type RecordValue = Record<string, unknown>;
const textKeys = ['text', 'body', 'caption', 'messageText', 'conversation'];
const contentKeys = ['content', 'audioMessage', 'imageMessage', 'videoMessage', 'documentMessage', 'extendedTextMessage'];

function record(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
}

/** Old history imports encode the media descriptor as a JSON string in both text and content. */
export function readSerializedMediaRecord(value: unknown): RecordValue | null {
  if (typeof value !== 'string') return null;
  try {
    let parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    const data = record(parsed);
    if (!data) return null;
    const keys = new Set(Object.keys(data).map(key => key.toLowerCase()));
    const transport = ['mediakey', 'filesha256', 'fileencsha256', 'directpath'].some(key => keys.has(key));
    const typedFile = ['mimetype', 'contenttype'].some(key => keys.has(key))
      && ['url', 'fileurl', 'mediaurl', 'filelength', 'ptt'].some(key => keys.has(key));
    return transport || typedFile ? data : null;
  } catch {
    return null;
  }
}

/** Preserve ordinary prose/JSON, but never expose transport metadata as a caption or transcript. */
export function readHumanMessageText(value: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  if (typeof value !== 'string') return readProviderMessageText(value, depth + 1);
  const text = value.trim();
  if (!text) return null;
  const media = readSerializedMediaRecord(text);
  if (media) return readProviderMessageText(media, depth + 1);
  return text;
}

export function readProviderMessageText(value: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  const data = record(value) ?? readSerializedMediaRecord(value);
  if (!data) return null;
  // Only this message's content. Quoted messages and contextInfo belong to another turn.
  for (const key of [...textKeys, ...contentKeys]) {
    const text = readHumanMessageText(data[key], depth + 1);
    if (text) return text;
  }
  return null;
}
