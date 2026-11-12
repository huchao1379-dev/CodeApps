const RUNTIME_KEY_STORAGE = 'opsdesk.deepseek.apiKey'
const RUNTIME_BASE_STORAGE = 'opsdesk.deepseek.baseUrl'
const RUNTIME_MODEL_STORAGE = 'opsdesk.deepseek.model'

export const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com'
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat'

function readStorage(key: string): string {
  try {
    return globalThis.sessionStorage?.getItem(key)?.trim() ?? ''
  } catch {
    return ''
  }
}

function writeStorage(key: string, value: string) {
  try {
    if (!value.trim()) globalThis.sessionStorage?.removeItem(key)
    else globalThis.sessionStorage?.setItem(key, value.trim())
  } catch {
    // Ignore storage failures in restricted hosts.
  }
}

/** Prefer runtime paste (session) so you can fill the key without rebuild; falls back to Vite env. */
export function getDeepSeekApiKey(): string {
  return readStorage(RUNTIME_KEY_STORAGE) || (import.meta.env.VITE_DEEPSEEK_API_KEY?.trim() ?? '')
}

export function getDeepSeekBaseUrl(): string {
  return readStorage(RUNTIME_BASE_STORAGE)
    || (import.meta.env.VITE_DEEPSEEK_BASE_URL?.trim() ?? DEEPSEEK_DEFAULT_BASE_URL)
}

export function getDeepSeekModel(): string {
  return readStorage(RUNTIME_MODEL_STORAGE)
    || (import.meta.env.VITE_DEEPSEEK_MODEL?.trim() ?? DEEPSEEK_DEFAULT_MODEL)
}

export function setDeepSeekRuntimeConfig(input: {
  apiKey?: string
  baseUrl?: string
  model?: string
}) {
  if (input.apiKey !== undefined) writeStorage(RUNTIME_KEY_STORAGE, input.apiKey)
  if (input.baseUrl !== undefined) writeStorage(RUNTIME_BASE_STORAGE, input.baseUrl)
  if (input.model !== undefined) writeStorage(RUNTIME_MODEL_STORAGE, input.model)
}

export function hasDeepSeekApiKey(): boolean {
  return Boolean(getDeepSeekApiKey())
}

export function getDeepSeekConfigSnapshot() {
  return {
    apiKeyConfigured: hasDeepSeekApiKey(),
    apiKeyMasked: maskApiKey(getDeepSeekApiKey()),
    baseUrl: getDeepSeekBaseUrl(),
    model: getDeepSeekModel(),
  }
}

function maskApiKey(apiKey: string): string {
  if (!apiKey) return ''
  if (apiKey.length <= 8) return '********'
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`
}
