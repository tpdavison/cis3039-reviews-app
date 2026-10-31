import type { Review, ReviewContent, ValidationIssue } from '../domain/review';

export type ReviewDeps = {
  readonly reviewService: ReviewService;
};

export type ReviewRequestOptions = {
  readonly signal?: AbortSignal;
};

export type ListReviewsOutput = {
  readonly reviews: readonly Review[];
  readonly totalCount: number;
};

export type AddReviewServiceResult =
  | { readonly success: true; readonly data: Review }
  | { readonly success: false; readonly issues: readonly ValidationIssue[] };

export interface ReviewService {
  listReviews(options?: ReviewRequestOptions): Promise<ListReviewsOutput>;
  addReview(input: ReviewContent): Promise<AddReviewServiceResult>;
}
