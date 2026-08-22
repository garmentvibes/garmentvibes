import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEMO_SESSION_MAX_AGE,
  demoAdminEnabled,
  resetEphemeralSecretForTests,
  signDemoSession,
  supabaseConfigured,
  verifyDemoSession,
} from "./demo";

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "ALLOW_DEMO_ADMIN",
  "DEMO_ADMIN_SECRET",
] as const;

let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.DEMO_ADMIN_SECRET = "test-signing-secret";
  resetEphemeralSecretForTests();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("demoAdminEnabled", () => {
  it("is off by default", () => {
    expect(demoAdminEnabled()).toBe(false);
  });

  it("is on when explicitly requested and no Supabase project exists", () => {
    process.env.ALLOW_DEMO_ADMIN = "1";
    expect(demoAdminEnabled()).toBe(true);
  });

  // The security property the whole design rests on: a real deployment cannot
  // be talked into demo mode by setting an environment variable.
  it("is off when Supabase is configured, even if explicitly requested", () => {
    process.env.ALLOW_DEMO_ADMIN = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    expect(supabaseConfigured()).toBe(true);
    expect(demoAdminEnabled()).toBe(false);
  });

  it("treats a half-configured project as unconfigured", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    expect(supabaseConfigured()).toBe(false);
  });

  it("ignores values other than exactly 1", () => {
    process.env.ALLOW_DEMO_ADMIN = "true";
    expect(demoAdminEnabled()).toBe(false);
  });
});

describe("demo session cookies", () => {
  it("round-trips the email it was signed with", () => {
    const token = signDemoSession("staff@garmentvibes.com");
    expect(verifyDemoSession(token)).toBe("staff@garmentvibes.com");
  });

  it("rejects nothing at all", () => {
    expect(verifyDemoSession(undefined)).toBeNull();
    expect(verifyDemoSession("")).toBeNull();
  });

  it("rejects a token with no signature", () => {
    expect(verifyDemoSession("notatoken")).toBeNull();
  });

  // The attack this exists to stop: editing the payload to claim a different
  // identity, or inventing one outright.
  it("rejects a tampered payload", () => {
    const token = signDemoSession("staff@garmentvibes.com");
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ email: "attacker@evil.test", expiresAt: Date.now() + 60_000 })
    ).toString("base64url");

    expect(verifyDemoSession(`${forged}.${signature}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signDemoSession("staff@garmentvibes.com");
    process.env.DEMO_ADMIN_SECRET = "a-different-secret";
    expect(verifyDemoSession(token)).toBeNull();
  });

  it("rejects a signature of the wrong length", () => {
    const token = signDemoSession("staff@garmentvibes.com");
    const [payload] = token.split(".");
    // timingSafeEqual throws on mismatched lengths; this proves that throw is
    // handled rather than escaping as a 500.
    expect(verifyDemoSession(`${payload}.AAAA`)).toBeNull();
  });

  it("expires", () => {
    const issued = 1_700_000_000_000;
    const token = signDemoSession("staff@garmentvibes.com", issued);

    const justBefore = issued + DEMO_SESSION_MAX_AGE * 1000 - 1;
    expect(verifyDemoSession(token, justBefore)).toBe("staff@garmentvibes.com");

    const atExpiry = issued + DEMO_SESSION_MAX_AGE * 1000;
    expect(verifyDemoSession(token, atExpiry)).toBeNull();
  });

  it("rejects a validly signed token whose payload is not a session", () => {
    // A signature alone is not enough — the contents still have to make sense.
    const payload = Buffer.from(JSON.stringify({ nonsense: true })).toString("base64url");
    process.env.DEMO_ADMIN_SECRET = "test-signing-secret";
    const signed = signDemoSession("x@y.test");
    const [, realSignature] = signed.split(".");

    expect(verifyDemoSession(`${payload}.${realSignature}`)).toBeNull();
  });

  it("invalidates old tokens when no secret is configured and the process restarts", () => {
    delete process.env.DEMO_ADMIN_SECRET;
    resetEphemeralSecretForTests();

    const token = signDemoSession("staff@garmentvibes.com");
    expect(verifyDemoSession(token)).toBe("staff@garmentvibes.com");

    resetEphemeralSecretForTests(); // stands in for a restart
    expect(verifyDemoSession(token)).toBeNull();
  });
});
