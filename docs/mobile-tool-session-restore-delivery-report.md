# Mobile Tool-Session Restore — Delivery Report

**Date:** 2026-04-24
**Branch:** `feat/mobile-tool-session-restore` (cut from latest `main`)
**Context:** [2026-04-24 parity audit](mobile-web-parity-2-delivery-report.md)
flagged that all four standalone tool screens (Coach, Composer,
Research, Packager) lost generated output on navigate-away — the same
bug web fixed in commits `58c2761` and `622c213` (and iterated on
with the `1891f9e` Composer/Packager refresh-restore work). I deferred
this in the round-2 report specifically because it needed a proper
**state re-hydration layer**, not a drop-in UI addition.

This branch ships that layer.

---

## Commits

| Commit | Scope |
|---|---|
| `b3155d7` | Generic primitive + Packager restore |
| `aeeb097` | Composer restore |
| `c4a7491` | Coach restore (four-stage) |
| `5d55605` | Research restore |

Four commits, one per tool after the primitive, so the reviewer
can see the shape of each integration independently.

---

## The primitive

**`mobile/src/components/tools/ToolSessionHistoryButton.tsx`**

Header button + BottomSheet picker. Silent when the session list is
empty (no noise for first-time founders), shows a `N recent` pill
when there's history. Tapping a row fires `onSelect(sessionId)` and
the parent does the tool-specific rehydration.

Row shape is deliberately minimal and generic:

```ts
interface ToolSessionRow {
  id:        string;
  title:     string;
  subtitle?: string;
  updatedAt: string;  // ISO — rendered as "2h ago" / "3d ago" / date
}
```

Each tool fetches its tool-specific list shape from the matching
`/sessions` endpoint, maps to this row shape for display. The
primitive doesn't know anything about tool-specific fields.

**Button position:** mounted as `headerRight` on each tool's
`Stack.Screen` — same affordance position as the web's sidebar
toggle. The BottomSheet reuses the primitive from
`feat/mobile-polish-phase-2`.

---

## Per-tool integration

### Packager (`b3155d7`)

Backend: `GET /packager/sessions` (from `622c213`) → list,
`GET /packager/sessions/[sessionId]` → `{ package, context }`.

Rehydration: sets `package`, `context`, `sessionId` so the refine
loop still works, jumps to `stage='package'`. Row shape:

```
title: serviceName
subtitle: `{targetClient} · {tierCount} tier(s)`
```

### Composer (`aeeb097`)

Backend: `GET /composer/sessions` → list,
`GET /composer/sessions/[sessionId]` → `{ session }` with the full
ComposerSession.

Rehydration repopulates the entire form plus output:
 - context (targetDescription, relationship, goal, priorInteraction)
 - mode + channel
 - output.messages
 - sentMessages → sentIds Set (so Sent badges survive nav-round-trip)

Row subtitle surfaces mode + channel + msg count:
```
subtitle: `{mode} · {channel} · {N} msg(s)` (or "draft" if no output yet)
```

### Coach (`c4a7491`)

Backend: `GET /coach/sessions` → list with `hasPreparation`,
`rolePlayTurns`, `hasDebrief`. `GET /coach/sessions/[sessionId]` →
`{ session }` with ConversationSetup + optional
PreparationPackage + optional rolePlayHistory + optional Debrief.

The complication: four-stage state machine. Rehydration lands on
the most advanced stage the session reached:

| Session has                       | Stage on restore |
|-----------------------------------|------------------|
| `debrief` present                 | `debrief`        |
| `preparation` present (any rp)    | `preparation`    |
| Neither                           | `setup`          |

Mid-stream role-play without debrief lands on `preparation` so the
founder sees the coaching package + role-play turns without being
dropped straight into an interactive rehearsal they may not be
ready to resume.

Mobile's `SetupData` shape is a strict subset of server's
`ConversationSetup` — mapping on restore drops `relationship` and
`taskContext` (mobile doesn't render them today).

Row subtitle reflects the stage flags:
```
subtitle: `{objective} · (Debriefed|N rehearsal turns|Prepared|In setup)`
```

### Research (`5d55605`)

Backend: `GET /research/sessions` → list with `hasReport` and
`followUpCount`. `GET /research/sessions/[sessionId]` →
`{ session }` with query + optional plan + optional report +
optional followUps.

Rehydration:
| Session has    | Stage on restore |
|----------------|------------------|
| `report`       | `report`         |
| `plan` only    | `plan-review`    |
| Neither        | `input`          |

Row subtitle:
```
subtitle: `Report ready · N follow-up(s)` OR `Plan only`
```

---

## What this does NOT do

- **Task-scoped tool entries** — skipped. Task-scoped Coach/Composer/
  Research/Packager have exactly one session per task (keyed by the
  task, not by a sessionId array), so a picker adds no value there.
  Only the standalone entry point (via the Tools tab / the
  `StandaloneToolLauncher`) mounts the button.
- **Auto-restore on entry** — deliberately NOT done. Web doesn't
  auto-restore either; it surfaces the list and lets the founder
  pick. Auto-restoring would surprise users who intended to start a
  fresh session.
- **Cross-roadmap session history** — each list is scoped to the
  current roadmap (matches web). A founder working across multiple
  ventures sees only sessions for the roadmap they're in.

---

## Verification

**`pnpm exec tsc --noEmit` on mobile — PASS.** Only the three
pre-existing `@neuralaunch/constants` resolution errors, documented
across every prior delivery report.

**No new dependencies.** The primitive uses existing pieces
(`BottomSheet`, `Text`, theme tokens, `useSWR`, `Haptics`, lucide
`History` icon).

**No backend changes.** All eight endpoints (four list + four
detail) already existed on main before this branch was cut.

---

## Files

```
New:
  mobile/src/components/tools/ToolSessionHistoryButton.tsx

Modified:
  mobile/src/app/roadmap/[id]/coach.tsx
  mobile/src/app/roadmap/[id]/outreach.tsx
  mobile/src/app/roadmap/[id]/packager.tsx
  mobile/src/app/roadmap/[id]/research.tsx
```

---

*Report prepared 2026-04-24. All four commits carry the Co-Authored-By
trailer. Branch ready for review and merge.*
