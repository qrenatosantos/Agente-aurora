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
    // Gerados pela publicação no Cloudflare:
    ".open-next/**",
    ".wrangler/**",
    // Bibliotecas prontas servidas como arquivo (PDF.js):
    "public/vendor/**",
  ]),
]);

export default eslintConfig;
