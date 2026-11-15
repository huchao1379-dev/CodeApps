import { getDeepSeekApiKey, getDeepSeekBaseUrl } from './deepseekConfig'
import { DeepSeekConfigError } from './deepseekClient'

export type DeepSeekSearchResult = {
  rerankScore: number
  title: string
  url: string
  snippet: string
  summary: string
  content: string
  siteName: string | null
  siteIcon: string | null
  date: string | null
  authority: number
}

export type DeepSeekSearchOptions = {
  query: string
  count?: number
  oriQuestion?: string | null
  localization?: string
  needContent?: boolean
  signal?: AbortSignal
}

export type DeepSeekFetchPage = {
  title: string
  content: string
  url: string
}

export type DeepSeekFetchOptions = {
  url: string
  signal?: AbortSignal
}

type ApiErrorBody = {
  error?: {
    message?: string
  }
}

type RawSearchResponse = {
  results?: Array<{
    rerank_score?: number
    title?: string
    url?: string
    snippet?: string
    summary?: string
    content?: string
    site_name?: string | null
    site_icon?: string | null
    date?: string | null
    authority?: number
  }>
}

type RawFetchResponse = {
  title?: string
  content?: string
}

function requireApiKey(): string {
  const apiKey = getDeepSeekApiKey()
  if (!apiKey) {
    throw new DeepSeekConfigError('尚未配置 DeepSeek API Key。请在右下角助手设置中填写，或在 .env.local 设置 VITE_DEEPSEEK_API_KEY。')
  }
  return apiKey
}

function toolsBaseUrl(): string {
  return getDeepSeekBaseUrl().replace(/\/$/, '')
}

async function postToolsJson<T>(
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${toolsBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${requireApiKey()}`,
    },
    signal,
    body: JSON.stringify(body),
  })

  let payload: (T & ApiErrorBody) | null = null
  try {
    payload = await response.json() as T & ApiErrorBody
  } catch {
    payload = null
  }

  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`
    throw new Error(`DeepSeek ${path} 调用失败：${detail}`)
  }

  if (!payload) throw new Error(`DeepSeek ${path} 未返回有效 JSON。`)
  return payload
}

function clampQuery(value: string, max = 128): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('搜索词不能为空。')
  return Array.from(trimmed).slice(0, max).join('')
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('抓取 URL 不能为空。')
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('抓取 URL 格式无效。')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('抓取 URL 仅支持 http/https。')
  }
  if (parsed.username || parsed.password) {
    throw new Error('抓取 URL 不能包含用户名或密码。')
  }
  if (!parsed.host) throw new Error('抓取 URL 缺少 host。')
  if (trimmed.length > 8192) throw new Error('抓取 URL 过长。')
  return trimmed
}

export async function deepSeekSearch(options: DeepSeekSearchOptions): Promise<DeepSeekSearchResult[]> {
  const query = clampQuery(options.query)
  const count = Math.min(50, Math.max(1, options.count ?? 10))
  const body: Record<string, unknown> = {
    query,
    count,
    need_content: options.needContent ?? false,
  }
  if (options.oriQuestion != null && options.oriQuestion.trim()) {
    body.ori_question = clampQuery(options.oriQuestion)
  }
  if (options.localization?.trim()) {
    body.localization = options.localization.trim()
  }

  const payload = await postToolsJson<RawSearchResponse>('/v1/tools/search', body, options.signal)
  return (payload.results ?? []).map((item) => ({
    rerankScore: typeof item.rerank_score === 'number' ? item.rerank_score : 0,
    title: item.title?.trim() || 'Untitled',
    url: item.url?.trim() || '',
    snippet: item.snippet?.trim() || '',
    summary: item.summary?.trim() || '',
    content: item.content?.trim() || '',
    siteName: item.site_name ?? null,
    siteIcon: item.site_icon ?? null,
    date: item.date ?? null,
    authority: typeof item.authority === 'number' ? item.authority : -1,
  })).filter((item) => item.url)
}

export async function deepSeekFetch(options: DeepSeekFetchOptions): Promise<DeepSeekFetchPage> {
  const url = normalizeUrl(options.url)
  const payload = await postToolsJson<RawFetchResponse>('/v1/tools/fetch', { url }, options.signal)
  const content = payload.content?.trim() || ''
  if (!content) throw new Error('DeepSeek Fetch 未返回可用正文。')
  return {
    url,
    title: payload.title?.trim() || url,
    content,
  }
}

/** Extract http(s) URLs from free text for Fetch. */
export function extractHttpUrls(text: string, limit = 2): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"'）】\]]+/gi) ?? []
  const cleaned = matches
    .map((item) => item.replace(/[.,;:!?，。；：！？]+$/g, ''))
    .filter((item) => {
      try {
        normalizeUrl(item)
        return true
      } catch {
        return false
      }
    })
  return [...new Set(cleaned)].slice(0, Math.max(1, limit))
}

export function formatSearchEvidenceForPrompt(results: DeepSeekSearchResult[]): string {
  if (results.length === 0) return '（搜索无结果）'
  return results.map((item, index) => {
    const body = item.content || item.summary || item.snippet || '无摘要'
    const meta = [
      item.siteName ? `站点 ${item.siteName}` : null,
      item.date ? `日期 ${item.date}` : null,
      `相关分 ${item.rerankScore}`,
    ].filter(Boolean).join(' · ')
    return `[${index + 1}] ${item.title}\nURL: ${item.url}\n${meta}\n${body}`
  }).join('\n\n')
}

export function formatFetchEvidenceForPrompt(pages: DeepSeekFetchPage[]): string {
  if (pages.length === 0) return '（未抓取到页面）'
  return pages.map((page, index) => {
    const clipped = Array.from(page.content).slice(0, 6000).join('')
    return `[页面 ${index + 1}] ${page.title}\nURL: ${page.url}\n${clipped}`
  }).join('\n\n')
}
