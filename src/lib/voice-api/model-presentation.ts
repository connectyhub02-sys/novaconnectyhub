// Display names only. Existing API IDs and billing/provider mappings stay stable.
const names: Record<string, string> = {
  eleven_multilingual_v2: 'Voz Multilíngue v2',
  eleven_flash_v2_5: 'Voz Rápida v2.5',
  eleven_flash_v2: 'Voz Rápida v2',
  eleven_turbo_v2_5: 'Voz Expressa v2.5',
  eleven_turbo_v2: 'Voz Expressa v2',
  eleven_v3: 'Voz Expressiva v3',
  instant_voice_clone: 'Clonagem de voz',
};

export function voiceModelName(id: string) {
  return names[id] ?? 'Modelo de voz';
}
