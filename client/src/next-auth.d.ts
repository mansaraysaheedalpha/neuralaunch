import { DefaultSession } from "next-auth";

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      id: string;
      /**
       * Billing tier derived from Subscription.tier. Populated by the
       * session callback in src/auth.ts. Defaults to 'free' for users
       * without a subscription row. Use requireTier() from
       * lib/auth/require-tier.ts to check at API boundaries — never
       * compare strings inline.
       */
      tier: 'free' | 'execute' | 'compound';
      /**
       * Mirror of Subscription.status: 'active' | 'past_due' |
       * 'paused' | 'canceled'. The string 'none' is used for users
       * who have never checked out (no Subscription row).
       */
      subscriptionStatus: string;
    } & DefaultSession["user"];
  }
}
