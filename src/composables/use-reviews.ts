import { inject, onScopeDispose, ref } from 'vue';
import type { Ref } from 'vue';
import { addReview as runAddReview } from '../app/add-review';
import type { AddReviewCommand } from '../app/add-review';
import { listReviews } from '../app/list-reviews';
import type { Review, ValidationIssue } from '../domain/review';
import { REVIEW_DEPS_KEY } from './reviews-key';

export type SubmitReviewOutcome =
  | { readonly status: 'success' }
  | { readonly status: 'invalid' }
  | { readonly status: 'failure' }
  | { readonly status: 'busy' };

export type UseReviews = {
  readonly reviews: Ref<readonly Review[]>;
  readonly totalCount: Ref<number>;
  readonly loading: Ref<boolean>;
  readonly adding: Ref<boolean>;
  readonly loadError: Ref<string | null>;
  readonly submitError: Ref<string | null>;
  readonly submitIssues: Ref<readonly ValidationIssue[]>;
  readonly fetchReviews: () => Promise<void>;
  readonly addReview: (
    command: AddReviewCommand,
  ) => Promise<SubmitReviewOutcome>;
  readonly clearSubmitFeedback: () => void;
};

export function useReviews(): UseReviews {
  const deps = inject(REVIEW_DEPS_KEY);
  if (!deps) throw new Error('Review dependencies were not provided');

  const reviews = ref<readonly Review[]>([]);
  const totalCount = ref(0);
  const loading = ref(false);
  const adding = ref(false);
  const loadError = ref<string | null>(null);
  const submitError = ref<string | null>(null);
  const submitIssues = ref<readonly ValidationIssue[]>([]);
  let activeLoad: AbortController | undefined;
  onScopeDispose(() => activeLoad?.abort());

  const fetchReviews = async (): Promise<void> => {
    if (loading.value) return;
    loading.value = true;
    loadError.value = null;
    const controller = new AbortController();
    activeLoad = controller;
    try {
      const result = await listReviews(deps, { signal: controller.signal });
      if (controller.signal.aborted) return;
      reviews.value = newestFirst(result.data.reviews);
      totalCount.value = result.data.totalCount;
    } catch {
      if (controller.signal.aborted) return;
      console.error('Review list request failed.');
      loadError.value = 'Reviews could not be loaded. Please try again.';
    } finally {
      activeLoad = undefined;
      loading.value = false;
    }
  };

  const addReview = async (
    command: AddReviewCommand,
  ): Promise<SubmitReviewOutcome> => {
    if (adding.value) return { status: 'busy' };

    adding.value = true;
    submitError.value = null;
    submitIssues.value = [];
    try {
      const result = await runAddReview(deps, command);
      if (!result.success) {
        submitIssues.value = result.issues;
        return { status: 'invalid' };
      }

      reviews.value = newestFirst([result.data, ...reviews.value]);
      totalCount.value = Math.max(totalCount.value + 1, reviews.value.length);
      return { status: 'success' };
    } catch {
      console.error('Review submission failed.');
      submitError.value =
        'We could not confirm whether your review was saved. Refresh the list before submitting again.';
      return { status: 'failure' };
    } finally {
      adding.value = false;
    }
  };

  const clearSubmitFeedback = (): void => {
    submitError.value = null;
    submitIssues.value = [];
  };

  return {
    reviews,
    totalCount,
    loading,
    adding,
    loadError,
    submitError,
    submitIssues,
    fetchReviews,
    addReview,
    clearSubmitFeedback,
  };
}

// Ordering is a display choice: the service contract itself promises no order.
// Modern JavaScript's stable sort preserves received order when timestamps tie.
function newestFirst(values: readonly Review[]): readonly Review[] {
  return [...values].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
}
