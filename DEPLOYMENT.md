# Deploying GarmentVibes to Vercel

Written to be followed by a human with a browser. Nothing here needs a
terminal, and nothing here is destructive.

---

## 1. Connect the repository (one time)

1. Go to <https://vercel.com/new>.
2. Import `garmentvibes/garmentvibes`. If it isn't listed, use **Adjust
   GitHub App Permissions** and grant access to the repo.
3. Vercel detects Next.js on its own. **Leave every build setting alone** —
   the defaults (`next build`, output `.next`) are correct.
4. Before clicking Deploy, add the environment variable in step 2 below.

Once connected, every push and every pull request gets its own preview URL
automatically. PR #3 is open right now and will get one immediately.

---

## 2. Environment variables

Set these in **Project → Settings → Environment Variables**.

> **`NEXT_PUBLIC_*` values are baked in at build time.** Changing one does
> not take effect until the next deployment — redeploy after editing.

### Needed now

| Variable | Environment | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | **Production only** | `https://garmentvibes.com` (once the domain is live) |

**Do not set `NEXT_PUBLIC_SITE_URL` for Preview.** Previews fall back to
their own deployment URL, which is what makes their links, canonicals and
social cards self-consistent. Setting it would make every preview claim
canonical URLs belonging to the live site.

### Not needed yet

Leave these unset until the relevant account exists. The app degrades
deliberately when they're absent — checkout falls back to a simulated
payment rather than breaking.

| Variable | Unblocks |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Real auth and database |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Real payments |
| `RAZORPAY_WEBHOOK_SECRET` | Payment webhooks |
| `NEXT_PUBLIC_ANALYTICS_KEY` | Analytics and error reporting |

`RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` must **never** gain a
`NEXT_PUBLIC_` prefix — that ships them to every browser and hands over the
ability to forge payments.

---

## 3. What a preview deployment will and won't do

**Will work:** the entire storefront, wholesale portal and admin panel,
browsable end to end. Product filtering, search, cart, checkout, orders,
invoices, returns, exchanges, the credit ledger, the notification outbox.

**Won't work, by design:**

- **Sign-in accepts any password.** Auth is a mock client-side store.
- **Nothing persists between browsers or devices.** All state lives in that
  browser's localStorage, so your phone and your laptop see different data.
- **No payment is taken.** Checkout simulates success.
- **No email, SMS or WhatsApp is sent.** Messages queue in the outbox at
  `/admin/notifications`, where you can read exactly what a customer would
  have received.
- **The preview is not indexable.** `robots.txt` returns a blanket disallow
  on any non-production deployment. This is deliberate — see below.

---

## 4. Before going live

These are blocking, not nice-to-have.

1. **`/admin` is gated in the browser only.** Any visitor could set the
   staff role client-side and reach the admin panel. It is safe while the
   app is a preview with no real data behind it. It must not be publicly
   deployed with real customer data until Supabase Auth is wired up with a
   server-checked staff role, enforcement in `proxy.ts`, and RLS policies.
   See the warning in `QA.md`.
2. **GST rates and HSN codes need a chartered accountant's confirmation.**
   They are engineering defaults. So is the decision to treat wholesale
   prices as GST-exclusive.
3. **The Vercel Hobby plan does not permit commercial use.** A paid plan is
   required before taking money.
4. **Replace the four placeholder contacts** in `src/lib/business-info.ts`.
   The Grievance Officer contact is a legal requirement under the Consumer
   Protection (E-Commerce) Rules 2020, and Razorpay checks the policy pages
   during merchant onboarding.

---

## 5. Custom domain (Hostinger)

Once you're ready to point `garmentvibes.com` at Vercel:

1. Vercel: **Project → Settings → Domains → Add** `garmentvibes.com`.
2. Vercel shows the DNS records it wants — typically an `A` record for the
   apex and a `CNAME` for `www`.
3. Hostinger: **Domains → DNS / Nameservers**, and add exactly those
   records.
4. Wait for propagation, then set `NEXT_PUBLIC_SITE_URL` to
   `https://garmentvibes.com` for Production and **redeploy** so the value
   is baked in.

Until that last step, a production deployment falls back to its Vercel URL,
so canonicals and sitemap entries will point at `*.vercel.app`.
