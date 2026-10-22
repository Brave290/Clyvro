import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
const __filename = fileURLToPath(import.meta.url);
const compat = new FlatCompat({ baseDirectory: dirname(__filename) });
export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Human copy uses apostrophes and quotes in JSX ("what's broken", "fix it like this").
    // This rule is a leftover parser warning, not a real bug — turning it off so
    // plain-English pages don't fail Vercel `next build`.
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
];
