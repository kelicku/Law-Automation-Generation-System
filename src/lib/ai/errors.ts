export type AiErrorCode = "AI_LIMIT" | "AI_PROVIDER_ERROR" | "AI_INVALID_OUTPUT" | "AI_DUPLICATE_JOB" | "AI_REFUSED" | "AI_RATE_LIMITED";

const STATUS: Record<AiErrorCode, number> = {
  AI_LIMIT: 429,
  AI_PROVIDER_ERROR: 502,
  AI_INVALID_OUTPUT: 502,
  AI_DUPLICATE_JOB: 409,
  AI_REFUSED: 422,
  AI_RATE_LIMITED: 429,
};

export class AiError extends Error {
  status: number;
  constructor(public code: AiErrorCode, message: string, public logId?: string, public retryable = true) {
    super(message);
    this.status = STATUS[code];
  }
}
