import { ZodError, type ZodType } from 'zod';
import { ApiError } from './errors.js';

export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error instanceof ZodError
      ? result.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ')
      : '请求参数不合法';
    throw new ApiError(400, 'INVALID_INPUT', message);
  }
  return result.data;
}
