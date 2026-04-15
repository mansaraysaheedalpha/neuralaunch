-- Push notification foundation.
--
-- `User.nudgesEnabled` is the master toggle from the mobile Settings
-- screen. Default true on new accounts; users can opt out. When false
-- we still keep the tokens in place (so re-enabling is instant) but
-- skip sending.
--
-- `PushToken` stores one row per device. A user can have multiple
-- (iPhone + Android + whatever). Tokens are Expo push tokens, which
-- Expo's push service accepts directly — we do not talk to APNs or
-- FCM ourselves.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "nudgesEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "PushToken" (
  "id"          TEXT        PRIMARY KEY,
  "userId"      TEXT        NOT NULL,
  "token"       TEXT        NOT NULL UNIQUE,
  "platform"    TEXT        NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "PushToken_userId_idx" ON "PushToken"("userId");
