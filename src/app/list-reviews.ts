import type {
  ListReviewsOutput,
  ReviewDeps,
  ReviewRequestOptions,
} from './review-service';

export type ListReviewsResult = {
  readonly success: true;
  readonly data: ListReviewsOutput;
};

export async function listReviews(
  deps: ReviewDeps,
  options?: ReviewRequestOptions,
): Promise<ListReviewsResult> {
  const data = await deps.reviewService.listReviews(options);
  return { success: true, data };
}
