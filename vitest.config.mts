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
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
