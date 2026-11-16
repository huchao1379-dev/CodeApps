export {
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  getDeepSeekApiKey,
  getDeepSeekBaseUrl,
  getDeepSeekConfigSnapshot,
  getDeepSeekModel,
  hasDeepSeekApiKey,
  setDeepSeekRuntimeConfig,
} from './deepseekConfig'
export {
  createDeepSeekChatCompletion,
  DeepSeekConfigError,
  type DeepSeekChatMessage,
  type DeepSeekChatOptions,
} from './deepseekClient'
export {
  deepSeekFetch,
  deepSeekSearch,
  extractHttpUrls,
  formatFetchEvidenceForPrompt,
  formatSearchEvidenceForPrompt,
  type DeepSeekFetchOptions,
  type DeepSeekFetchPage,
  type DeepSeekSearchOptions,
  type DeepSeekSearchResult,
} from './deepseekToolsClient'
export {
  formatAssistantQuerySourceLabel,
  runAssistantQueryPipeline,
  type AssistantQueryMeta,
  type AssistantQueryPermissions,
  type AssistantQueryPipelineResult,
  type AssistantQuerySource,
} from './assistantQueryPipeline'
export {
  askDeepSeekAssistant,
  looksLikeAvailabilityUpdate,
  parseEmployeeAvailabilityDraft,
  parseWorkOrderDraftWithDeepSeek,
  recommendDispatchAssignment,
  stripAssistantAttribution,
  type AiEmployeeAvailabilityDraft,
  type AssistantCitation,
  type AssistantIntent,
  type AssistantReply,
  type DispatchRecommendation,
} from './deepseekAssistantService'
