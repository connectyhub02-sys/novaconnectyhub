import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Original vector artwork; self-hosted stickers, without third-party asset URLs.
const drawings = {
  greeting: '<path d="M168 236c0-20 30-20 30 0v-78c0-22 32-22 32 0v66-91c0-23 32-23 32 0v91-70c0-22 32-22 32 0v83-36c0-22 32-22 32 0v95c0 74-49 104-92 88-37-13-66-55-66-88z" fill="#f5bc62" stroke="#583611" stroke-width="10" stroke-linejoin="round"/><path d="M122 150l-17-22m38-6-6-23m222 61 18-18" stroke="#7257df" stroke-width="12" stroke-linecap="round"/>',
  thanks: '<path d="M256 354 147 252c-66-75 37-160 109-81 72-79 175 6 109 81z" fill="#e76489" stroke="#922e53" stroke-width="12" stroke-linejoin="round"/><path d="M355 106v40m-20-20h40m-234 207v28m-14-14h28" stroke="#7257df" stroke-width="10" stroke-linecap="round"/>',
  ok: '<circle cx="256" cy="244" r="127" fill="#80d6b6" stroke="#176951" stroke-width="12"/><path d="m184 244 48 48 98-101" fill="none" stroke="#fff" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>',
  laugh: '<circle cx="256" cy="244" r="128" fill="#f9d370" stroke="#8c5a1e" stroke-width="12"/><path d="m174 216 28-19 24 19m61 0 26-19 25 19" fill="none" stroke="#583611" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="M177 262h158c-6 110-151 110-158 0z" fill="#583611"/><path d="M210 322q46-40 92 0" fill="#ef8292"/>',
  thinking: '<path d="M134 126h244v198H252l-69 48 8-48h-57z" fill="#dcd4fb" stroke="#7257df" stroke-width="12" stroke-linejoin="round"/><g fill="#7257df"><circle cx="194" cy="225" r="15"/><circle cx="256" cy="225" r="15"/><circle cx="318" cy="225" r="15"/></g>',
};
await mkdir("public/whatsapp-stickers", { recursive: true });
for (const [name, drawing] of Object.entries(drawings)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect x="64" y="60" width="384" height="384" rx="112" fill="white" stroke="#ebe7fa" stroke-width="10"/>${drawing}</svg>`;
  await writeFile(`public/whatsapp-stickers/${name}.svg`, svg + "\n");
  await sharp(Buffer.from(svg)).webp({ lossless: true }).toFile(`public/whatsapp-stickers/${name}.webp`);
}
