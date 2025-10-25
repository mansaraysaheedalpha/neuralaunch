// lib/services/mvp-generator.ts

/**
 * Generate package.json content for the MVP
 */
function generatePackageJson(): string {
  const packageJson = {
    name: "my-mvp-app",
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "prisma generate && next build",
      start: "next start",
      lint: "next lint",
    },
    dependencies: {
      next: "^15.0.0",
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      "@prisma/client": "^6.0.0",
      "next-auth": "^5.0.0-beta.29",
      "@auth/prisma-adapter": "^2.11.0",
      tailwindcss: "^3.4.0",
      stripe: "^17.0.0",
    },
    devDependencies: {
      "@types/node": "^20",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      typescript: "^5",
      prisma: "^6.0.0",
      autoprefixer: "^10.4.0",
      postcss: "^8.4.0",
    },
  };

  return JSON.stringify(packageJson, null, 2);
}

/**
 * Generate MVP codebase files
 */
export function generateMvpCodebase(
  _blueprint: unknown,
  _pricingTiers: unknown
): Record<string, string> {
  const files: Record<string, string> = {};

  // Generate package.json
  files["package.json"] = generatePackageJson();

  return files;
}
