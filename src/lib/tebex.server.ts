import { totalCents as sumCents, type InvoiceInput } from "./schema.ts";

const BASE = "https://headless.tebex.io/api";

export class TebexError extends Error {}

function cfg() {
  const token = process.env["TEBEX_PUBLIC_TOKEN"];
  const packageId = Number(process.env["TEBEX_PACKAGE_ID"]);
  const storeCurrency = (process.env["TEBEX_STORE_CURRENCY"] ?? "USD").toUpperCase();
  const privateKey = process.env["TEBEX_PRIVATE_KEY"];
  const siteUrl = process.env["SITE_URL"] ?? "https://invoice.zcraftstudios.com";

  if (!token || !Number.isSafeInteger(packageId) || packageId <= 0) {
    throw new TebexError("Tebex is not configured on the server.");
  }

  return { token, packageId, storeCurrency, privateKey, siteUrl };
}

async function call<T>(url: string, init: RequestInit, step: string, auth?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (auth) headers["Authorization"] = auth;

  const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(15_000) });
  const responseText = await res.text();
  let body: { detail?: string; message?: string; title?: string } | null = null;

  try {
    body = responseText ? JSON.parse(responseText) : null;
  } catch {
    // Tebex returned non-JSON.
  }

  if (!res.ok) {
    const msg = body?.detail ?? body?.message ?? body?.title ?? `HTTP ${res.status}`;

    console.error(`[tebex] ${step} failed (${res.status}): ${String(msg).slice(0, 300)}`);

    throw new TebexError(`Tebex ${step} failed: ${String(msg).slice(0, 200)}`);
  }

  return body as T;
}

export async function createCheckout(input: InvoiceInput, _ip: string) {
  const c = cfg();

  if (input.currency !== c.storeCurrency) {
    throw new TebexError(
      `Your Tebex store charges in ${c.storeCurrency}. Pick ${c.storeCurrency} or change the store currency.`,
    );
  }

  const totalCents = sumCents(input.items);

  if (totalCents <= 0) {
    throw new TebexError("Invoice total must be greater than 0.");
  }

  const itemsText = input.items
    .map((i) => `${i.quantity} x ${i.name} @ ${i.unitPrice.toFixed(2)}`)
    .join("; ")
    .slice(0, 1000);

  const auth = c.privateKey
    ? "Basic " + Buffer.from(`${c.token}:${c.privateKey}`).toString("base64")
    : undefined;

  // Validate the live package before creating a basket or issuing a payment link.
  const packageResponse = await call<{
    data?: {
      currency?: string;
      base_price?: number;
      type?: string;
      disable_quantity?: boolean;
      options?: { name: string; required?: boolean }[];
      variables?: unknown[];
    };
  }>(
    `${BASE}/accounts/${encodeURIComponent(c.token)}/packages/${c.packageId}`,
    { method: "GET" },
    "package lookup",
    auth,
  );
  const pkg = packageResponse?.data;
  if (
    !pkg ||
    typeof pkg.base_price !== "number" ||
    !Number.isFinite(pkg.base_price) ||
    pkg.base_price < 0.01 ||
    Math.abs(pkg.base_price * 100 - Math.round(pkg.base_price * 100)) > 1e-6
  ) {
    throw new TebexError("Tebex returned an invalid package response.");
  }
  if (pkg.currency !== input.currency) {
    throw new TebexError(
      `The Tebex package charges in ${pkg.currency}. Set TEBEX_STORE_CURRENCY and the invoice currency to match.`,
    );
  }
  const unitCents = Math.round(pkg.base_price * 100);
  if (totalCents % unitCents !== 0) {
    throw new TebexError(
      `Total must be a multiple of the ${pkg.base_price.toFixed(2)} ${pkg.currency} base unit.`,
    );
  }
  const units = totalCents / unitCents;
  const requiredOptions = (pkg.options ?? []).filter((option) => option.required);
  if (requiredOptions.length || pkg.variables?.length) {
    const names = requiredOptions.map((option) => option.name).join(", ") || "custom variables";
    throw new TebexError(
      `The Tebex invoice package requires ${names}. This payment-link flow cannot collect package options. Use a dedicated invoice package without required options or variables in Tebex.`,
    );
  }
  if (pkg.type !== "single" || (pkg.disable_quantity && units > 1)) {
    throw new TebexError("Use a one-time Tebex invoice package with quantities enabled.");
  }

  const basket = await call<{ data: { ident: string } }>(
    `${BASE}/accounts/${encodeURIComponent(c.token)}/baskets`,
    {
      method: "POST",
      body: JSON.stringify({
        complete_url: `${c.siteUrl}/paid`,
        cancel_url: `${c.siteUrl}/paid?cancelled=1`,
        complete_auto_redirect: true,
        custom: {
          invoice_ref: `ZC-${Date.now().toString(36).toUpperCase()}`,
          client_name: input.clientName,
          client_email: input.email,
          description: itemsText,
          item_count: String(input.items.length),
          total: (totalCents / 100).toFixed(2),
          currency: input.currency,
          notes: input.notes ?? "",
        },
      }),
    },
    "basket creation",
    auth,
  );

  const ident = basket?.data?.ident;
  if (!ident) throw new TebexError("Tebex returned an invalid basket response.");

  type BasketResult = {
    links?: { checkout?: string };
    base_price?: number;
    total_price?: number;
  };
  // Live responses wrap the basket in data; also accept the documented bare shape.
  const filled = await call<BasketResult & { data?: BasketResult }>(
    `${BASE}/baskets/${encodeURIComponent(ident)}/packages`,
    {
      method: "POST",
      body: JSON.stringify({
        package_id: String(c.packageId),
        quantity: units,
      }),
    },
    "package addition",
    auth,
  );

  const checkout = filled?.data?.links?.checkout ?? filled?.links?.checkout;

  if (!checkout) {
    throw new TebexError("Tebex did not return a checkout link.");
  }

  return {
    url: checkout,
    total: (totalCents / 100).toFixed(2),
    currency: input.currency,
    units,
  };
}
