import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Schemas registered as OpenAPI components must be built from the
    // extended `z` (zod-with-openapi.ts): registry.register() throws on
    // schemas built from plain 'zod' (story 1.5 review F2).
    files: ["src/lib/schemas/**/*.ts"],
    ignores: ["src/lib/schemas/zod-with-openapi.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "zod",
              message:
                "Import { z } from '@/lib/schemas/zod-with-openapi' instead: OpenAPI component schemas need the extended z (see registry.ts).",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client — not hand-written code.
    "src/generated/**",
    // Pre-existing BMAD tooling/docs, untouched by this codebase.
    "_bmad/**",
    "_bmad-output/**",
    "docs/**",
    // design-sync (claude.ai/design): generated bundle + staged converter, both gitignored.
    "ds-bundle/**",
    ".ds-sync/**",
  ]),
]);

export default eslintConfig;
