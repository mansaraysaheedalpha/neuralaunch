"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const errorMessages: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: "Configuration Error",
    description: "There is a problem with the server configuration. Please contact support.",
  },
  AccessDenied: {
    title: "Access Denied",
    description: "You do not have permission to sign in.",
  },
  Verification: {
    title: "Verification Failed",
    description: "The verification token has expired or has already been used.",
  },
  OAuthSignin: {
    title: "OAuth Sign In Error",
    description: "Error in constructing an authorization URL. Please try again.",
  },
  OAuthCallback: {
    title: "OAuth Callback Error",
    description: "Error in handling the response from the OAuth provider.",
  },
  OAuthCreateAccount: {
    title: "Account Creation Error",
    description: "Could not create OAuth provider user in the database.",
  },
  EmailCreateAccount: {
    title: "Email Account Error",
    description: "Could not create email provider user in the database.",
  },
  Callback: {
    title: "Callback Error",
    description: "Error in the OAuth callback handler route.",
  },
  OAuthAccountNotLinked: {
    title: "Account Not Linked",
    description: "This email is already associated with another account. Please sign in with the original provider.",
  },
  EmailSignin: {
    title: "Email Sign In Error",
    description: "The email could not be sent. Please try again.",
  },
  CredentialsSignin: {
    title: "Sign In Error",
    description: "Sign in failed. Check the details you provided are correct.",
  },
  SessionRequired: {
    title: "Session Required",
    description: "Please sign in to access this page.",
  },
  Default: {
    title: "Authentication Error",
    description: "An unexpected error occurred. Please try again.",
  },
};

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "Default";

  const errorInfo = errorMessages[error] || errorMessages.Default;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <CardTitle className="text-2xl">{errorInfo.title}</CardTitle>
          <CardDescription className="text-base mt-2">
            {errorInfo.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error === "OAuthAccountNotLinked" && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
              <p className="text-blue-900 dark:text-blue-100">
                <strong>Tip:</strong> If you previously signed in with a different provider (Google or GitHub),
                please use that same provider to sign in.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href="/signin">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Try Again
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/">
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </Link>
            </Button>
          </div>

          {error === "Configuration" && (
            <p className="text-xs text-center text-muted-foreground mt-4">
              Error Code: {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
