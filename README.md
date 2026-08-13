# GarmentVibes

A dual-mode clothing marketplace: a retail storefront (Myntra/Flipkart-style) and a
B2B wholesale portal, in one Next.js app, installable as a PWA on phones and tablets.

## Stack

- **Framework**: Next.js (App Router) + TypeScript + Tailwind CSS v4
- **Backend**: Supabase (Postgres, Auth, Storage, RLS)
- **Payments**: Razorpay (India, INR-only for now)
- **Hosting**: Vercel, custom domain via Hostinger DNS
- **UI**: hand-rolled components (`src/components/ui`) using `class-variance-authority` + Tailwind

## Structure

```
src/
  app/
    page.tsx                    # landing chooser: Retail vs Wholesale
    (retail)/shop/...            # retail storefront route group
    (wholesale)/wholesale/...    # B2B portal route group
  components/
    ui/                          # base UI primitives
    retail/, wholesale/          # mode-specific header/footer/cards
  lib/
    supabase/                    # browser/server/proxy Supabase clients
    mock/                        # placeholder catalog data (pre-Supabase)
    stores/                      # zustand: cart, wholesale order, mock session
    utils.ts
  types/catalog.ts               # retail + wholesale product types
  proxy.ts                       # Supabase session refresh (Next.js 16 "Proxy")
supabase/migrations/             # SQL schema, ready to apply once the project exists
```

### Current state

The retail storefront and wholesale portal are built against **mock catalog
data** (`src/lib/mock/`) with a placeholder client-side session
(`src/lib/stores/session-store.ts`) standing in for Supabase Auth, and a
stubbed checkout (no real payment charge yet). This lets the whole app run
and be clicked through with `npm run dev` even before a live Supabase
project/Razorpay are wired up. `src/proxy.ts` degrades gracefully —
if `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` aren't set, it
passes requests through instead of throwing.

Retail and wholesale are **fully separate catalogs** (different products,
not shared SKUs with dual pricing) — see `src/types/catalog.ts` and
`supabase/migrations/0001_init.sql`.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase/Razorpay keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## QA

See [`QA.md`](./QA.md) for the full checklist — automated link/route/a11y/
E2E scripts under `scripts/qa/` (`npm run qa`, `npm run qa:routes`,
`npm run qa:e2e`) plus a manual checklist for what isn't automated yet.

## Deployment

Deployed via Vercel, connected to this GitHub repo. The `garmentvibes.com` domain
(registered on Hostinger) points to Vercel via DNS records configured in the
Hostinger domain panel.
