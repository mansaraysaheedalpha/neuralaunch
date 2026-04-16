import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Mail, CheckCircle2, Github } from "lucide-react";
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
        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-foreground">
          Profile settings
        </h1>
        <p className="text-muted-foreground">
          Manage your account and connected providers.
        </p>
      </div>

      {/* Profile Information Card */}
      <Card className="mb-6">
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
              <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="text-xl font-semibold">{session.user.name || "User"}</h3>
              <div className="flex items-center gap-2 text-muted-foreground mt-1">
                <Mail className="w-4 h-4" />
                <span className="text-sm">{session.user.email}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrations Card */}
      <Card>
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
                <Badge className="border-success/30 bg-success/10 text-success">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
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
                <Badge className="border-success/30 bg-success/10 text-success">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="border-gold/30 bg-gold/10 text-gold">
                  Required
                </Badge>
              )}
            </div>

            {githubAccount && (
              <div className="space-y-2 pl-[52px]">
                <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                  <div>
                    <p className="font-medium text-foreground">
                      GitHub account connected
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Your GitHub account is linked and ready for use.
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
