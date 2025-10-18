import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import typescriptParser from "@typescript-eslint/parser"; // 1. Import the TypeScript parser
import typescriptPlugin from "@typescript-eslint/eslint-plugin"; // 2. Import the TypeScript plugin

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Existing Next.js recommended rules (Core Web Vitals + Base TypeScript)
  ...compat.extends("next/core-web-vitals"),

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

      // --- NEXT.JS SPECIFIC TWEAKS (Optional, but often helpful) ---
      // Allow prop-types to be inferred in React components
      "react/prop-types": "off", 
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