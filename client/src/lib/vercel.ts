// lib/vercel.ts
async function getVercelTeamId(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.vercel.com/v2/teams', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) return null;
    const data = await response.json();
    // Assuming the user might be in multiple teams, pick one or let user choose later
    return data.teams?.[0]?.id || null;
  } catch (error) {
    console.error("Error fetching Vercel teams:", error);
    return null;
  }
}
