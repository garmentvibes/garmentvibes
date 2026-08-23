import { create } from "zustand";
import { persist } from "zustand/middleware";

import { SEED_QUESTIONS } from "@/lib/mock/question-data";
import type { ProductQuestion } from "@/types/questions";

// Pre-purchase questions and their staff answers.
//
// Becomes a `product_questions` table once Supabase is connected. The RLS
// shape it needs is already implied by visibleQuestions() in lib/questions.ts:
// answered rows readable by anyone, pending and rejected rows readable only by
// the person who asked, and writes to `answer`/`status` restricted to
// is_staff(). Keeping that rule in one pure function now means the policy and
// the UI cannot disagree later.

let counter = 0;
function nextId() {
  counter += 1;
  return `q_${Date.now().toString(36)}_${counter}`;
}

interface QuestionsState {
  questions: ProductQuestion[];
  ask: (input: {
    productId: string;
    askerName: string;
    askerEmail: string;
    body: string;
  }) => ProductQuestion;
  answer: (id: string, answer: string) => void;
  reject: (id: string, note: string) => void;
}

export const useQuestionsStore = create<QuestionsState>()(
  persist(
    (set) => ({
      questions: SEED_QUESTIONS,

      ask: (input) => {
        const question: ProductQuestion = {
          ...input,
          body: input.body.trim(),
          id: nextId(),
          // Never published on arrival — see the product decision at the top
          // of lib/questions.ts.
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ questions: [question, ...s.questions] }));
        return question;
      },

      answer: (id, answer) =>
        set((s) => ({
          questions: s.questions.map((q) =>
            q.id === id
              ? {
                  ...q,
                  status: "answered",
                  answer: answer.trim(),
                  answeredAt: new Date().toISOString(),
                  // An answered question is no longer a rejected one; leaving
                  // the note behind would show the asker both.
                  rejectionNote: undefined,
                }
              : q
          ),
        })),

      reject: (id, note) =>
        set((s) => ({
          questions: s.questions.map((q) =>
            q.id === id
              ? { ...q, status: "rejected", rejectionNote: note.trim(), answer: undefined }
              : q
          ),
        })),
    }),
    { name: "garmentvibes-questions", skipHydration: true }
  )
);
