import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests only — pure functions, no DOM, no server.
//
// The browser suites in scripts/qa/ cover whole journeys; these cover the
// arithmetic and boundary conditions underneath them, which a browser test
// can reach only clumsily if at all. Deliberately no jsdom: nothing here
// renders, and adding it would invite component tests that duplicate what
// the E2E suite already proves.
export default defineConfig({
  test: {
    // scripts/qa is included for the pure halves of the QA tooling — the
    // fingerprint comparison behind qa:drift is a function that decides
    // whether anybody is told the live project has drifted, and it deserves
    // tests as much as anything in src/. The suites themselves still need a
    // database or a browser and stay out.
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
