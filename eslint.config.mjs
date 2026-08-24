import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code agent worktrees are full copies of the repo. Without this,
    // `eslint .` walks every stale duplicate of src/ and reports ~53,000
    // problems, which makes the real 65-error baseline impossible to see.
    ".claude/**",
    // Build/report artefacts.
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "public/sw.js",
    "public/workbox-*.js",
  ]),
]);

export default eslintConfig;
