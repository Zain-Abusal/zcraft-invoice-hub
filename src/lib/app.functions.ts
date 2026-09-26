import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { z } from "zod";
import { invoiceSchema } from "./schema";

export const getAuthState = createServerFn({ method: "GET" }).handler(async () => {
  const { isUnlocked } = await import("./security.server");
  return { unlocked: await isUnlocked() };
});

export const requireAuth = createServerFn({ method: "GET" }).handler(async () => {
  const { isUnlocked } = await import("./security.server");
  if (!(await isUnlocked())) throw redirect({ to: "/login" });
  return { ok: true };
});

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("./security.server");
    const rl = s.rateLimit("login", 5, 15 * 60 * 1000);
    if (!rl.ok) return { ok: false as const, error: `Too many attempts. Try again in ${rl.retryAfter}s.` };
    const expected = process.env["SITE_PASSWORD"];
    if (!expected) return { ok: false as const, error: "Sign-in is not configured on the server." };
    if (!s.passwordMatches(data.password, expected)) {
      return { ok: false as const, error: "Incorrect password." };
    }
    const session = await s.getGateSession();
    await session.update({ unlocked: true, at: Date.now() });
    return { ok: true as const };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { getGateSession } = await import("./security.server");
  const session = await getGateSession();
  await session.clear();
  return { ok: true };
});

export const createPaymentLink = createServerFn({ method: "POST" })
  .inputValidator((d) => invoiceSchema.parse(d))
  .handler(async ({ data }) => {
    const s = await import("./security.server");
    if (!(await s.isUnlocked())) return { ok: false as const, error: "Your session expired. Sign in again." };
    const rl = s.rateLimit("create", 20, 10 * 60 * 1000);
    if (!rl.ok) return { ok: false as const, error: `Rate limit reached. Try again in ${rl.retryAfter}s.` };
    const { createCheckout, TebexError } = await import("./tebex.server");
    try {
      const r = await createCheckout(data, rl.ip);
      return { ok: true as const, ...r };
    } catch (e) {
      if (e instanceof TebexError) return { ok: false as const, error: e.message };
      console.error("[invoice] unexpected failure", e instanceof Error ? e.message : "unknown");
      return { ok: false as const, error: "Couldn't reach Tebex. Please try again." };
    }
  });
