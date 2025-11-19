# EXECUTION AGENT SANDBOX ARCHITECTURE INVESTIGATION

## EXECUTIVE SUMMARY

The NeuraLaunch system uses a **ONE SANDBOX PER PROJECT** architecture where:
- ONE Docker container per project (not per agent)
- ONE persistent Docker volume per project
- Multiple agents share the same sandbox and filesystem
- Agents execute in **WAVES** with controlled parallelism (3 tasks per agent per wave)
- File persistence is achieved through Docker volumes that persist across all agent executions

---

## 1. SANDBOX INITIALIZATION & CREATION

### 1.1 How Sandboxes Are Created

**File:** `/home/user/neuralaunch/client/src/lib/services/sandbox-service.ts`

**Key Method:** `findOrCreateSandbox(projectId, userId)` (lines 162-439)

#### Creation Flow:
1. **Check existing sandbox** - Query database for `sandboxContainerId` in LandingPage table
2. **If exists and healthy** - Return existing sandbox URL
3. **If missing or unhealthy** - Create new container:
   - Pull Docker image: `us-central1-docker.pkg.dev/.../neuralaunch-sandbox:v8`
   - Create Docker volume: `neuralaunch_workspace_${projectId}`
   - Create container with volume mount
   - Container runs on internal port 8080
   - Store container ID and public host port in LandingPage table

#### Docker Configuration (lines 357-391):
```typescript
const containerConfig: Docker.ContainerCreateOptions = {
  Image: SANDBOX_IMAGE_NAME,
  Labels: {
    "neuralaunch.projectId": projectId,
    "neuralaunch.userId": userId,
  },
  ExposedPorts: { [`${SANDBOX_INTERNAL_PORT}/tcp`]: {} },
  HostConfig: {
    AutoRemove: false,
    Mounts: [
      {
        Type: "volume",
        Source: volumeName,  // neuralaunch_workspace_{projectId}
        Target: WORKSPACE_DIR_INSIDE_CONTAINER,  // /workspace
      },
    ],
    PortBindings: {
      [`${SANDBOX_INTERNAL_PORT}/tcp`]: [{ HostPort: "" }],  // Random port
    },
  },
  Env: [
    `PROJECT_ID=${projectId}`,
    `PUSHER_APP_ID=${env.PUSHER_APP_ID}`,
    // ... other env vars
  ],
};
```

### 1.2 Sandbox Storage & Persistence

**Database Schema:** `prisma/schema.prisma` (LandingPage model, lines 188-191)

```prisma
sandboxContainerId    String?   @unique
sandboxInternalIp     String?
sandboxHostPort       String?
sandboxLastAccessedAt DateTime?
```

**Volume Naming Convention:**
```
neuralaunch_workspace_{projectId}
```

**Example:** For project `xyz123`, volume is `neuralaunch_workspace_xyz123`

This volume is:
- Created once when sandbox initializes
- Persists across container restarts
- Shared by ALL agents working on the same project
- Contains the entire `/workspace` directory with all project files

---

## 2. SANDBOX SHARING MODEL: ONE PER PROJECT, NOT PER AGENT

### 2.1 Agent Assignment to Sandboxes

**Architecture:** Multiple agents → ONE shared sandbox

```
Project A (projectId: proj-123)
├── FrontendAgent (Task 1)    } 
├── BackendAgent (Task 2)     } All share sandbox ABC
├── DatabaseAgent (Task 3)    } with volume: neuralaunch_workspace_proj-123
└── InfrastructureAgent (Task 4) }
```

**Evidence:**

1. **SandboxService is a singleton** (`sandbox-service.ts`, line 1087):
   ```typescript
   export const SandboxService = new SandboxServiceClass();
   ```

2. **Tools call SandboxService with projectId only** (`filesystem-tool.ts`, line 118):
   ```typescript
   const result = await SandboxService.readFile(projectId, userId, path);
   ```

3. **ExecutionCoordinator builds waves per project** (`execution-coordinator.ts`, line 609):
   ```typescript
   async buildWave(input: {
     projectId: string;
     userId: string;
     conversationId: string;
     waveNumber: number;
     // ...
   })
   ```

4. **All agent functions reference the same projectId**:
   - `infrastructure-execution-agent-function.ts` (line 46)
   - `backend-agent-function.ts` (line 47)
   - `frontend-agent-function.ts` (similar structure)

### 2.2 ProjectId to Sandbox Mapping

**Mapping Mechanism:**

| Component | Mapping |
|-----------|---------|
| **projectId** | Unique identifier from ProjectContext table |
| **Docker Volume** | `neuralaunch_workspace_${projectId}` |
| **Container ID** | Stored in `LandingPage.sandboxContainerId` |
| **Database Lookup** | `prisma.landingPage.findFirst({ where: { id: projectId } })` |

**Lookup in SandboxService** (lines 166-177):
```typescript
const project = await prisma.landingPage.findFirst({
  where: { id: projectId, userId: userId },
  select: {
    id: true,
    userId: true,
    sandboxContainerId: true,
    sandboxHostPort: true,
  },
});
```

---

## 3. FILE PERSISTENCE ACROSS AGENTS

### 3.1 Shared Filesystem Architecture

**Key Points:**

1. **One Volume per Project:**
   ```
   projectId: "proj-abc123"
   Volume Name: "neuralaunch_workspace_proj-abc123"
   Mount Point: "/workspace" inside container
   ```

2. **All Agents Read/Write Same Directory:**
   - FrontendAgent writes to `/workspace/src/pages/`
   - BackendAgent writes to `/workspace/src/api/`
   - DatabaseAgent writes to `/workspace/migrations/`
   - All changes persist in the SAME volume

3. **File Operations Use SandboxService:**

   **FileSystemTool** (`filesystem-tool.ts`, lines 115-145):
   ```typescript
   if (operation === "read") {
     const result = await SandboxService.readFile(projectId, userId, path);
   } else if (operation === "write") {
     const result = await SandboxService.writeFile(projectId, userId, path, content);
   }
   ```

   **SandboxService Methods:**
   - `readFile(projectId, userId, relativePath)` - reads via API endpoint
   - `writeFile(projectId, userId, relativePath, content)` - writes via API endpoint
   - Both call the same `findOrCreateSandbox()` to get the container

### 3.2 File Visibility Across Agents

**Sequential Agent Execution Within Waves:**

When waves execute, all agents can see files created by previous tasks:

```
Wave 1:
├── BackendAgent creates: /workspace/src/api/user.ts
├── DatabaseAgent creates: /workspace/migrations/001_users.sql
└── FrontendAgent creates: /workspace/src/pages/dashboard.tsx

All files persist in: neuralaunch_workspace_proj-abc123

Subsequent agents can immediately:
- Read the created files
- Modify them
- Reference them in new code
```

**Evidence from Infrastructure Agent** (`infrastructure-execution-agent-function.ts`, lines 123-158):
```typescript
// All agents execute the same way - they get projectId and userId
const result = await infrastructureAgent.execute({
  taskId,
  projectId,  // Same project
  userId,     // Same user
  conversationId,
  taskDetails: fullTaskDetails,
  context: projectContext,
});
```

### 3.3 Git Synchronization

Git operations also use the shared workspace:

```typescript
// Git operations via GitTool
SandboxService.gitInitIfNeeded(projectId, userId)
SandboxService.gitAddAll(projectId, userId)
SandboxService.gitCommit(projectId, userId, message)
SandboxService.gitCreateBranch(projectId, userId, branchName)
SandboxService.gitPushToBranch(projectId, userId, repoUrl, token, branchName)
```

All git operations work on the same `/workspace` directory, ensuring all agents commit their work to the same repo.

---

## 4. PARALLEL EXECUTION WITHIN WAVES

### 4.1 Wave-Based Execution Model

**Architecture Overview:**

```
Project Execution Lifecycle:
├── Wave 1 (execute simultaneously)
│   ├── BackendAgent Task 1
│   ├── FrontendAgent Task 1
│   └── DatabaseAgent Task 1
│
├── Quality Checks (sequential)
│   ├── Testing Agent
│   ├── Critic Agent (code review)
│   └── Integration Agent
│
├── Wave 2 (execute simultaneously)
│   ├── BackendAgent Task 2
│   └── FrontendAgent Task 2
│
└── (repeat until all tasks complete)
```

### 4.2 ExecutionCoordinator - Parallel Execution Control

**File:** `/home/user/neuralaunch/client/src/lib/orchestrator/execution-coordinator.ts`

**Wave Constraints** (line 78):
```typescript
private readonly MAX_TASKS_PER_AGENT_PER_WAVE = 3;
```

**Max Tasks:** 3 tasks per agent per wave (configurable)

### 4.3 Wave Building & Task Assignment

**Method:** `buildWave()` (lines 609-791)

**Steps:**

1. **Get pending tasks** (line 636):
   ```typescript
   const pendingTasks = await prisma.agentTask.findMany({
     where: {
       projectId,
       status: "pending",
       waveNumber: null,  // Only unassigned tasks
     },
   });
   ```

2. **Build dependency graph** (line 672):
   - Determines which tasks block other tasks
   - Only selects tasks with no unmet dependencies

3. **Create wave with limits** (line 695):
   ```typescript
   const wave = this.createWaveWithLimit(readyTasks, waveNumber);
   ```

4. **Assign to wave** (lines 710-717):
   ```typescript
   await prisma.agentTask.updateMany({
     where: { id: { in: wave.tasks.map(t => t.id) } },
     data: { waveNumber: waveNumber },
   });
   ```

5. **Trigger execution agents** (lines 727-760):
   ```typescript
   for (const task of wave.tasks) {
     const eventName = this.getInngestEventName(task.agentName);
     await inngest.send({
       name: eventName,  // e.g., "agent/execution.backend"
       data: { taskId, projectId, userId, conversationId, ... },
     });
   }
   ```

### 4.4 Parallel Execution Within Wave

**Mechanism:** Inngest Events

Each task in a wave triggers an independent Inngest event:

```
Wave 1 Tasks:
├── inngest.send({ name: "agent/execution.backend", data: {...} })
├── inngest.send({ name: "agent/execution.frontend", data: {...} })
├── inngest.send({ name: "agent/execution.infrastructure", data: {...} })
└── inngest.send({ name: "agent/execution.database", data: {...} })
```

These events are processed **in parallel by Inngest**, allowing multiple agents to execute simultaneously.

**Agent Functions:**
- `backend-agent-function.ts` - listens to `agent/execution.backend`
- `frontend-agent-function.ts` - listens to `agent/execution.frontend`
- `infrastructure-execution-agent-function.ts` - listens to `agent/execution.infrastructure`
- `database-agent-function.ts` - listens to `agent/execution.database`

### 4.5 Agent Completion & Wave Sequencing

**Wave Completion Detection** (`infrastructure-execution-agent-function.ts`, lines 285-338):

```typescript
// Each agent checks if ALL tasks in the wave are complete
const waveTasks = await prisma.agentTask.findMany({
  where: { projectId, waveNumber },
  select: { id: true, status: true },
});

const completedCount = waveTasks.filter(t => t.status === "completed").length;
const totalCount = waveTasks.length;

// If all tasks complete, trigger wave.complete event
if (completedCount === totalCount) {
  await inngest.send({
    name: "agent/wave.complete",
    data: { projectId, userId, conversationId, waveNumber },
  });
}
```

---

## 5. WAVE EXECUTION & TASK ASSIGNMENT LOGIC

### 5.1 Wave Start Function

**File:** `/home/user/neuralaunch/client/src/inngest/functions/wave-start-function.ts`

**Wave Initialization** (lines 27-49):

```typescript
// Step 1: Create ExecutionWave record
await step.run("create-wave-record", async () => {
  const existingWave = await prisma.executionWave.findUnique({
    where: { projectId_waveNumber: { projectId, waveNumber } },
  });

  if (!existingWave) {
    await prisma.executionWave.create({
      data: {
        projectId,
        waveNumber,
        status: "in_progress",
        taskCount: 0,
      },
    });
  }
});
```

**GitHub Setup** (lines 51-129):
- Wave 1: Initialize GitHub repository
- Waves 2+: Create new branch `wave-${waveNumber}`

**Coordinator Build** (lines 131-159):

```typescript
const coordinatorResult = await step.run(
  "build-wave-with-coordinator",
  async () => {
    const result = await executionCoordinator.buildWave({
      projectId,
      userId,
      conversationId,
      waveNumber,
      githubBranch: githubResult.branchName,
    });

    return result;
  }
);
```

### 5.2 Wave Completion & Triage

**File:** `/home/user/neuralaunch/client/src/inngest/functions/wave-complete-function.ts`

**Quality Gate Pipeline** (lines 28-194):

```
Wave Complete Event
├── Testing Agent (lines 31-65)
│   └── Run unit tests on generated code
│
├── Critic Agent (lines 73-103)
│   └── Code review (quality/security/style)
│
├── Auto-Fix (if needed) (lines 130-194)
│   └── Fix issues found by Critic
│
├── Integration Agent (lines 197-265)
│   └── Verify all components integrate
│
├── Preview Deployment (lines 274-354)
│   └── Deploy to preview environment for UAT
│
└── GitHub PR Creation (lines 359-479)
    └── Create PR with preview URL and test results
```

**Next Wave Trigger** (lines 498-522):

```typescript
const hasMoreTasks = await step.run("check-more-waves", async () => {
  const pendingCount = await prisma.agentTask.count({
    where: { projectId, status: "pending", waveNumber: null },
  });
  return pendingCount > 0;
});

if (hasMoreTasks) {
  // Trigger next wave
  await inngest.send({
    name: "agent/wave.start",
    data: {
      projectId,
      userId,
      conversationId,
      waveNumber: waveNumber + 1,
    },
  });
}
```

---

## 6. PARALLEL EXECUTION COORDINATION

### 6.1 How Multiple Agents Execute Simultaneously

**Mechanism: Inngest Event-Driven Parallelism**

```typescript
// ExecutionCoordinator.buildWave() triggers multiple events
const eventMap: Record<ExecutionAgentType, string> = {
  FrontendAgent: "agent/execution.frontend",
  BackendAgent: "agent/execution.backend",
  InfrastructureAgent: "agent/execution.infrastructure",
  DatabaseAgent: "agent/execution.database",
  IntegrationAgent: "agent/quality.integration",
  TestingAgent: "agent/quality.testing",
};

// Send all events to Inngest (non-blocking)
for (const task of wave.tasks) {
  const eventName = this.getInngestEventName(task.agentName);
  await inngest.send({ name: eventName, data: {...} });
}
```

Inngest then:
1. Receives multiple events
2. Spawns independent workers for each event
3. Executes agent functions in parallel
4. Provides isolation and resource management

### 6.2 Shared Resource Coordination

**Shared Resources:**
- **Filesystem:** Agents coordinate through shared Docker volume
- **Database:** ProjectContext, AgentTask, ExecutionWave tables serve as coordination points
- **Git Repository:** Single shared git repo in `/workspace`

**Coordination Patterns:**

1. **Before Wave Starts:**
   - All agents work on the same `waveNumber`
   - All write to same volume with different subdirectories

2. **During Wave Execution:**
   - Agents execute independently
   - Each agent creates/modifies files in its domain
   - Updates own task status in database

3. **After Wave Completes:**
   - One agent detects all tasks complete
   - Triggers `agent/wave.complete` event
   - Quality checks run sequentially

### 6.3 Concurrency Control at Database Level

**Database Constraints:**

```prisma
model ExecutionWave {
  @@unique([projectId, waveNumber])  // One wave per number
  @@index([projectId])
  @@index([status])
}

model AgentTask {
  @@index([projectId, waveNumber])  // Query tasks in a wave
  @@index([projectId, status])       // Query pending tasks
}
```

**Prevents:**
- Multiple waves with same waveNumber
- Duplicate task assignments

---

## 7. SANDBOX CLEANUP & LIFECYCLE

### 7.1 Idle Sandbox Cleanup

**File:** `/home/user/neuralaunch/client/src/lib/jobs/cleanup-sandboxes.ts`

**Configuration** (line 7):
```typescript
const INACTIVITY_THRESHOLD_MINUTES = 60 * 2;  // 2 hours
```

**Cleanup Process** (lines 13-91):

```typescript
export async function stopIdleSandboxes() {
  const cutoffTime = new Date();
  cutoffTime.setMinutes(cutoffTime.getMinutes() - INACTIVITY_THRESHOLD_MINUTES);

  const idleProjects = await prisma.landingPage.findMany({
    where: {
      sandboxContainerId: { not: null },
      sandboxLastAccessedAt: { lt: cutoffTime },
    },
  });

  // Stop containers concurrently
  const stopPromises = idleProjects.map(project =>
    SandboxService.stopSandbox(project.id, project.userId)
  );

  await Promise.all(stopPromises);
}
```

**Behavior:**
- Sandboxes stopped after 2 hours of inactivity
- Next access triggers `findOrCreateSandbox()` to restart
- Volume persists even when container is stopped
- Files remain intact after restart

---

## 8. ARCHITECTURE SUMMARY

### Sandbox Isolation Model

```
┌─────────────────────────────────────────────────────┐
│  NeuraLaunch Project Ecosystem                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Project A (proj-123)                              │
│  ├── Sandbox Container (docker-abc123)             │
│  ├── Volume: neuralaunch_workspace_proj-123        │
│  └── All agents: FrontendAgent, BackendAgent, etc. │
│                                                     │
│  Project B (proj-456)                              │
│  ├── Sandbox Container (docker-xyz789)             │
│  ├── Volume: neuralaunch_workspace_proj-456        │
│  └── All agents: FrontendAgent, BackendAgent, etc. │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### File Sharing Model

```
Docker Volume: neuralaunch_workspace_proj-123
├── /workspace/src/
│   ├── pages/        ← FrontendAgent writes here
│   ├── api/          ← BackendAgent writes here
│   └── components/   ← All agents can read/modify
├── /workspace/migrations/  ← DatabaseAgent
├── /workspace/infra/       ← InfrastructureAgent
└── /workspace/.git         ← Shared Git repo
```

### Execution Model

```
ExecutionCoordinator (singleton)
├── buildWave()
│   ├── Get pending tasks for project
│   ├── Build dependency graph
│   ├── Select ready tasks (up to 3 per agent)
│   └── Send Inngest events for each task
│
└── Inngest (event-driven executor)
    ├── Receives "agent/execution.backend" event
    ├── Spawns BackendAgentFunction worker
    ├── Simultaneously receives "agent/execution.frontend"
    ├── Spawns FrontendAgentFunction worker
    └── Both run in parallel, accessing same sandbox
```

---

## KEY FINDINGS

| Question | Answer |
|----------|--------|
| **One sandbox per project?** | ✅ YES - Identified by projectId |
| **Do agents share ONE sandbox?** | ✅ YES - All agents use same Docker volume |
| **How does projectId map to sandbox?** | Volume name: `neuralaunch_workspace_${projectId}` |
| **File persistence across agents?** | ✅ YES - Shared Docker volume maintains state |
| **Parallel execution in waves?** | ✅ YES - Up to 3 tasks per agent per wave |
| **Can agents see each other's files?** | ✅ YES - All write to same `/workspace` directory |
| **Execution coordination mechanism?** | Inngest events + database status tracking |

---

## CRITICAL CODE REFERENCES

| Component | File | Key Lines |
|-----------|------|-----------|
| **Sandbox Creation** | `sandbox-service.ts` | 162-439 |
| **Wave Building** | `execution-coordinator.ts` | 609-791 |
| **Parallel Triggering** | `execution-coordinator.ts` | 727-760 |
| **Wave Completion** | `infrastructure-execution-agent-function.ts` | 285-338 |
| **Wave Start** | `wave-start-function.ts` | 1-205 |
| **Wave Complete** | `wave-complete-function.ts` | 1-562 |
| **File Operations** | `filesystem-tool.ts` | 99-150 |
| **Volume Naming** | `sandbox-service.ts` | 258 |
| **Container Config** | `sandbox-service.ts` | 357-391 |

