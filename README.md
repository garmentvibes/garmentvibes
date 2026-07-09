# GarmentVibes

A dual-mode clothing marketplace: a retail storefront (Myntra/Flipkart-style) and a
B2B wholesale portal, in one Next.js app, installable as a PWA on phones and tablets.

## Stack

- **Framework**: Next.js (App Router) + TypeScript + Tailwind CSS v4
- **Backend**: Supabase (Postgres, Auth, Storage, RLS)
- **Payments**: Stripe (international) + Razorpay (India)
- **Hosting**: Vercel, custom domain via Hostinger DNS
- **UI**: hand-rolled components (`src/components/ui`) using `class-variance-authority` + Tailwind

## Structure

```
src/
  app/
    page.tsx              # landing chooser: Retail vs Wholesale
    (retail)/shop/...      # retail storefront route group
    (wholesale)/wholesale/... # B2B portal route group
  components/
    ui/                    # base UI primitives
  lib/
    supabase/              # browser/server/middleware Supabase clients
    utils.ts
  middleware.ts            # Supabase session refresh + role-based routing
```

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase/Stripe/Razorpay keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

Deployed via Vercel, connected to this GitHub repo. The `garmentvibes.com` domain
(registered on Hostinger) points to Vercel via DNS records configured in the
Hostinger domain panel.
