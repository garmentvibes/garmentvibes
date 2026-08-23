"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { MessageCircleQuestion, Clock, BadgeCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useSessionStore } from "@/lib/stores/session-store";
import { useQuestionsStore } from "@/lib/stores/questions-store";
import { MAX_QUESTION_LENGTH, validateQuestion, visibleQuestions } from "@/lib/questions";

/**
 * Pre-purchase questions, answered by staff.
 *
 * Only answered questions are public; the asker also sees their own pending
 * and rejected ones. The reasoning is in lib/questions.ts — briefly, a store
 * with no community yet cannot rely on other customers to answer, so
 * publishing immediately would build a visible wall of unanswered questions.
 */
export function ProductQuestions({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const mounted = useHasMounted();
  const user = useSessionStore((s) => s.user);
  const questions = useQuestionsStore((s) => s.questions);
  const ask = useQuestionsStore((s) => s.ask);

  const [asking, setAsking] = useState(false);
  const [body, setBody] = useState("");

  if (!mounted) return null;

  const signedIn = user?.role === "retail";
  const visible = visibleQuestions(questions, productId, user?.email);

  function submit(e: React.FormEvent) {
    e.preventDefault();

    const check = validateQuestion(body);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }

    ask({
      productId,
      askerName: user?.name ?? "Customer",
      askerEmail: user?.email ?? "",
      body,
    });

    toast.success("Question sent — we'll email you when it's answered");
    setBody("");
    setAsking(false);
  }

  return (
    <section className="mt-10 max-w-3xl" aria-labelledby="qa-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="qa-heading" className="flex items-center gap-2 text-xl font-bold text-neutral-900">
          <MessageCircleQuestion className="h-5 w-5 text-rose-600" />
          Questions &amp; Answers
        </h2>

        {!asking &&
          (signedIn ? (
            <Button variant="outline" size="sm" onClick={() => setAsking(true)}>
              Ask a question
            </Button>
          ) : (
            <Link href="/shop/login?redirect=/shop/product">
              <Button variant="outline" size="sm">
                Sign in to ask
              </Button>
            </Link>
          ))}
      </div>

      {asking && (
        <form onSubmit={submit} className="mb-6 space-y-3 rounded-lg border border-neutral-200 p-5">
          <div>
            <Label htmlFor="question-body">Your question about {productName}</Label>
            <textarea
              id="question-body"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={MAX_QUESTION_LENGTH}
              placeholder="Fabric, fit, care, what's included — anything the description doesn't cover."
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
            />
            <p className="mt-1 text-xs text-neutral-400">
              {body.trim().length}/{MAX_QUESTION_LENGTH} · answered by our team, usually within a
              day. It appears here once answered.
            </p>
          </div>

          <div className="flex gap-2">
            <Button type="submit" variant="retail" size="sm">
              Send question
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No questions about this one yet. If something isn&apos;t clear, ask — the answer helps
          the next person too.
        </p>
      ) : (
        <ul className="space-y-4">
          {visible.map((question) => (
            <li key={question.id} className="rounded-lg border border-neutral-200 p-4">
              <p className="text-sm font-medium text-neutral-900">Q: {question.body}</p>

              {question.status === "answered" && (
                <div className="mt-2 border-l-2 border-rose-200 pl-3">
                  <p className="flex items-center gap-1 text-xs font-medium text-rose-700">
                    <BadgeCheck className="h-3.5 w-3.5" /> GarmentVibes
                  </p>
                  <p className="mt-0.5 text-sm text-neutral-700">{question.answer}</p>
                </div>
              )}

              {/* Pending and rejected are only ever rendered for the person
                  who asked — visibleQuestions() filters them out for everyone
                  else, so this branch is invisible to other customers. */}
              {question.status === "pending" && (
                <p className="mt-2 flex items-center gap-1 text-xs text-neutral-500">
                  <Clock className="h-3.5 w-3.5" /> Waiting for an answer — only you can see this.
                </p>
              )}

              {question.status === "rejected" && (
                <p className="mt-2 flex items-center gap-1 text-xs text-neutral-500">
                  <XCircle className="h-3.5 w-3.5" /> We couldn&apos;t publish this
                  {question.rejectionNote ? `: ${question.rejectionNote}` : "."}
                </p>
              )}

              <p className="mt-2 text-xs text-neutral-400">
                {question.askerName} · {question.createdAt.slice(0, 10)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
