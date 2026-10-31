import { browserHttpClient } from './http-request';
import type { HttpClient, HttpRequestExecutor } from './http-request';

export type RetryOptions = {
  readonly maxRetries?: number;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly attemptTimeoutMs?: number;
  readonly totalTimeoutMs?: number;
};

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_TIMER_MS = 2 ** 31 - 1;

/** GET retry policy for browser fetch; response consumption stays within deadlines. */
export function createRequestWithRetry(
  http: HttpClient = browserHttpClient,
  options: RetryOptions = {},
): HttpRequestExecutor {
  const policy = {
    maxRetries: options.maxRetries ?? 3,
    initialDelayMs: options.initialDelayMs ?? 200,
    maxDelayMs: options.maxDelayMs ?? 5000,
    attemptTimeoutMs: options.attemptTimeoutMs ?? 8000,
    totalTimeoutMs: options.totalTimeoutMs ?? 30000,
  };
  for (const [name, value] of Object.entries(policy)) {
    const minimum = name.includes('Timeout') ? 1 : 0;
    if (
      !Number.isSafeInteger(value) ||
      value < minimum ||
      value > MAX_TIMER_MS
    ) {
      throw new Error(`Invalid HTTP retry option: ${name}`);
    }
  }

  return async function request<T>(
    input: RequestInfo | URL,
    init: RequestInit,
    readResponse: (response: Response) => Promise<T>,
  ): Promise<T> {
    const original = input instanceof Request ? input : undefined;
    const method = (init.method ?? original?.method ?? 'GET').toUpperCase();
    const callerSignal =
      init.signal === undefined ? original?.signal : init.signal;
    callerSignal?.throwIfAborted();
    const total = abortScope(callerSignal, policy.totalTimeoutMs);

    try {
      for (let attempt = 0; ; attempt += 1) {
        total.signal.throwIfAborted();
        const current = abortScope(total.signal, policy.attemptTimeoutMs);
        let response: Response | undefined;
        let fetching = true;
        let retryAfterMs = 0;
        try {
          response = await abortable(
            () => http(input, { ...init, signal: current.signal }),
            current.signal,
          );
          fetching = false;
          if (
            method !== 'GET' ||
            !RETRYABLE_STATUSES.has(response.status) ||
            attempt >= policy.maxRetries
          ) {
            // Keep both timers alive through body reading, not just headers.
            return await abortable(
              () => readResponse(response!),
              current.signal,
            );
          }
          retryAfterMs = readRetryAfter(response);
          discard(response);
        } catch (error) {
          discard(response);
          total.signal.throwIfAborted();
          const timedOut = current.signal.aborted;
          const networkFailure = fetching && error instanceof TypeError;
          if (
            method !== 'GET' ||
            attempt >= policy.maxRetries ||
            (!timedOut && !networkFailure)
          ) {
            throw error;
          }
        } finally {
          current.dispose();
        }

        const cap = Math.min(
          policy.maxDelayMs,
          policy.initialDelayMs * 2 ** Math.min(attempt, 31),
        );
        const backoffMs = Math.floor(cap * (0.5 + Math.random() * 0.5));
        // Retry-After is a minimum; the total deadline can end the wait earlier.
        await wait(Math.max(backoffMs, retryAfterMs), total.signal);
      }
    } finally {
      total.dispose();
    }
  };
}

function readRetryAfter(response: Response): number {
  const value = response.headers.get('Retry-After')?.trim();
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Math.min(Number(value) * 1000, MAX_TIMER_MS);
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.min(Math.max(0, date - Date.now()), MAX_TIMER_MS)
    : 0;
}

function discard(response: Response | undefined): void {
  // A failed GET response is never used. Release its body before another attempt.
  if (response?.body && !response.body.locked)
    void response.body.cancel().catch(() => {});
}

function abortScope(parent: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', abort, { once: true });
  if (parent?.aborted) abort();
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException('HTTP request timed out', 'TimeoutError'),
      ),
    timeoutMs,
  );
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener('abort', abort);
    },
  };
}

function abortable<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
      return;
    }
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return operation();
      })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
