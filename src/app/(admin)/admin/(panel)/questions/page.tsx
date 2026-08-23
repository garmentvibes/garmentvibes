"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MessageCircleQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useQuestionsStore } from "@/lib/stores/questions-store";
import { notify } from "@/lib/stores/notification-store";
import { getRetailProductById } from "@/lib/mock/retail-products";
import { MAX_ANSWER_LENGTH, pendingQuestions, validateAnswer } from "@/lib/questions";

export default function AdminQuestionsPage() {
  const mounted = useHasMounted();
  const questions = useQuestionsStore((s) => s.questions);
  const answer = useQuestionsStore((s) => s.answer);
  const reject = useQuestionsStore((s) => s.reject);

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (!mounted) return null;

  const queue = pendingQuestions(questions);
  const answered = questions.filter((q) => q.status === "answered");

  function submitAnswer(id: string) {
    const draft = drafts[id] ?? "";
    const check = validateAnswer(draft);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }

    const question = questions.find((q) => q.id === id);
    answer(id, draft);
    setDrafts((current) => ({ ...current, [id]: "" }));

    // They asked a direct question; the answer appearing on a page they may
    // never revisit is not a reply. This is transactional, not marketing.
    if (question) {
      notify({
        templateId: "question_answered",
        recipientName: question.askerName,
        email: question.askerEmail,
        relatedTo: question.productId,
        vars: {
          name: question.askerName,
          productName: getRetailProductById(question.productId)?.name,
          question: question.body,
          answer: draft.trim(),
        },
      });
    }

    toast.success("Answered — it's now on the product page, and the customer has been emailed");
  }

  return (
    <div className="max-w-3xl">
      <h1 className="flex items-center gap-2 text-xl font-bold text-neutral-900">
        <MessageCircleQuestion className="h-5 w-5" /> Product Questions
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Questions stay private until they are answered, so this queue is the only thing standing
        between a customer and a reply.
      </p>

      <h2 className="mt-6 font-semibold text-neutral-900">
        Awaiting an answer{" "}
        <Badge variant="outline">{queue.length}</Badge>
      </h2>

      {queue.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">Nothing waiting.</p>
      ) : (
        <ul id="question-queue" className="mt-3 space-y-3">
          {queue.map((question) => {
            const product = getRetailProductById(question.productId);
            return (
              <li key={question.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <p className="text-xs text-neutral-400">
                  {product?.name ?? question.productId} · {question.askerName} ·{" "}
                  {question.createdAt.slice(0, 10)}
                </p>
                <p className="mt-1 text-sm font-medium text-neutral-900">{question.body}</p>

                <textarea
                  aria-label={`Answer for ${question.id}`}
                  rows={3}
                  maxLength={MAX_ANSWER_LENGTH}
                  value={drafts[question.id] ?? ""}
                  onChange={(e) =>
                    setDrafts((current) => ({ ...current, [question.id]: e.target.value }))
                  }
                  placeholder="Be specific, and say the unflattering thing if it is true — that is what makes this section worth reading."
                  className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                />

                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => submitAnswer(question.id)}>
                    Publish answer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      reject(question.id, "Not about this product");
                      toast.success("Rejected — the customer sees the reason, nobody else does");
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-8 font-semibold text-neutral-900">
        Published <Badge variant="outline">{answered.length}</Badge>
      </h2>
      <ul className="mt-3 space-y-2">
        {answered.map((question) => (
          <li key={question.id} className="rounded-md border border-neutral-200 bg-white p-3">
            <p className="text-xs text-neutral-400">
              {getRetailProductById(question.productId)?.name ?? question.productId}
            </p>
            <p className="mt-0.5 text-sm text-neutral-800">Q: {question.body}</p>
            <p className="mt-0.5 text-sm text-neutral-600">A: {question.answer}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
