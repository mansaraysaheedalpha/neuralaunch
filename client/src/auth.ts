import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import type { Adapter } from "next-auth/adapters";
import { trackEvent } from "./lib/analytics";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    // This callback adds the user ID to the session object.
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    // --- REMOVED 'async' ---
    createUser: ({ user }) => {
      // This event fires the first time a user signs up.
      console.log("New user created:", user.id);
      trackEvent("sign_up", {
        method: "Google", // You can track the sign-up method
        userId: user.id,
      });
    },
  },
});
