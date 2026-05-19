// src/app/api/discovery/sessions/[sessionId]/turn/no-idea-dispatcher.ts
//
// Routes a `no_idea` turn to the right stage handler based on the
// session's active IdeationStageRun. The parent turn route already
// ran the canonical preamble (CSRF, auth, rate limit, session load,
// safety gate, user-message persistence) before delegating here, so
// each handler trusts those invariants and only owns its stage's
// logic.

import 'server-only';
import { NextResponse } from 'next/server';
import { HttpError } from '@/lib/validation/server-helpers';
import { getActiveStageRun } from '@/lib/ideation';
import { handleStage1Turn } from './stage1-handler';
import { handleStage2Turn } from './stage2-handler';
import { handleStage3Turn } from './stage3-handler';
import { handleStage4Turn } from './stage4-handler';

export async function handleNoIdeaTurn(args: {
  message:        string;
  history:        string;
  sessionId:      string;
  userId:         string;
  conversationId: string | null;
}): Promise<NextResponse> {
  const activeStage = await getActiveStageRun(args.sessionId);
  if (!activeStage) {
    // no_idea sessions should always carry stage rows from creation.
    // Missing rows mean a corrupt session — surface as 500.
    throw new HttpError(500, 'Ideation stage runs missing for no_idea session');
  }

  switch (activeStage.stageNumber) {
    case 1:
      return handleStage1Turn(args);
    case 2:
      return handleStage2Turn(args);
    case 3:
      return handleStage3Turn(args);
    case 4:
      return handleStage4Turn(args);
    default:
      // Stages 0 and 5 — neither should be the active stage during a
      // /turn call. Stage 0 commits straight from the mindset page;
      // Stage 5 doesn't have a turn handler yet. Surface as 501 so
      // the client renders the "coming soon" placeholder rather than
      // a generic error.
      return NextResponse.json(
        { error: 'Stage not implemented', stageNumber: activeStage.stageNumber },
        { status: 501 },
      );
  }
}
