import {
  getDeepSeekApiKey,
  getDeepSeekBaseUrl,
  getDeepSeekModel,
} from './deepseekConfig'

export type DeepSeekChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type DeepSeekChatOptions = {
  messages: DeepSeekChatMessage[]
  temperature?: number
  responseFormat?: 'text' | 'json_object'
  signal?: AbortSignal
}

type DeepSeekChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
  error?: {
    message?: string
  }
}

export class DeepSeekConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeepSeekConfigError'
  }
}

export async function createDeepSeekChatCompletion(options: DeepSeekChatOptions): Promise<string> {
  const apiKey = getDeepSeekApiKey()
  if (!apiKey) {
    throw new DeepSeekConfigError('尚未配置 DeepSeek API Key。请在右下角助手设置中填写，或在 .env.local 设置 VITE_DEEPSEEK_API_KEY。')
  }

  const baseUrl = getDeepSeekBaseUrl().replace(/\/$/, '')
  const model = getDeepSeekModel()
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: options.signal,
    body: JSON.stringify({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      stream: false,
      ...(options.responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
    }),
  })

  let payload: DeepSeekChatCompletionResponse | null = null
  try {
    payload = await response.json() as DeepSeekChatCompletionResponse
  } catch {
    payload = null
  }

  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`
    throw new Error(`DeepSeek 调用失败：${detail}`)
  }

  const content = payload?.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('DeepSeek 未返回有效内容。')
  return content
}
