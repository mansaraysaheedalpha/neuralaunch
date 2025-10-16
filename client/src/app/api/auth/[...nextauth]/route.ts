// client/src/app/api/auth/[...nextauth]/route.ts
import NextAuth, { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "@/lib/prisma";//

// Define and EXPORT your auth options
export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  // UPGRADE: Switch to the database session strategy
  session: {
    strategy: "database",
  },
  callbacks: {
    // UPGRADE: Update the session callback for the database strategy
    async session({ session, user }) {
      // The `user` object is now the user from our database.
      // We add its ID to the session object so we can access it on the client.
      session.user.id = user.id;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
