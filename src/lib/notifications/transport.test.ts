import { describe, expect, it } from "vitest";

import {
  anyTransportConfigured,
  configuredChannels,
  transportConfigFromEnv,
  transportFor,
  type TransportConfig,
} from "./transport";

const FULL: TransportConfig = {
  resendApiKey: "re_test",
  resendFrom: "GarmentVibes <orders@garmentvibes.com>",
  msg91AuthKey: "msg91_test",
  msg91SenderId: "GRMNTV",
};

describe("transportFor", () => {
  it("routes email through Resend and SMS through MSG91", () => {
    expect(transportFor("email", FULL)).toBe("resend");
    expect(transportFor("sms", FULL)).toBe("msg91");
  });

  it("routes WhatsApp through MSG91 too", () => {
    // Separate channels to the customer and separate rows in the outbox, but
    // one account carries both.
    expect(transportFor("whatsapp", FULL)).toBe("msg91");
  });

  it("treats a key with no From address as unconfigured", () => {
    // Resend rejects a send with no From, so a deployment configured this far
    // would claim it could send email and then fail every message — burning
    // all five attempts on something no retry could fix.
    expect(transportFor("email", { ...FULL, resendFrom: undefined })).toBeNull();
  });

  it("treats a From address with no key as unconfigured", () => {
    expect(transportFor("email", { ...FULL, resendApiKey: undefined })).toBeNull();
  });

  it("treats an MSG91 key with no sender id as unconfigured", () => {
    expect(transportFor("sms", { ...FULL, msg91SenderId: undefined })).toBeNull();
    expect(transportFor("whatsapp", { ...FULL, msg91SenderId: undefined })).toBeNull();
  });

  it("routes nothing when nothing is configured", () => {
    expect(transportFor("email", {})).toBeNull();
    expect(transportFor("sms", {})).toBeNull();
    expect(transportFor("whatsapp", {})).toBeNull();
  });
});

describe("anyTransportConfigured", () => {
  it("is false with no credentials, so no dispatch pass runs", () => {
    // A pass with no transport can only claim messages, fail them, and burn
    // their attempts. Not running leaves them queued and visible instead.
    expect(anyTransportConfigured({})).toBe(false);
  });

  it("is true with email alone", () => {
    expect(
      anyTransportConfigured({ resendApiKey: "re_test", resendFrom: "a@b.com" })
    ).toBe(true);
  });

  it("is true with SMS alone", () => {
    expect(
      anyTransportConfigured({ msg91AuthKey: "k", msg91SenderId: "GRMNTV" })
    ).toBe(true);
  });

  it("is false when every provider is only half-configured", () => {
    expect(anyTransportConfigured({ resendApiKey: "re_test", msg91AuthKey: "k" })).toBe(false);
  });
});

describe("configuredChannels", () => {
  it("reports every channel a deployment can carry", () => {
    expect(configuredChannels(FULL)).toEqual(["email", "sms", "whatsapp"]);
  });

  it("reports email alone when only Resend is set up", () => {
    expect(
      configuredChannels({ resendApiKey: "re_test", resendFrom: "a@b.com" })
    ).toEqual(["email"]);
  });

  it("reports nothing when nothing is configured", () => {
    // What the admin panel prints so "nothing is being delivered" is visible
    // rather than deduced from a queue that never shrinks.
    expect(configuredChannels({})).toEqual([]);
  });
});

describe("transportConfigFromEnv", () => {
  it("reads the server-side variables", () => {
    const config = transportConfigFromEnv({
      RESEND_API_KEY: "re_test",
      RESEND_FROM: "a@b.com",
      MSG91_AUTH_KEY: "k",
      MSG91_SENDER_ID: "GRMNTV",
    } as unknown as NodeJS.ProcessEnv);

    expect(config).toEqual({
      resendApiKey: "re_test",
      resendFrom: "a@b.com",
      msg91AuthKey: "k",
      msg91SenderId: "GRMNTV",
    });
  });

  it("treats an empty string as absent", () => {
    // A variable set to "" in a deployment's dashboard is how half a
    // configuration usually arrives, and `""` is truthy enough to pass a
    // careless check.
    const config = transportConfigFromEnv({
      RESEND_API_KEY: "",
      RESEND_FROM: "",
    } as unknown as NodeJS.ProcessEnv);

    expect(config.resendApiKey).toBeUndefined();
    expect(anyTransportConfigured(config)).toBe(false);
  });
});
