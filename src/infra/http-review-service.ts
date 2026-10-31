import type {
  AddReviewServiceResult,
  ListReviewsOutput,
  ReviewService,
  ReviewRequestOptions,
} from '../app/review-service';
import type { HttpRequestExecutor } from './http-request';
import { createReview } from '../domain/review';
import type { Review, ReviewContent, ValidationIssue } from '../domain/review';

type AddReviewRequestDto = {
  readonly rating: number;
  readonly title: string;
  readonly comment: string;
};

export type HttpReviewServiceOptions = {
  readonly baseUrl: string;
  readonly request: HttpRequestExecutor;
  readonly headers?: Readonly<Record<string, string>>;
};

export class HttpReviewService implements ReviewService {
  private readonly baseUrl: string;
  private readonly request: HttpRequestExecutor;
  private readonly headers: Readonly<Record<string, string>>;

  constructor(options: HttpReviewServiceOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.request = options.request;
    this.headers = { ...(options.headers ?? {}) };
  }

  async listReviews(
    options: ReviewRequestOptions = {},
  ): Promise<ListReviewsOutput> {
    return this.request(
      `${this.baseUrl}/reviews`,
      {
        method: 'GET',
        signal: options.signal,
        headers: this.mergeHeaders({ Accept: 'application/json' }),
      },
      async (response) => {
        if (!response.ok) throw unexpectedStatus('list', response.status);
        return decodeListResponse(await parseJson(response));
      },
    );
  }

  async addReview(input: ReviewContent): Promise<AddReviewServiceResult> {
    return this.request(
      `${this.baseUrl}/reviews`,
      {
        method: 'POST',
        headers: this.mergeHeaders({
          Accept: 'application/json',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(toAddReviewRequestDto(input)),
      },
      async (response) => {
        const body = await parseJson(response);
        if (response.status === 400) {
          const issues = decodeValidationIssues(body);
          if (issues) return { success: false, issues };
          throw new Error('Review API returned an invalid validation response');
        }

        if (!response.ok) throw unexpectedStatus('add', response.status);
        return { success: true, data: decodeAddResponse(body) };
      },
    );
  }

  private mergeHeaders(
    extra: Readonly<Record<string, string>>,
  ): Record<string, string> {
    return { ...this.headers, ...extra };
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    throw new Error('Review API returned an empty response');
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Review API returned invalid JSON');
  }
}

function decodeListResponse(body: unknown): ListReviewsOutput {
  if (!isRecord(body) || !Array.isArray(body.reviews)) {
    throw new Error('Review API returned an invalid list envelope');
  }
  if (
    typeof body.totalCount !== 'number' ||
    !Number.isSafeInteger(body.totalCount) ||
    body.totalCount < 0
  ) {
    throw new Error('Review API returned an invalid review count');
  }

  const reviews = body.reviews.map(decodeReview);
  if (body.totalCount !== reviews.length) {
    throw new Error('Review API returned an inconsistent review count');
  }

  return { reviews, totalCount: body.totalCount };
}

function decodeAddResponse(body: unknown): Review {
  if (!isRecord(body) || !('review' in body)) {
    throw new Error('Review API returned an invalid add envelope');
  }
  return decodeReview(body.review);
}

function decodeReview(value: unknown): Review {
  if (!isRecord(value)) {
    throw new Error('Review API returned an invalid review record');
  }

  const createdAt = parseIsoDate(value.createdAt);
  const result = createReview({
    id: value.id,
    rating: value.rating,
    title: value.title,
    comment: value.comment,
    createdAt,
  });

  if (!result.success) {
    throw new Error('Review API returned invalid review fields');
  }
  return result.data;
}

function parseIsoDate(value: unknown): Date {
  if (typeof value !== 'string') return new Date(Number.NaN);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    return new Date(Number.NaN);
  }
  return date;
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('HTTP review service requires an absolute base URL');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('HTTP review service received an invalid base URL');
  }

  const pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/api')) {
    throw new Error('HTTP review service base URL must end with /api');
  }
  url.pathname = pathname;
  return url.toString().replace(/\/$/, '');
}

function decodeValidationIssues(
  body: unknown,
): readonly ValidationIssue[] | null {
  if (
    !isRecord(body) ||
    !Array.isArray(body.issues) ||
    body.issues.length === 0
  ) {
    return null;
  }

  const issues: ValidationIssue[] = [];
  for (const issue of body.issues) {
    if (
      !isRecord(issue) ||
      typeof issue.field !== 'string' ||
      typeof issue.message !== 'string' ||
      issue.message.trim().length === 0
    ) {
      return null;
    }

    const message = safeIssueMessage(issue.field);
    if (!message) return null;
    issues.push({ field: issue.field, message });
  }
  return issues;
}

function safeIssueMessage(field: string): string | null {
  switch (field) {
    case 'rating':
      return 'Rating must be an integer between 1 and 5';
    case 'title':
      return 'Title is required and must be no more than 200 characters';
    case 'comment':
      return 'Comment is required and must be no more than 5000 characters';
    case 'body':
      return 'Check the review details and try again';
    default:
      return null;
  }
}

function toAddReviewRequestDto(input: ReviewContent): AddReviewRequestDto {
  return {
    rating: input.rating,
    title: input.title,
    comment: input.comment,
  };
}

function unexpectedStatus(operation: 'list' | 'add', status: number): Error {
  return new Error(
    `Review API ${operation} request failed with status ${status}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
