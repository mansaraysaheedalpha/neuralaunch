// src/app/(app)/discovery/stuck/page.tsx
//
// Bare /discovery/stuck is no longer an entry point — it used to mint a
// DiscoverySession on GET (so a refresh duplicated it). Session creation
// now happens via the startStuckSession server action, fired from the
// archetype picker's Stuck row. A direct hit with no session id bounces
// back to the picker rather than creating anything.

import { redirect } from 'next/navigation';

export default function StuckLandingPage(): never {
  redirect('/discovery');
}
