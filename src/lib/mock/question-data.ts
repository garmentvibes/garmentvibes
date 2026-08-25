import type { ProductQuestion } from "@/types/questions";

// A handful of answered questions so product pages are not empty, plus one
// waiting in the staff queue so the admin view has something to act on.
//
// Placeholder content, like the reviews. Deliberately NOT in
// supabase/seed.sql, which carries the catalogue only — fabricated customer
// questions in a real database are invented conversations with no honest way
// to mark a row as "nobody actually asked this".
//
// Answers are written the way real ones should be: specific, and willing to
// say something unflattering. "It runs slightly short" is more useful than
// "great fit!" and is the reason anyone reads this section.
export const SEED_QUESTIONS: ProductQuestion[] = [
  {
    id: "q_seed_1",
    productId: "classic-crew-neck-tee", // Classic Crew Neck T-Shirt
    askerName: "Rahul M.",
    askerEmail: "rahul.seed@example.com",
    body: "Does this shrink after the first wash?",
    status: "answered",
    createdAt: "2026-08-04T09:12:00.000Z",
    answer:
      "It is pre-shrunk cotton, so expect under 2% — about half a centimetre on the length. Wash cold and dry in shade to keep it there.",
    answeredAt: "2026-08-04T14:40:00.000Z",
  },
  {
    id: "q_seed_2",
    productId: "classic-crew-neck-tee",
    askerName: "Sneha P.",
    askerEmail: "sneha.seed@example.com",
    body: "Is the fabric thick enough to not be see-through in white?",
    status: "answered",
    createdAt: "2026-08-09T18:02:00.000Z",
    answer:
      "It is 180 GSM, which is mid-weight. The white is fine over a light top but is not fully opaque against strong backlight.",
    answeredAt: "2026-08-10T10:15:00.000Z",
  },
  {
    id: "q_seed_3",
    productId: "floral-anarkali-kurta", // Floral Anarkali Kurta
    askerName: "Divya K.",
    askerEmail: "divya.seed@example.com",
    body: "What is the length from shoulder to hem in size M?",
    status: "answered",
    createdAt: "2026-08-11T11:30:00.000Z",
    answer:
      "48 inches in M. It runs slightly long, so if you are under 5'3\" you may want it shortened.",
    answeredAt: "2026-08-11T16:05:00.000Z",
  },
  {
    id: "q_seed_4",
    productId: "banarasi-silk-saree", // Banarasi Silk Blend Saree
    askerName: "Meera T.",
    askerEmail: "meera.seed@example.com",
    body: "Does this come with an unstitched blouse piece, and what is its length?",
    status: "pending",
    createdAt: "2026-08-20T08:45:00.000Z",
  },
];
