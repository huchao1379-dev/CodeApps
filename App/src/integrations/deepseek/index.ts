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
  extractAssigneeName,
  formatAssistantDataToolForPrompt,
  planAssistantDataQueryWithDeepSeek,
  resolveAssistantDataQuery,
  resolveAssistantDataQueryHeuristic,
  type AssistantDataPlan,
  type AssistantDataPlanBundle,
  type AssistantDataPlanIntent,
  type AssistantDataToolName,
  type AssistantDataToolResult,
} from './assistantDataTools'
export {
  askDeepSeekAssistant,
  looksLikeWebLookup,
  parseWorkOrderDraftWithDeepSeek,
  recommendDispatchAssignment,
  stripAssistantAttribution,
  type AssistantCitation,
  type AssistantIntent,
  type AssistantReply,
  type DispatchRecommendation,
} from './deepseekAssistantService'
