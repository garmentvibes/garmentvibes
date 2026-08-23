import type { ProductQuestion } from "@/types/questions";

// ---------------------------------------------------------------------------
// Product Q&A.
//
// Pre-purchase questions, answered by staff. Distinct from reviews: a review
// is a verdict from someone who already bought, a question is from someone
// deciding whether to.
//
// PRODUCT DECISION, worth knowing before changing it: a question is only
// published once it has been answered. Amazon and Flipkart show unanswered
// questions publicly and let other customers answer them, which works because
// they have a community large enough that someone usually does.
//
// A single-seller store starting out has no such community. Publishing
// immediately would put a growing wall of unanswered questions on the product
// page — which advertises that nobody replies — and would open an unmoderated
// free-text field on a public page, which is a spam surface with no upside.
// So the asker sees their own pending question, and everyone else sees only
// answered ones.
//
// Revisit this if the store ever has enough buyers that they would answer each
// other.
// ---------------------------------------------------------------------------

/** Long enough to be a question, short enough to stay a question. */
export const MIN_QUESTION_LENGTH = 10;
export const MAX_QUESTION_LENGTH = 500;
export const MAX_ANSWER_LENGTH = 1000;

export interface QuestionValidation {
  ok: boolean;
  error?: string;
}

export function validateQuestion(body: string): QuestionValidation {
  const trimmed = body.trim();

  if (trimmed.length < MIN_QUESTION_LENGTH) {
    return { ok: false, error: "Please write a bit more so we can answer properly" };
  }
  if (trimmed.length > MAX_QUESTION_LENGTH) {
    return {
      ok: false,
      error: `Questions are limited to ${MAX_QUESTION_LENGTH} characters — this is ${trimmed.length}`,
    };
  }

  // A "question" with a link in it is an advert. There is no legitimate reason
  // to include a URL when asking about a garment, and this is the cheapest
  // place to stop it: before it reaches a staff queue, never mind the page.
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|in|org|shop)\b/i.test(trimmed)) {
    return { ok: false, error: "Questions can't contain links" };
  }

  return { ok: true };
}

export function validateAnswer(body: string): QuestionValidation {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, error: "Write an answer first" };
  if (trimmed.length > MAX_ANSWER_LENGTH) {
    return { ok: false, error: `Answers are limited to ${MAX_ANSWER_LENGTH} characters` };
  }
  return { ok: true };
}

/**
 * What a given viewer may see on a product page.
 *
 * `viewerEmail` is how the asker gets their own pending question back — they
 * asked it, so hiding it from them would look like the form did nothing.
 * Rejected questions are visible to their asker too, with the reason, rather
 * than vanishing silently.
 */
export function visibleQuestions(
  questions: ProductQuestion[],
  productId: string,
  viewerEmail?: string
): ProductQuestion[] {
  return questions
    .filter((q) => q.productId === productId)
    .filter((q) => {
      if (q.status === "answered") return true;
      return Boolean(viewerEmail) && q.askerEmail === viewerEmail;
    })
    .sort((a, b) => {
      // Answered first — they are the ones with information in them. Within a
      // group, newest first.
      if (a.status !== b.status) return a.status === "answered" ? -1 : 1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
}

/** Answered questions only — what a signed-out visitor sees. */
export function publishedQuestions(questions: ProductQuestion[], productId: string) {
  return visibleQuestions(questions, productId, undefined);
}

/** The staff queue: oldest first, because the oldest has waited longest. */
export function pendingQuestions(questions: ProductQuestion[]): ProductQuestion[] {
  return questions
    .filter((q) => q.status === "pending")
    .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
}
