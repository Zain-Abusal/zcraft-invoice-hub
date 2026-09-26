import { createHash, timingSafeEqual } from "node:crypto";
import { useSession, getRequestIP } from "@tanstack/react-start/server";

export type GateSession = { unlocked?: boolean; at?: number };

export function sessionConfig() {
  const password = process.env["SESSION_SECRET"];
  if (!password || password.length < 32) throw new Error("SESSION_SECRET missing or too short");
  return {
    password,
    name: "zc-invoice",
    maxAge: 60 * 60 * 8,
    cookie: { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/" },
  };
}

export function getGateSession() {
  return useSession<GateSession>(sessionConfig());
}

export async function isUnlocked() {
  const s = await getGateSession();
  return s.data.unlocked === true;
}

export function passwordMatches(input: string, expected: string) {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

// Best-effort in-memory sliding window. Per server instance only — see README.
const buckets = new Map<string, number[]>();
export function rateLimit(scope: string, limit: number, windowMs: number) {
  const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false as const, retryAfter: Math.ceil((windowMs - (now - hits[0]!)) / 1000), ip };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) buckets.clear();
  return { ok: true as const, ip };
}
