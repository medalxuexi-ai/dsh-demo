import type { NormalizedError } from '@roleplay/core';

function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === 'string') return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
  } catch {
    // fall through to raw body
  }
  return body.replace(/\s+/g, ' ').trim().slice(0, 300) || '上游服务返回了空错误';
}

export function normalizeHttpError(status: number, body: string): NormalizedError {
  const message = extractMessage(body);
  if (status === 401 || status === 403) {
    return { code: 'PROVIDER_AUTH', status, message: `密钥或权限无效：${message}`, retryable: false };
  }
  if (status === 429) {
    return { code: 'PROVIDER_RATE_LIMITED', status, message: `上游限流或额度不足：${message}`, retryable: true };
  }
  if (status === 400 && /context|length|token|too long|maximum/i.test(message)) {
    return { code: 'CONTEXT_LENGTH_EXCEEDED', status, message: `上下文超出模型限制：${message}`, retryable: false };
  }
  if (status === 404) {
    return { code: 'PROVIDER_UNAVAILABLE', status, message: `接口或模型不存在：${message}`, retryable: false };
  }
  if (status >= 500) {
    return { code: 'PROVIDER_UNAVAILABLE', status, message: `上游服务异常：${message}`, retryable: true };
  }
  return { code: 'UNKNOWN', status, message: `请求失败（${status}）：${message}`, retryable: false };
}

export function normalizeThrown(error: unknown, signal?: AbortSignal): NormalizedError {
  if (signal?.aborted) {
    return { code: 'CANCELLED', message: '生成已取消', retryable: false };
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return { code: 'PROVIDER_UNAVAILABLE', message: '连接模型服务超时', retryable: true };
  }
  if (error instanceof Error && /abort/i.test(error.name)) {
    return { code: 'CANCELLED', message: '生成已取消', retryable: false };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: 'PROVIDER_UNAVAILABLE', message: `无法连接模型服务：${message}`, retryable: true };
}
