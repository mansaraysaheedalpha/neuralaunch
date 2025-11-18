// src/lib/github-connection.ts
import prisma from "@/lib/prisma";

/**
 * Check if a user has connected their GitHub account
 * @param userId - The user ID to check
 * @returns Object containing connection status and token availability
 */
export async function checkGitHubConnection(userId: string): Promise<{
  isConnected: boolean;
  hasToken: boolean;
  token?: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      accounts: {
        where: { provider: "github" },
        select: { access_token: true },
      },
    },
  });

  const githubAccount = user?.accounts[0];
  const hasToken = !!githubAccount?.access_token;

  return {
    isConnected: !!githubAccount,
    hasToken,
    token: githubAccount?.access_token || undefined,
  };
}

/**
 * Validate GitHub connection before starting Wave 1
 * Throws an error with user-friendly message if not connected
 * @param userId - The user ID to validate
 * @returns The GitHub access token
 */
export async function validateGitHubForWave(userId: string): Promise<string> {
  const { isConnected, hasToken, token } = await checkGitHubConnection(userId);

  if (!isConnected || !hasToken || !token) {
    throw new GitHubNotConnectedError(
      "GitHub account not connected. Please connect your GitHub account in your profile settings before starting execution."
    );
  }

  return token;
}

/**
 * Custom error class for GitHub connection issues
 */
export class GitHubNotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubNotConnectedError";
  }
}
