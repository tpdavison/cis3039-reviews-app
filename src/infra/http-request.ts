/** Browser fetch capability, independent of any service's HTTP contract. */
export type HttpClient = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/** Consume the response inside the executor so its deadlines can cover the body. */
export type HttpRequestExecutor = <T>(
  input: RequestInfo | URL,
  init: RequestInit,
  readResponse: (response: Response) => Promise<T>,
) => Promise<T>;

export const browserHttpClient: HttpClient = (input, init) =>
  fetch(input, init);

/** A single fetch attempt, with caller cancellation and no retry/deadline policy. */
export function createHttpRequest(
  http: HttpClient = browserHttpClient,
): HttpRequestExecutor {
  return async (input, init, readResponse) => {
    const response = await http(input, init);
    try {
      return await readResponse(response);
    } finally {
      if (response.body && !response.body.locked)
        void response.body.cancel().catch(() => {});
    }
  };
}
