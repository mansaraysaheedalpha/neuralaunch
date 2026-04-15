#!/usr/bin/env bash
#
# EAS Build pre-install hook.
#
# EAS uploads the entire monorepo, then runs `pnpm install` from this
# mobile/ directory. pnpm walks up the directory tree looking for a
# workspace root, finds the parent pnpm-workspace.yaml (which lists
# `client` and `packages/*`), decides we're in a workspace, and then
# demands a root pnpm-lock.yaml — which we don't have because our
# workspaces keep per-package lockfiles.
#
# Deleting the parent workspace file during the build makes pnpm
# treat mobile/ as a standalone project and use mobile/pnpm-lock.yaml.
# This file is a copy of the source tree that EAS will discard after
# the build finishes — the real repo is untouched.

set -e

PARENT_WS="../pnpm-workspace.yaml"

if [ -f "$PARENT_WS" ]; then
  rm -f "$PARENT_WS"
  echo "[pre-install] Removed parent pnpm-workspace.yaml so pnpm treats mobile/ standalone."
else
  echo "[pre-install] No parent pnpm-workspace.yaml found; nothing to do."
fi
