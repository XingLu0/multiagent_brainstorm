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
    ".next-*/**",
    "out/**",
    "build/**",
    "dist-electron/**",
    "electron-build/**",
    "electron/**",
    "scripts/**",
    "src/generated/**",
    "next-env.d.ts",
  ]),
  // Allow `any` type in test files (mock objects need flexible typing)
  {
    files: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
