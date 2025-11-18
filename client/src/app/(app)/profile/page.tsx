import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import ConnectGitHubButton from "@/components/ConnectGithubButton";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Calendar, CheckCircle2, Github } from "lucide-react";
import { FcGoogle } from "react-icons/fc";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  // Get all linked accounts
  const accounts = await prisma.account.findMany({
    where: {
      userId: session.user.id,
    },
    select: {
      provider: true,
      providerAccountId: true,
    },
  });

  const githubAccount = accounts.find((acc) => acc.provider === "github");
  const googleAccount = accounts.find((acc) => acc.provider === "google");

  // Get user details with creation date
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      createdAt: true,
      name: true,
      email: true,
      image: true,
    },
  });

  const userInitials = session.user.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : session.user.email?.slice(0, 2).toUpperCase() || "U";

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">
          Profile Settings
        </h1>
        <p className="text-muted-foreground">
          Manage your account settings and integrations
        </p>
      </div>

      {/* Profile Information Card */}
      <Card className="mb-6 border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Account Information
          </CardTitle>
          <CardDescription>
            Your personal information and account details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar and Name */}
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20 border-2 border-primary/20">
              <AvatarImage src={session.user.image || ""} alt={session.user.name || ""} />
              <AvatarFallback className="text-lg bg-gradient-to-br from-primary to-secondary text-white">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="text-xl font-semibold">{session.user.name || "User"}</h3>
              <div className="flex items-center gap-2 text-muted-foreground mt-1">
                <Mail className="w-4 h-4" />
                <span className="text-sm">{session.user.email}</span>
              </div>
              {user?.createdAt && (
                <div className="flex items-center gap-2 text-muted-foreground mt-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm">
                    Member since {new Date(user.createdAt).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrations Card */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Connected Accounts
          </CardTitle>
          <CardDescription>
            Manage your connected OAuth providers and integrations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Google Account */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border flex items-center justify-center">
                  <FcGoogle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-medium">Google</h4>
                  <p className="text-sm text-muted-foreground">
                    OAuth authentication provider
                  </p>
                </div>
              </div>
              {googleAccount ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Not Connected
                </Badge>
              )}
            </div>
          </div>

          <Separator />

          {/* GitHub Account */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-900 dark:bg-gray-700 flex items-center justify-center">
                  <Github className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="font-medium">GitHub</h4>
                  <p className="text-sm text-muted-foreground">
                    Required for repository management and deployments
                  </p>
                </div>
              </div>
              {githubAccount ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="border-orange-300 dark:border-orange-700 text-orange-800 dark:text-orange-200 bg-orange-50 dark:bg-orange-950">
                  Required
                </Badge>
              )}
            </div>

            {!githubAccount && (
              <div className="pl-[52px]">
                <ConnectGitHubButton />
              </div>
            )}

            {githubAccount && (
              <div className="pl-[52px] space-y-2">
                <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-green-900 dark:text-green-200 font-medium">
                      GitHub Account Connected
                    </p>
                    <p className="text-green-700 dark:text-green-300 text-xs mt-1">
                      Your GitHub account is linked and ready for use. You can now create and manage repositories.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
