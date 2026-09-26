import { totalCents as sumCents, type InvoiceInput } from "./schema";

const BASE = "https://headless.tebex.io/api";

export class TebexError extends Error {}

function cfg() {
  const token = process.env["TEBEX_PUBLIC_TOKEN"];
  const packageId = Number(process.env["TEBEX_PACKAGE_ID"]);
  const unitPrice = Number(process.env["TEBEX_UNIT_PRICE"] ?? "1");
  const storeCurrency = (process.env["TEBEX_STORE_CURRENCY"] ?? "USD").toUpperCase();
  const privateKey = process.env["TEBEX_PRIVATE_KEY"];
  const siteUrl = process.env["SITE_URL"] ?? "https://invoice.zcraftstudios.com";

  if (!token || !packageId || !(unitPrice > 0)) {
    throw new TebexError("Tebex is not configured on the server.");
  }

  return { token, packageId, unitPrice, storeCurrency, privateKey, siteUrl };
}

async function call<T>(
  url: string,
  init: RequestInit,
  auth?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (auth) headers["Authorization"] = auth;

  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let body: any = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Tebex returned non-JSON.
  }

  if (!res.ok) {
    const msg = body?.detail ?? body?.message ?? body?.title ?? `HTTP ${res.status}`;
    console.error(
      `[tebex] ${init.method} failed (${res.status}): ${String(msg).slice(0, 300)}`,
    );
    throw new TebexError(
      `Tebex rejected the request: ${String(msg).slice(0, 200)}`,
    );
  }

  return body as T;
}

export async function createCheckout(input: InvoiceInput, ip: string) {
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

  const unitCents = Math.round(c.unitPrice * 100);
  if (totalCents % unitCents !== 0) {
    throw new TebexError(
      `Total must be a multiple of the ${c.unitPrice.toFixed(2)} base unit.`,
    );
  }

  const units = totalCents / unitCents;
  const auth = c.privateKey
    ? "Basic " + Buffer.from(`${c.token}:${c.privateKey}`).toString("base64")
    : undefined;

  const basket = await call<{ data: { ident: string } }>(
    `${BASE}/accounts/${encodeURIComponent(c.token)}/baskets`,
    {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        complete_url: `${c.siteUrl}/paid`,
        cancel_url: `${c.siteUrl}/paid?cancelled=1`,
        complete_auto_redirect: true,
        ...(c.privateKey && ip !== "unknown" ? { ip_address: ip } : {}),
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
    auth,
  );

  const ident = basket.data.ident;

  const filled = await call<{
    data: {
      links?: { checkout?: string };
      base_price?: number;
      total_price?: number;
    };
  }>(
    `${BASE}/baskets/${encodeURIComponent(ident)}/packages`,
    {
      method: "POST",
      body: JSON.stringify({
        package_id: String(c.packageId),
        quantity: units,
      }),
    },
    auth,
  );

  const checkout = filled.data.links?.checkout;
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
