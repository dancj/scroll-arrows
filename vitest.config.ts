import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // .ts unit tests for the library; .mjs tests for the release tooling.
    include: ["test/**/*.test.ts", "scripts/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // DOM-heavy files (rough rendering, overlay, observers) need a real
      // browser to be meaningful; unit coverage targets the pure logic.
      exclude: [
        "src/scroll-arrow.ts",
        "src/overlay.ts",
        "src/react.tsx",
        "src/index.ts", // export barrel + thin factory
        "src/types.ts", // type-only
      ],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
