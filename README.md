# ZCraft Invoices

Private invoice & payment-link tool for ZCraft Studios. Staff sign in with a shared password, fill in a commission, and get a Tebex checkout link to send to the client.

Stack: TanStack Start (React 19, SSR + server functions), Tailwind v4, shadcn/ui. All Tebex calls run server-side.

## How it works

1. `/login` — password checked server-side with a timing-safe compare against `SITE_PASSWORD`. On success an encrypted, `httpOnly`, `secure`, `sameSite=strict` session cookie (8h) is set.
2. `/` — invoice form (client name, email, product/service, unit price, quantity, currency, notes). Validated client- and server-side with Zod.
3. The server function:
   - `POST /api/accounts/{token}/baskets` with `email`, `complete_url`, `cancel_url` and a `custom` object holding the invoice ref, client name, email, description, unit price, quantity, total, currency and notes.
   - `POST /api/baskets/{ident}/packages` adding the base-unit package with `quantity = total / live package base price`.
   - Returns `basket.links.checkout`, shown with a one-click copy button.
4. The client pays on Tebex and lands on `/paid` (or `/paid?cancelled=1`).

## Environment variables

See `.env.example`.

| Name | Required | Purpose |
| --- | --- | --- |
| `SITE_PASSWORD` | yes | Shared sign-in password |
| `SESSION_SECRET` | yes | 32+ char random key encrypting the session cookie (`openssl rand -hex 32`) |
| `TEBEX_PUBLIC_TOKEN` | yes | Webstore public token (Tebex Creator Panel → Integrations → API Keys) |
| `TEBEX_PRIVATE_KEY` | no | Project private key; enables HTTP Basic auth and passing the client IP |
| `TEBEX_PACKAGE_ID` | yes | Base-unit package ID |
| `TEBEX_STORE_CURRENCY` | yes | Store currency, e.g. `USD` |
| `SITE_URL` | yes | `https://invoice.zcraftstudios.com` |

Never prefix these with `VITE_` — that would ship them to the browser.

## Tebex package setup

1. Creator Panel → Packages → create a package, e.g. **"Custom Commission Unit"**.
2. Price: `1.00` in your store currency (use `0.01` if you need cent-exact totals; the app reads the current package price automatically).
3. Disable any per-customer purchase limits and quantity caps (quantities can reach the thousands with 0.01 units).
4. No deliverables/commands required. Put it in a hidden category if you don't want it on the public store.
5. Disable required package options (including Discord login) and custom variables on this dedicated invoice package. The app checks these before creating a basket.
6. Copy the package ID into `TEBEX_PACKAGE_ID`.

`TEBEX_UNIT_PRICE` is no longer used; the live package price is authoritative.

Totals must be an exact multiple of the unit price — the server rejects anything else rather than silently rounding.

## Headless API notes

- Base URL: `https://headless.tebex.io/api`. Docs: https://docs.tebex.io/developers/headless-api/overview
- Baskets are charged in the **store's** currency. The form offers several currencies but the server only accepts `TEBEX_STORE_CURRENCY`, so the link always matches what Tebex charges.
- The `custom` object is stored on the basket and appears on the payment in the Creator Panel and in webhooks (`custom` field), so the commission details are tracked with the payment.
- Game-server stores (e.g. Minecraft) may require basket authorization with a username before checkout. This tool targets non-game / "website" style stores; if yours requires auth, the Tebex error is shown in the UI.
- Discounts, gift cards and creator codes are applied by the client at checkout.

## Security

- Credentials are read only inside server functions; errors logged include status and provider message only, never tokens.
- Rate limits: 5 sign-in attempts / 15 min / IP; 20 links / 10 min / IP. These are **in-memory per server instance** — on serverless platforms each instance keeps its own counter, so treat them as best-effort. For strict limits, back them with a shared store (e.g. Upstash Redis).
- CSRF protection on all server functions (TanStack Start CSRF middleware).
- `noindex` meta tags, `X-Robots-Tag` header and `robots.txt` (`Disallow: /`).

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. TanStack Start builds through Nitro. Set the environment variable `NITRO_PRESET=vercel` (or configure the Vercel preset in `vite.config.ts`) so the output targets Vercel Functions. Build command `npm run build`.
3. Add every variable from the table above under Project → Settings → Environment Variables (Production + Preview).
4. Deploy, then Project → Settings → Domains → add `invoice.zcraftstudios.com` and create the CNAME record `invoice → cname.vercel-dns.com` at your DNS provider.
5. Sign in, create a small test invoice, and complete it with a Tebex test payment.

`vercel.json` adds the noindex and security headers at the edge.

## Local development

```sh
cp .env.example .env   # fill in values
npm i
npm run dev
```
