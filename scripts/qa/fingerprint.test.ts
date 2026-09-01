import { describe, expect, it } from "vitest";

import { changedFields, diffFingerprints } from "./fingerprint.mjs";

// ---------------------------------------------------------------------------
// The comparison behind the drift check.
//
// Capturing a fingerprint needs a database; comparing two needs nothing, which
// is why they are separate files. This tests the half that decides whether
// anybody is told about a difference — a comparison that quietly matches two
// unlike schemas is worse than no check, because it is the check that would
// have caught migrations 0016–0022 sitting unapplied.
// ---------------------------------------------------------------------------

const base = {
  policies: {
    "retail_orders :: Users can view their own retail orders": {
      cmd: "r",
      roles: ["public"],
      using: "((SELECT auth.uid()) = user_id)",
      check: "",
    },
  },
  functions: {
    "is_staff()": { execute: ["anon", "authenticated"], security_definer: true },
  },
};

const clone = () => JSON.parse(JSON.stringify(base));

describe("diffFingerprints", () => {
  it("says nothing when the two sides agree", () => {
    expect(diffFingerprints(clone(), clone())).toEqual([]);
  });

  it("ignores key order, which is not a difference", () => {
    const live = {
      functions: { "is_staff()": { security_definer: true, execute: ["anon", "authenticated"] } },
      policies: clone().policies,
    };
    expect(diffFingerprints(clone(), live)).toEqual([]);
  });

  it("reports a policy the project never received", () => {
    const live = clone();
    delete live.policies["retail_orders :: Users can view their own retail orders"];

    const [finding] = diffFingerprints(clone(), live);
    expect(finding.verdict).toBe("missing-in-live");
    expect(finding.section).toBe("policies");
  });

  it("reports something added to the project by hand", () => {
    const live = clone();
    live.policies["retail_orders :: Anyone can read everything"] = { cmd: "r", using: "true" };

    const [finding] = diffFingerprints(clone(), live);
    expect(finding.verdict).toBe("extra-in-live");
    expect(finding.key).toContain("Anyone can read everything");
  });

  it("catches a predicate that was widened on the project", () => {
    // The one that matters. A policy present on both sides, same name, same
    // command — and one of them lets every customer read every order.
    const live = clone();
    live.policies["retail_orders :: Users can view their own retail orders"].using = "true";

    const [finding] = diffFingerprints(clone(), live);
    expect(finding.verdict).toBe("different");
    expect(finding.live.using).toBe("true");
  });

  it("catches a grant that exists on only one side", () => {
    // Supabase grants EXECUTE to anon and authenticated through default
    // privileges, so a function can arrive on the project holding a grant it
    // never gets locally. Nothing else in the suite can see that.
    const live = clone();
    live.functions["is_staff()"].execute = ["anon", "authenticated", "service_role"];

    const [finding] = diffFingerprints(clone(), live);
    expect(finding.section).toBe("functions");
    expect(finding.verdict).toBe("different");
  });

  it("does not treat a reordered grant list as a change", () => {
    const live = clone();
    live.functions["is_staff()"].execute = ["anon", "authenticated"];
    expect(diffFingerprints(clone(), live)).toEqual([]);
  });

  it("reports a whole section the project is missing", () => {
    const repo = { ...clone(), triggers: { "profiles :: guard": "CREATE TRIGGER …" } };
    const findings = diffFingerprints(repo, clone());
    expect(findings).toHaveLength(1);
    expect(findings[0].section).toBe("triggers");
  });

  it("finds every difference, not just the first", () => {
    const live = clone();
    live.policies["retail_orders :: Users can view their own retail orders"].using = "true";
    live.functions["is_staff()"].security_definer = false;
    expect(diffFingerprints(clone(), live)).toHaveLength(2);
  });
});

describe("changedFields", () => {
  it("names only the fields that actually differ", () => {
    const fields = changedFields(
      { cmd: "r", using: "(uid = user_id)", check: "" },
      { cmd: "r", using: "true", check: "" }
    );
    expect(fields).toEqual([{ field: "using", repo: "(uid = user_id)", live: "true" }]);
  });

  it("handles a section whose entries are plain strings", () => {
    // triggers and indexes are stored as one definition string apiece.
    const fields = changedFields("CREATE INDEX a ON t (x)", "CREATE INDEX a ON t (y)");
    expect(fields).toHaveLength(1);
    expect(fields[0].live).toContain("(y)");
  });
});
