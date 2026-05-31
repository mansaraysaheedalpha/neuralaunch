#!/usr/bin/env node
// Mechanical sweep: rewrite the shadcn HSL back-compat aliases onto
// the Institute scale across one or more directories. Single-purpose
// script used for PR 16's Category B (kill half-theming). Discarded
// after the sweep — committed only for transparency / re-runnability.
//
// Mapping is locked to the answers in the PR brief:
//   destructive → accent (no red destructive lane)
//   secondary   → bg-3 / fg
//   ring        → accent
//
// Order matters: longer suffixes first so `bg-primary-foreground`
// resolves before `bg-primary`.

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import process from 'node:process';

// ─── 1. Replacement table (longest patterns first) ─────────────────
//
// Each row is [search, replace]. The pattern is anchored on left by a
// non-alpha-or-dash character (line start, space, quote, brace, etc.)
// and on right by a word boundary that allows `/N`, `:`, `,`, `}`,
// `"`, `'`, end-of-line, or a space. This is what lets us match
// `bg-primary/10` while not eating `bg-primary-foreground` until
// we've already processed `bg-primary-foreground` separately.

const TABLE = [
  // ── compound suffix variants first ──
  ['bg-card-foreground',      'bg-fg'],
  ['text-card-foreground',    'text-fg'],
  ['bg-primary-foreground',   'bg-bg'],
  ['text-primary-foreground', 'text-bg'],
  ['bg-primary-light',        'bg-bg-2'],
  ['bg-secondary-foreground', 'bg-fg'],
  ['text-secondary-foreground','text-fg'],
  ['bg-destructive-foreground','bg-bg'],
  ['text-destructive-foreground','text-bg'],
  ['text-muted-foreground',   'text-muted'],
  ['bg-muted-foreground',     'bg-muted'],
  ['border-muted-foreground', 'border-muted'],
  // ── single-suffix base tokens ──
  ['bg-background',           'bg-bg'],
  ['text-background',         'text-bg'],
  ['bg-foreground',           'bg-fg'],
  ['text-foreground',         'text-fg'],
  ['border-foreground',       'border-fg'],
  ['bg-card',                 'bg-bg-2'],
  ['border-card',             'border-rule'],
  ['bg-primary',              'bg-accent'],
  ['text-primary',            'text-accent'],
  ['border-primary',          'border-accent'],
  ['ring-primary',            'ring-accent'],
  ['from-primary',            'from-accent'],
  ['to-primary',              'to-accent'],
  ['via-primary',             'via-accent'],
  ['bg-secondary',            'bg-bg-3'],
  ['text-secondary',          'text-fg-2'],
  ['border-secondary',        'border-rule-strong'],
  ['bg-muted',                'bg-bg-3'],
  ['border-muted',            'border-rule'],
  ['border-border',           'border-rule'],
  ['border-input',            'border-rule'],
  ['bg-input',                'bg-bg-3'],
  ['bg-destructive',          'bg-accent'],
  ['text-destructive',        'text-accent'],
  ['border-destructive',      'border-accent'],
  ['ring-destructive',        'ring-accent'],
  ['ring-ring',               'ring-accent'],
  ['border-ring',             'border-accent'],
  // navy/gold leftovers
  ['bg-navy-950',             'bg-bg'],
  ['bg-navy-900',             'bg-bg-2'],
  ['bg-navy-800',             'bg-bg-3'],
  ['bg-navy-700',             'bg-bg-3'],
  ['text-navy-950',           'text-fg'],
  ['text-navy-900',           'text-fg'],
  ['text-navy-800',           'text-fg-2'],
  ['text-navy-700',           'text-fg-2'],
  ['border-navy-950',         'border-rule'],
  ['border-navy-900',         'border-rule'],
  ['border-navy-800',         'border-rule'],
  ['border-navy-700',         'border-rule-strong'],
  ['text-gold',               'text-accent'],
  ['bg-gold',                 'bg-accent'],
  ['border-gold',             'border-accent'],
];

// Build regexes that match a class at a word boundary. We allow
// the match to be preceded by start-of-string, whitespace, `:`,
// `'`, `"`, `(`, `{`, `,`, `=`, `>`, ``\``, or `\``, and followed by
// the same set OR `/digits`. This stops `bg-primary` matching inside
// `bg-primary-foreground` (because we've already replaced the longer
// pattern earlier in the table).

function buildRegex(token) {
  // Escape regex special chars in the token name.
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // (?<=[^a-zA-Z0-9_-]|^) — preceded by non-class-name char or BOL
  // (?=[^a-zA-Z0-9_-]|$) — followed by non-class-name char or EOL
  // We want to allow `/N` suffix (opacity) too, but that's just a /
  // which is already non-class-name, so it falls through.
  return new RegExp(`(?<=[^a-zA-Z0-9_-]|^)${escaped}(?=[^a-zA-Z0-9_-]|$)`, 'g');
}

const RULES = TABLE.map(([from, to]) => ({
  from,
  to,
  regex: buildRegex(from),
}));

// ─── 2. Walk + rewrite ─────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.turbo', 'dist', 'build', 'coverage',
  '__tests__',
]);

const EXTS = new Set(['.tsx', '.ts']);

async function walk(root, out) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(root, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await walk(full, out);
    } else if (e.isFile()) {
      if (!EXTS.has(extname(e.name))) continue;
      out.push(full);
    }
  }
}

function rewriteFile(path) {
  const original = readFileSync(path, 'utf8');
  let next = original;
  let changed = false;
  for (const rule of RULES) {
    const replaced = next.replace(rule.regex, rule.to);
    if (replaced !== next) {
      next = replaced;
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(path, next, 'utf8');
  }
  return changed;
}

async function main() {
  const roots = process.argv.slice(2);
  if (roots.length === 0) {
    console.error('Usage: institute-token-sweep.mjs <dir> [<dir> ...]');
    process.exit(2);
  }
  const files = [];
  for (const r of roots) {
    try { statSync(r); } catch {
      console.error(`Skip: ${r} (not found)`);
      continue;
    }
    await walk(r, files);
  }
  let touched = 0;
  for (const f of files) {
    if (rewriteFile(f)) {
      touched++;
      console.log(`rewrote ${f}`);
    }
  }
  console.log(`---\nFiles scanned: ${files.length}  Files rewritten: ${touched}`);
}

main().catch(err => { console.error(err); process.exit(1); });
