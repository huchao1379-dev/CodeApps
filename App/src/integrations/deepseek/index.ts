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
  askDeepSeekAssistant,
  parseWorkOrderDraftWithDeepSeek,
  type AssistantIntent,
  type AssistantReply,
} from './deepseekAssistantService'
