import { logger } from "./logger";

// lib/vercel.ts
interface VercelTeamsResponse {
  teams?: Array<{ id: string; name?: string; slug?: string }>;
}

/**
 * Fetches the user's *first* Vercel Team ID using their access token.
 * Returns null if no teams or an error occurs.
 */
export async function getVercelTeamId(accessToken: string): Promise<string | null> {
  if (!accessToken) {
    logger.warn("[getVercelTeamId] No access token provided.");
    return null;
  }
  try {
    const res = await fetch('https://api.vercel.com/v2/teams', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      logger.error(`[getVercelTeamId] Vercel API error fetching teams: ${res.status} ${res.statusText}`);
      // Attempt to get error details
      try {
        const errorBody = await res.json() as unknown;
        // Log parsed body as context to avoid type errors on the 'err' parameter
        logger.error("[getVercelTeamId] Vercel API Error Body:", undefined, { errorBody });
      } catch { /* Ignore if body parsing fails */ }
      return null;
    }
    const data = await res.json() as VercelTeamsResponse;
    const firstTeam = data.teams?.[0];
    if (firstTeam) {
        logger.info(`[getVercelTeamId] Found Vercel Team ID: ${firstTeam.id} (Name: ${firstTeam.name || 'N/A'})`);
    } else {
        logger.info("[getVercelTeamId] User does not appear to belong to any Vercel teams (using personal account).");
    }
    // Return the ID of the first team found, or null if no teams.
    // In a future enhancement, you might present a choice if multiple teams exist.
    return firstTeam?.id || null;
  } catch (error) {
    logger.error("[getVercelTeamId] Error fetching Vercel teams:", error instanceof Error ? error : undefined);
    return null;
  }
}
// --- End Vercel Team ID Fetcher ---