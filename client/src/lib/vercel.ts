// lib/vercel.ts
interface VercelTeamsResponse {
  teams?: Array<{ id: string }>;
}

async function getVercelTeamId(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.vercel.com/v2/teams', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return null;
    const data = await res.json() as VercelTeamsResponse;
    // Assuming the user might be in multiple teams, pick one or let user choose later
    return data.teams?.[0]?.id || null;
  } catch (error) {
    console.error("Error fetching Vercel teams:", error);
    return null;
  }
}
