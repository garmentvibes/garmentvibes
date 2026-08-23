export type QuestionStatus = "pending" | "answered" | "rejected";

export interface ProductQuestion {
  id: string;
  productId: string;
  /** Display name of whoever asked. */
  askerName: string;
  /** Kept for notifying them when it is answered; never rendered publicly. */
  askerEmail: string;
  body: string;
  status: QuestionStatus;
  createdAt: string; // ISO
  /** Staff answer. Present exactly when status is "answered". */
  answer?: string;
  answeredAt?: string; // ISO
  /** Why it was rejected, shown to the asker only. */
  rejectionNote?: string;
}

export const QUESTION_STATUSES: QuestionStatus[] = ["pending", "answered", "rejected"];
