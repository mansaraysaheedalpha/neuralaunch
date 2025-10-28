// src/auth.ts

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import VercelProvider from "next-auth/providers/vercel";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma"; // Your Prisma singleton
import type { Adapter } from "next-auth/adapters";
// import { trackEvent } from "@/lib/analytics"; // Your analytics function

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true, // Allow linking accounts with same verified email
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true, // Allow linking accounts with same verified email
      authorization: {
        params: {
          // Request permissions needed for repo creation/management
          scope: "repo workflow",
        },
      },
    }),
    // --- CORRECTED VERCEL PROVIDER ---
    OAuthProvider({
      id: "vercel", // Unique ID for this provider
      name: "Vercel",
      type: "oauth",
      clientId: process.env.VERCEL_CLIENT_ID!,
      clientSecret: process.env.VERCEL_CLIENT_SECRET!,
      authorization: {
        url: "https://vercel.com/oauth/authorize", // Vercel's Auth URL
        params: {
          // Define scopes needed when user connects
          // Consult Vercel API docs for necessary scopes:
          // Likely need: 'projects:read-write', 'deployments:read-write', 'teams:read', 'offline_access'
          scope:
            "offline_access projects:read-write deployments:read-write teams:read",
        },
      },
      token: "https://api.vercel.com/v2/oauth/access_token", // Vercel's Token URL
      userinfo: {
        // Endpoint to fetch basic user info after auth
        url: "https://api.vercel.com/v2/user",
        async request(context) {
          // context contains tokens, provider config
          const response = await fetch("https://api.vercel.com/v2/user", {
            headers: { Authorization: `Bearer ${context.tokens.access_token}` },
          });
          const data = await response.json();
          return data.user; // Return the user object part of the response
        },
      },
      profile(profile) {
        // Map Vercel user data to standard NextAuth user fields
        return {
          id: profile.id,
          name: profile.name || profile.username,
          email: profile.email,
          image: profile.avatar, // Vercel uses 'avatar' field
        };
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET!, // Ensure this is set
  callbacks: {
    // Add the userId to the session object
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
    // The Prisma adapter automatically handles storing OAuth tokens (access_token, etc.)
    // in the `Account` table upon successful sign-in or account linking.
  },
  events: {
    createUser: ({ user }) => {
      console.log(`New user created: ${user.id}, Email: ${user.email}`);
      trackEvent("sign_up", { userId: user.id });
    },
    linkAccount: async ({ user, account }) => {
      // Fires when a user connects an additional OAuth account
      console.log(
        `Linked ${account.provider} account for user ${user.id}. Token stored by adapter.`
      );
      // You can add provider-specific logic here if needed (e.g., fetching Vercel team ID)
    },
    signIn: ({ user, account, isNewUser }) => {
      console.log(
        `User signed in: ${user.id}, Provider: ${account.provider}, New User: ${isNewUser}`
      );
      // trackEvent("sign_in", { userId: user.id, provider: account.provider, isNewUser });
    },
  },
  // If you need custom sign-in pages, define them here:
  // pages: {
  //   signIn: '/signin',
  // }
});


import { handlers } from "@/auth";
export const { GET, POST } = handlers;
