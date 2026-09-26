import assert from "node:assert/strict";
import { test } from "node:test";
import { createCheckout } from "../src/lib/tebex.server.ts";

const invoice = {
  clientName: "Test Client",
  email: "test@example.com",
  currency: "USD",
  items: [{ name: "Commission", unitPrice: 12.5, quantity: 2 }],
  notes: "Test",
};

test("Tebex checkout contract and validation", async (t) => {
  const previous = { ...process.env };
  const fetch = globalThis.fetch;
  Object.assign(process.env, {
    TEBEX_PUBLIC_TOKEN: "test-token",
    TEBEX_PRIVATE_KEY: "",
    TEBEX_PACKAGE_ID: "123",
    TEBEX_UNIT_PRICE: "0.01",
    TEBEX_STORE_CURRENCY: "USD",
    SITE_URL: "https://example.com",
  });
  t.after(() => {
    process.env = previous;
    globalThis.fetch = fetch;
  });
  let requests;
  let responses;
  let packageOverride;
  globalThis.fetch = async (url, init) => {
    if (init.method === "GET") {
      return new Response(
        JSON.stringify({
          data: packageOverride ?? {
            base_price: 0.5,
            currency: "USD",
            type: "single",
            options: [],
            variables: [],
            disable_quantity: false,
          },
        }),
      );
    }
    requests.push({ url, body: JSON.parse(init.body) });
    const response = responses.shift();
    assert.ok(response, "Unexpected API request");
    return new Response(JSON.stringify(response.body), { status: response.status ?? 200 });
  };
  await t.test(
    "uses the live price despite a stale environment price and preserves metadata",
    async () => {
      requests = [];
      responses = [
        { body: { data: { ident: "basket-1" } } },
        { body: { links: { checkout: "https://checkout.tebex.io/test" } } },
      ];
      const result = await createCheckout(invoice, "127.0.0.1");
      assert.equal(result.url, "https://checkout.tebex.io/test");
      assert.equal(result.total, "25.00");
      assert.equal(requests[1].body.quantity, 50);
      assert.equal(requests[0].body.custom.client_email, invoice.email);
      assert.equal(requests[0].body.custom.total, "25.00");
    },
  );
  await t.test("reads checkout from the live data-wrapped package response", async () => {
    requests = [];
    responses = [
      { body: { data: { ident: "wrapped-basket" } } },
      { body: { data: { links: { checkout: "https://checkout.tebex.io/wrapped" } } } },
    ];
    const result = await createCheckout(invoice, "");
    assert.equal(result.url, "https://checkout.tebex.io/wrapped");
    assert.equal(requests.length, 2);
    assert.equal(requests[1].body.quantity, 50);
  });
  await t.test("rejects invalid configuration before creating a basket", async () => {
    for (const price of [Infinity, 0.001, 0, "invalid"]) {
      packageOverride = { base_price: price, currency: "USD", type: "single" };
      requests = [];
      await assert.rejects(createCheckout(invoice, ""), /invalid package response/);
      assert.equal(requests.length, 0);
    }
    packageOverride = undefined;
    await assert.rejects(
      createCheckout({ ...invoice, items: [{ name: "Work", unitPrice: 1.25, quantity: 1 }] }, ""),
      /multiple/,
    );
    await assert.rejects(
      createCheckout({ ...invoice, currency: "EUR" }, ""),
      /store charges in USD/,
    );
  });
  await t.test("handles malformed baskets and missing checkout links", async () => {
    requests = [];
    responses = [{ body: {} }];
    await assert.rejects(createCheckout(invoice, ""), /invalid basket response/);
    responses = [{ body: { data: { ident: "basket-2" } } }, { body: {} }];
    await assert.rejects(createCheckout(invoice, ""), /did not return a checkout link/);
  });
  await t.test(
    "rejects required Discord options and currency mismatches before creating baskets",
    async () => {
      requests = [];
      packageOverride = {
        base_price: 1,
        currency: "USD",
        type: "single",
        options: [{ name: "discord_id", required: true }],
      };
      await assert.rejects(createCheckout(invoice, ""), /requires discord_id/);
      assert.equal(requests.length, 0);
      packageOverride = { base_price: 0.5, currency: "EUR", type: "single" };
      await assert.rejects(createCheckout(invoice, ""), /invoice currency to match/);
      assert.equal(requests.length, 0);
      packageOverride = undefined;
    },
  );
  await t.test("surfaces provider failures", async () => {
    requests = [];
    responses = [{ status: 422, body: { detail: "Package requires authentication" } }];
    await assert.rejects(createCheckout(invoice, ""), /Package requires authentication/);
  });
});
