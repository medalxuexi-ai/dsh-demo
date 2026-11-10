export const PROVIDER_PRESETS = [
  {
    value: 'deepseek',
    label: 'DeepSeek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    hint: '官方 API，OpenAI 兼容',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    hint: '官方 API',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat',
    hint: '聚合多家模型',
  },
  {
    value: 'ollama',
    label: 'Ollama（本地）',
    name: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen2.5:7b',
    hint: '本地模型，API Key 可留空',
  },
  {
    value: 'lmstudio',
    label: 'LM Studio（本地）',
    name: 'LM Studio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    defaultModel: 'local-model',
    hint: '本地模型，API Key 可留空',
  },
  {
    value: 'custom',
    label: '自定义 / 中转站',
    name: '自定义服务',
    baseUrl: '',
    defaultModel: '',
    hint: '任何兼容 OpenAI /chat/completions 的服务',
  },
] as const;

const AVATAR_COLORS = ['#7c5cff', '#1677ff', '#00b96b', '#fa8c16', '#eb2f96', '#13c2c2'];

export function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}
