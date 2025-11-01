// Example: src/app/(app)/profile/page.tsx (or similar)

import { auth } from "@/auth"; // Get session server-side
import prisma from "@/lib/prisma";
import ConnectGitHubButton from "@/components/ConnectGithubButton";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    // Redirect or handle unauthorized
    return <div>Not authenticated</div>;
  }

  // Check if a GitHub account is linked for this user
  const githubAccount = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "github",
    },
  });

  const hasGitHub = !!githubAccount;

  return (
    <div>
      <h1>Profile Settings</h1>
      <p>Email: {session.user.email}</p>

      {/* GitHub Connection Status */}
      <div>
        <h2>Integrations</h2>
        {/* GitHub */}
        {hasGitHub ? (
          <p className="text-green-600">✅ GitHub Account Connected</p>
        ) : (
          <ConnectGitHubButton />
        )}
      </div>
      {/* Add other profile settings here */}
    </div>
  );
}
