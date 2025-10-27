export type FetchRetryOptions = {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryOnStatus?: number[];
  shouldRetry?: (response: Response, attempt: number) => boolean;
};

const DEFAULT_OPTIONS: Required<Omit<FetchRetryOptions, 'shouldRetry'>> = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  retryOnStatus: [408, 429, 500, 502, 503, 504],
};

/**
 * Creates a fetch-compatible function that retries failed requests.
 *
 * Retry behavior:
 * - Network errors (fetch throws): always retry
 * - Server errors (5xx) and rate limits (429): retry by default
 * - 4xx client errors (except 408, 429): no retry
 * - Successful responses (2xx-3xx): no retry
 *
 * Uses exponential backoff with jitter to avoid thundering herd.
 */
export function createFetchWithRetry(
  baseFetch: typeof fetch = fetch,
  options: FetchRetryOptions = {},
): typeof fetch {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const target = typeof window !== 'undefined' ? window : globalThis;
    const boundFetch = baseFetch.bind(target);

    let lastError: Error | undefined;
    let lastResponse: Response | undefined;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        const response = await boundFetch(input, init);

        // Check if we should retry based on status
        const shouldRetryStatus = opts.retryOnStatus.includes(response.status);
        const shouldRetryCustom = options.shouldRetry
          ? options.shouldRetry(response, attempt)
          : false;

        if (!shouldRetryStatus && !shouldRetryCustom) {
          // Success or non-retriable error
          return response;
        }

        // Store response for potential retry
        lastResponse = response;

        // Don't retry on the last attempt
        if (attempt === opts.maxRetries) {
          return response;
        }

        // Log retry attempt
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const delayMs = calculateDelay(attempt, opts);
        console.log(
          `[fetch-retry] Retrying ${init?.method || 'GET'} ${url} (attempt ${attempt + 1}/${opts.maxRetries}, status ${response.status}, delay ${delayMs}ms)`,
        );

        // Wait before retry with exponential backoff + jitter
        await delay(delayMs);
      } catch (err) {
        // Network error or fetch rejection
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry on the last attempt
        if (attempt === opts.maxRetries) {
          throw lastError;
        }

        // Log retry attempt
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const delayMs = calculateDelay(attempt, opts);
        console.log(
          `[fetch-retry] Retrying ${init?.method || 'GET'} ${url} (attempt ${attempt + 1}/${opts.maxRetries}, error: ${lastError.message}, delay ${delayMs}ms)`,
        );

        // Wait before retry with exponential backoff + jitter
        await delay(delayMs);
      }
    }

    // Should not reach here, but handle gracefully
    if (lastResponse) {
      return lastResponse;
    }
    throw lastError || new Error('Fetch failed after retries');
  };
}

function calculateDelay(
  attempt: number,
  opts: Required<Omit<FetchRetryOptions, 'shouldRetry'>>,
): number {
  const exponentialDelay =
    opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, opts.maxDelayMs);
  // Add jitter: randomize between 50% and 100% of the calculated delay
  const jitter = cappedDelay * (0.5 + Math.random() * 0.5);
  return Math.floor(jitter);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
