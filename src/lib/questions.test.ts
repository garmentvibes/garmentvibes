import { describe, expect, it } from "vitest";

import {
  MAX_ANSWER_LENGTH,
  MAX_QUESTION_LENGTH,
  MIN_QUESTION_LENGTH,
  pendingQuestions,
  publishedQuestions,
  validateAnswer,
  validateQuestion,
  visibleQuestions,
} from "./questions";
import type { ProductQuestion } from "@/types/questions";

function q(over: Partial<ProductQuestion> = {}): ProductQuestion {
  return {
    id: "q1",
    productId: "r1",
    askerName: "Asha",
    askerEmail: "asha@example.com",
    body: "Is the fabric see-through in daylight?",
    status: "answered",
    createdAt: "2026-08-01T10:00:00.000Z",
    answer: "It is lined, so no.",
    answeredAt: "2026-08-01T12:00:00.000Z",
    ...over,
  };
}

describe("validateQuestion", () => {
  it("accepts a real question", () => {
    expect(validateQuestion("Is this cotton or a blend?").ok).toBe(true);
  });

  it("rejects something too short to answer", () => {
    expect(validateQuestion("size?").ok).toBe(false);
    expect(validateQuestion("a".repeat(MIN_QUESTION_LENGTH - 1)).ok).toBe(false);
    expect(validateQuestion("a".repeat(MIN_QUESTION_LENGTH)).ok).toBe(true);
  });

  it("rejects an essay, and says how long it was", () => {
    const result = validateQuestion("a".repeat(MAX_QUESTION_LENGTH + 1));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(String(MAX_QUESTION_LENGTH + 1));
  });

  it("accepts one exactly at the limit", () => {
    expect(validateQuestion("a".repeat(MAX_QUESTION_LENGTH)).ok).toBe(true);
  });

  it("measures the trimmed length, not the padding", () => {
    expect(validateQuestion(`   ${"a".repeat(MAX_QUESTION_LENGTH)}   `).ok).toBe(true);
    expect(validateQuestion("   short   ").ok).toBe(false);
  });

  // A "question" with a link in it is an advert, and this is the cheapest
  // place to stop one — before it reaches a staff queue, never mind the page.
  it("rejects links in every shape spam uses", () => {
    for (const body of [
      "Great kurta, also see https://spam.example for deals",
      "check www.spam.example for cheaper",
      "buy from cheapkurtas.com instead of here",
      "visit dealsite.shop now for offers",
    ]) {
      expect(validateQuestion(body).ok, body).toBe(false);
    }
  });

  it("does not mistake ordinary punctuation for a link", () => {
    expect(validateQuestion("Is it pre-shrunk? I usually wash hot.").ok).toBe(true);
    expect(validateQuestion("Does the 2-3Y fit a tall 2 year old?").ok).toBe(true);
  });
});

describe("validateAnswer", () => {
  it("rejects an empty answer", () => {
    expect(validateAnswer("   ").ok).toBe(false);
  });

  it("allows a longer answer than a question", () => {
    expect(validateAnswer("a".repeat(MAX_QUESTION_LENGTH + 1)).ok).toBe(true);
    expect(validateAnswer("a".repeat(MAX_ANSWER_LENGTH + 1)).ok).toBe(false);
  });
});

describe("visibleQuestions", () => {
  const answered = q({ id: "a", status: "answered" });
  const pending = q({ id: "p", status: "pending", answer: undefined, answeredAt: undefined });
  const rejected = q({ id: "r", status: "rejected", answer: undefined, rejectionNote: "Spam" });
  const otherProduct = q({ id: "x", productId: "r99" });
  const all = [answered, pending, rejected, otherProduct];

  it("shows a stranger only answered questions", () => {
    expect(publishedQuestions(all, "r1").map((x) => x.id)).toEqual(["a"]);
  });

  // Hiding someone's own pending question makes the form look like it did
  // nothing.
  it("shows the asker their own pending and rejected questions", () => {
    const ids = visibleQuestions(all, "r1", "asha@example.com").map((x) => x.id);
    expect(ids).toContain("p");
    expect(ids).toContain("r");
  });

  it("does not show one customer another's pending question", () => {
    const ids = visibleQuestions(all, "r1", "someone@else.test").map((x) => x.id);
    expect(ids).toEqual(["a"]);
  });

  it("never leaks questions from another product", () => {
    for (const viewer of [undefined, "asha@example.com"]) {
      expect(visibleQuestions(all, "r1", viewer).map((x) => x.id)).not.toContain("x");
    }
  });

  it("puts answered questions first, then newest", () => {
    const older = q({ id: "old", status: "answered", createdAt: "2026-07-01T00:00:00.000Z" });
    const newer = q({ id: "new", status: "answered", createdAt: "2026-08-10T00:00:00.000Z" });
    const waiting = q({
      id: "wait",
      status: "pending",
      createdAt: "2026-08-20T00:00:00.000Z",
      answer: undefined,
    });

    const ids = visibleQuestions([older, waiting, newer], "r1", "asha@example.com").map(
      (x) => x.id
    );
    expect(ids).toEqual(["new", "old", "wait"]);
  });
});

describe("pendingQuestions", () => {
  it("queues the longest-waiting first", () => {
    const a = q({ id: "a", status: "pending", createdAt: "2026-08-05T00:00:00.000Z" });
    const b = q({ id: "b", status: "pending", createdAt: "2026-08-01T00:00:00.000Z" });
    expect(pendingQuestions([a, b]).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("ignores anything already dealt with", () => {
    expect(pendingQuestions([q({ status: "answered" }), q({ status: "rejected" })])).toHaveLength(0);
  });
});
