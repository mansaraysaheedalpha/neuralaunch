// lib/vercel.ts
import { logger } from "./logger"; // Added logger

interface VercelTeamsResponse {
  teams?: Array<{ id: string; name: string }>; // Added name for logging
}

// *** ADDED EXPORT ***
export async function getVercelTeamId(
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetch("https://api.vercel.com/v2/teams", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      logger.error(
        `[getVercelTeamId] Failed to fetch teams with status ${res.status}`
      );
      return null;
    }
    const data = (await res.json()) as VercelTeamsResponse;
    // Pick the first team. A more advanced flow might let the user choose.
    if (data.teams && data.teams.length > 0) {
      logger.info(
        `[getVercelTeamId] Found team: ${data.teams[0].name} (${data.teams[0].id})`
      );
      return data.teams[0].id;
    }
    logger.info(
      "[getVercelTeamId] User is not in any teams, using personal account."
    );
    return null; // No teams, will use personal account (null teamId)
  } catch (error) {
    logger.error(
      "[getVercelTeamId] Error fetching Vercel teams:",
      error instanceof Error ? error : undefined
    );
    return null;
  }
}
