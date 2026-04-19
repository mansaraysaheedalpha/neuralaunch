/**
 * Ambient declaration for the `resend` package.
 *
 * This shim lets `tsc` + `eslint` pass on fresh clones that haven't
 * yet run `pnpm install` since `resend` was added to package.json.
 * The shape here is a minimal subset of the real Resend SDK — just
 * enough for src/lib/email/sender.ts to type-check. Once the real
 * package is installed, its declarations merge with / supersede this
 * file at the type level and the runtime behaviour is unchanged.
 *
 * If the Resend SDK ever ships a method we need that this shim
 * doesn't model, add it here too (or delete this file once the real
 * package is guaranteed to be installed in every CI environment).
 */
declare module 'resend' {
  export class Resend {
    constructor(apiKey: string);
    emails: {
      send(args: {
        from:    string;
        to:      string;
        subject: string;
        text:    string;
      }): Promise<{
        error: { message: string } | null;
        data:  { id: string } | null;
      }>;
    };
  }
}
