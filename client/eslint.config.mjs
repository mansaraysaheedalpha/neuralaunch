import nextVitals from "eslint-config-next/core-web-vitals";
import typescriptParser from "@typescript-eslint/parser"; // 1. Import the TypeScript parser
import typescriptPlugin from "@typescript-eslint/eslint-plugin"; // 2. Import the TypeScript plugin

const eslintConfig = [
  // Next.js Core Web Vitals + base recommended rules.
  // Native flat config import (Next 16 — replaces the legacy
  // FlatCompat.extends("next/core-web-vitals") wrapper which
  // hits a circular-structure JSON error against eslint-config-next 16).
  ...nextVitals,

  // --- NEW: Stricter TypeScript Configuration ---
  {
    files: ["**/*.ts", "**/*.tsx"], // Apply these rules only to TypeScript files
    languageOptions: {
      parser: typescriptParser, // Use the TypeScript parser
      parserOptions: {
        project: "./tsconfig.json", // Point to your tsconfig for type-aware rules
      },
    },
    plugins: {
      "@typescript-eslint": typescriptPlugin, // Include the TypeScript plugin
    },
    rules: {
      // Start with recommended TypeScript rules
      ...typescriptPlugin.configs["eslint-recommended"].rules,
      ...typescriptPlugin.configs["recommended"].rules,
      // Add stricter type-checking rules
      ...typescriptPlugin.configs["recommended-requiring-type-checking"].rules,

      // --- SPECIFIC RULES ---
      // Ban 'any' completely, as requested by the audit
      "@typescript-eslint/no-explicit-any": "error",
      
      // Allow unused variables that start with an underscore
      "@typescript-eslint/no-unused-vars": [
        "warn", 
        { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }
      ],

      // Relax rule for functions that don't explicitly return (common in React components)
      "@typescript-eslint/explicit-function-return-type": "off", 
      "@typescript-eslint/explicit-module-boundary-types": "off",

      // Relax some ultra-strict rules that create too much noise
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "warn",

      // --- NEXT.JS SPECIFIC TWEAKS (Optional, but often helpful) ---
      // Allow prop-types to be inferred in React components
      "react/prop-types": "off",

      // Apostrophes in JSX text are fine — no need to escape in a codebase
      // that does not render user-controlled text as raw HTML.
      "react/no-unescaped-entities": "off",

      // These caused false positives on Prisma-generated union types
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-base-to-string": "off",
    },
  },
  // ---------------------------------------------

  // Global ignores remain the same
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "eslint.config.js", // Ignore the config file itself
    ],
  },
];

export default eslintConfig;