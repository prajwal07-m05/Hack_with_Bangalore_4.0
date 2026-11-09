/**
 * Demo passcode gate + per-IP rate limiting (server-only).
 *
 * Auth: the login screen POSTs the passcode to /api/public/gate, which sets a
 * signed httpOnly cookie (HMAC-SHA256 of a fixed message, keyed by DEMO_PASSCODE).
 * Every LLM/Hindsight-spending server function and the agent route call
 * requireDemoAuth() and reject requests without a valid cookie.
 *
 * Rate limit: fixed window per client IP, kept in module memory (per worker
 * isolate — good enough for a single-tenant demo).
 */
import { getRequestHeader } from "@tanstack/react-start/server";
import { createHmac, timingSafeEqual } from "node:crypto";

export const GATE_COOKIE = "foreman_gate";
const GATE_MESSAGE = "foreman-demo-access-v1";

function passcode(): string | null {
  return process.env["DEMO_PASSCODE"] || null;
}

export function gateConfigured(): boolean {
  return !!passcode();
}

export function signGate(): string {
  const key = passcode();
  if (!key) throw new Error("DEMO_PASSCODE is not set");
  return createHmac("sha256", key).update(GATE_MESSAGE).digest("hex");
}

export function passcodeMatches(input: string): boolean {
  const expected = passcode();
  if (!expected) return false;
  const digest = (v: string) => createHmac("sha256", expected).update(v).digest();
  return timingSafeEqual(digest(input), digest(expected));
}

function cookieValue(): string | null {
  const header = getRequestHeader("cookie") ?? "";
  const match = new RegExp(`(?:^|;\\s*)${GATE_COOKIE}=([^;]+)`).exec(header);
  return match?.[1] ?? null;
}

/** Throws when the request carries no valid gate cookie. No-op if unconfigured (local dev). */
export function requireDemoAuth(): void {
  if (!gateConfigured()) return;
  const value = cookieValue();
  if (!value) throw new GateError("Sign in with the demo passcode first.", 401);
  const a = Buffer.from(value);
  const b = Buffer.from(signGate());
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new GateError("Session expired — sign in again.", 401);
  }
}

export class GateError extends Error {
  constructor(
    message: string,
    public status: 401 | 429 | 413 = 401,
  ) {
    super(message);
  }
}

/* ---------------- Rate limiting ---------------- */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function clientIp(): string {
  return (
    getRequestHeader("cf-connecting-ip") ??
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * Fixed-window per-IP limiter. Throws GateError(429) when exceeded.
 * Defaults: 20 runs per 10 minutes (agent runs).
 */
export function rateLimit(scope: string, max = 20, windowMs = 10 * 60 * 1000): void {
  const key = `${scope}:${clientIp()}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
    // lazy cleanup so the map doesn't grow unbounded
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
  }
  b.count += 1;
  if (b.count > max) {
    const mins = Math.ceil((b.resetAt - now) / 60000);
    throw new GateError(`Slow down — this demo allows ${max} of these per 10 minutes. Try again in ~${mins} min.`, 429);
  }
}

/** Test hook: reset all buckets. */
export function _resetRateLimits(): void {
  buckets.clear();
}
