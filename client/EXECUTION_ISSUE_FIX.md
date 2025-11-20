# Execution Issue Diagnosis & Fix

## Problem
When clicking "Start Execution":
- Activity tab shows nothing
- Code files tab shows nothing
- Commands tab shows nothing
- Tasks are not being assigned to agents

## Root Cause Analysis

### The Flow:
1. User approves plan → `POST /api/projects/[projectId]/plan/approve`
2. API triggers Inngest event: `agent/wave.start`
3. `wave-start-function` loads execution plan from database
4. Function tries to load tasks using `phase.taskIds`
5. Function triggers agent execution for each task

### The Issue:
The `wave-start-function.ts` (line 228-233) loads tasks like this:

```typescript
const tasksFromDB = await prisma.agentTask.findMany({
  where: {
    projectId,
    id: { in: phase.taskIds }, // ⚠️ This requires taskIds to be in the phase
  },
});
```

**If `phase.taskIds` is empty or doesn't match the task IDs in the database, NO tasks will be loaded and NO agents will be triggered!**

## Diagnostic Steps

### 1. Check if tasks exist in database:
```sql
SELECT id, agentName, status, priority
FROM AgentTask
WHERE projectId = 'your-project-id'
ORDER BY priority;
```

### 2. Check execution plan phases:
```sql
SELECT executionPlan->>'phases'
FROM ProjectContext
WHERE projectId = 'your-project-id';
```

### 3. Verify phase structure:
The execution plan should have this structure:
```json
{
  "tasks": [...],
  "phases": [
    {
      "name": "Phase 1",
      "taskIds": ["task-id-1", "task-id-2", ...]
    }
  ]
}
```

## Quick Fixes

### Fix 1: Ensure Planning Agent Creates Proper Phases

The planning agent should create phases with taskIds. Check `planning-agent.ts` around line 1400-1500 to ensure it's building phases correctly:

```typescript
// Should create phases like:
const phases = [
  {
    name: "Phase 1: Core Setup",
    taskIds: [task1.id, task2.id, task3.id]
  },
  {
    name: "Phase 2: Features",
    taskIds: [task4.id, task5.id]
  }
];
```

### Fix 2: Fallback to Load All Pending Tasks

If phases are missing taskIds, the wave-start-function should fall back to loading ALL pending tasks:

**File:** `src/inngest/functions/wave-start-function.ts` (around line 224)

**Change FROM:**
```typescript
const tasksFromDB = await prisma.agentTask.findMany({
  where: {
    projectId,
    id: { in: phase.taskIds },
  },
});
```

**Change TO:**
```typescript
// If phase has taskIds, use them. Otherwise load all pending tasks
const tasksFromDB = phase.taskIds && phase.taskIds.length > 0
  ? await prisma.agentTask.findMany({
      where: {
        projectId,
        id: { in: phase.taskIds },
      },
    })
  : await prisma.agentTask.findMany({
      where: {
        projectId,
        status: "pending",
        waveNumber: null, // Not yet assigned to a wave
      },
      orderBy: { priority: "asc" },
      take: 12, // Max tasks for Wave 1
    });

log.info(`[Phase ${phaseNumber}] Loaded ${tasksFromDB.length} tasks (${phase.taskIds?.length || 0} from phase, ${tasksFromDB.length - (phase.taskIds?.length || 0)} from fallback)`);
```

### Fix 3: Add Detailed Logging

Add logging to wave-start-function to diagnose the issue:

```typescript
log.info(`[Phase ${phaseNumber}] Phase data:`, {
  phaseName: phase.name,
  taskIdsCount: phase.taskIds?.length || 0,
  taskIds: phase.taskIds,
});

log.info(`[Phase ${phaseNumber}] Tasks loaded from DB:`, {
  count: tasksFromDB.length,
  taskIds: tasksFromDB.map(t => t.id),
  statuses: tasksFromDB.map(t => t.status),
});
```

## UI Issues

### Activity Tab Empty
**Cause:** Activity tab shows tasks, which come from `/api/projects/[projectId]/tasks`
- If this API returns empty array, nothing shows
- Tasks must have `status`, `agentName`, and other fields populated

### Code Files Tab Empty
**Cause:** Code files come from `/api/projects/[projectId]/files`
- This queries the sandbox filesystem
- If no code has been generated yet, it will be empty
- Files only appear AFTER agents execute and write code

### Commands Tab Empty
**Cause:** Commands come from `task.output.commands`
- Commands only appear AFTER task execution completes
- Each agent must store commands in its output

## Recommended Fix Order

1. **Add logging** to wave-start-function to see what's happening
2. **Check database** for existing tasks
3. **Verify execution plan structure** has proper phases with taskIds
4. **Add fallback logic** to load all pending tasks if phase.taskIds is empty
5. **Test execution** and monitor logs

## Testing

After applying fixes:

1. Check logs for wave-start-function
2. Verify tasks are being loaded: `[Phase 1] Loaded X tasks`
3. Verify agents are being triggered: `[Phase 1] 🚀 Task 1/X: TaskName (AgentName)`
4. Check Activity tab refreshes and shows tasks
5. Wait for agents to complete and check Code Files / Commands tabs

## Prevention

To prevent this in the future:
1. Always ensure planning agent creates phases with taskIds
2. Add validation in wave-start-function to check for empty phases
3. Add fallback logic for missing taskIds
4. Improve error messages when tasks can't be loaded
