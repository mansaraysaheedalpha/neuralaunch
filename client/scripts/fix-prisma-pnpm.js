/**
 * fix-prisma-pnpm.js
 *
 * Fixes the Prisma + pnpm TypeScript type resolution issue.
 *
 * Root cause: Prisma v6 generates types to `node_modules/.prisma/client/` (as a sibling
 * of `@prisma/client/`), but `@prisma/client/default.d.ts` re-exports from `.prisma/client/default`
 * (a relative path from inside `@prisma/client/`). With pnpm isolation, TypeScript cannot
 * resolve this relative path because it follows the symlink to the pnpm store and the
 * `.prisma/client` directory is not inside the physical `@prisma/client/` directory.
 *
 * Fix: Create a `.prisma` symlink inside `@prisma/client/` pointing to the actual generated
 * `.prisma` directory in the pnpm store, so TypeScript's relative resolution works.
 */

const fs = require('fs');
const path = require('path');

const nodeModulesDir = path.resolve(__dirname, '..', 'node_modules');
const prismaClientDir = path.resolve(nodeModulesDir, '@prisma', 'client');

// Resolve the symlink to find the real @prisma/client location in the pnpm store
let realPrismaClientDir;
try {
  realPrismaClientDir = fs.realpathSync(prismaClientDir);
} catch {
  console.log('[fix-prisma-pnpm] @prisma/client not found, skipping.');
  process.exit(0);
}

// The .prisma/client directory is a sibling of @prisma in the pnpm store
const realNodeModulesDir = path.dirname(path.dirname(realPrismaClientDir)); // go up from @prisma/client → @prisma → node_modules
const realDotPrismaDir = path.join(realNodeModulesDir, '.prisma');
const linkTarget = path.join(realPrismaClientDir, '.prisma');

// Only create the symlink if .prisma exists in the pnpm store and the link doesn't already exist
if (!fs.existsSync(realDotPrismaDir)) {
  console.log('[fix-prisma-pnpm] .prisma directory not found in pnpm store. Run prisma generate first.');
  process.exit(0);
}

if (fs.existsSync(linkTarget)) {
  console.log('[fix-prisma-pnpm] .prisma symlink already exists, nothing to do.');
  process.exit(0);
}

try {
  fs.symlinkSync(realDotPrismaDir, linkTarget, 'junction');
  console.log(`[fix-prisma-pnpm] Created symlink: ${linkTarget} → ${realDotPrismaDir}`);
} catch (err) {
  console.error('[fix-prisma-pnpm] Failed to create symlink:', err.message);
  process.exit(1);
}
