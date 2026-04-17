-- Add inputMethod column to Message so the chat history can
-- distinguish voice-transcribed user messages from typed ones and
-- cohort analytics (voice_message_sent) can be joined against the
-- underlying Message row. Nullable so all legacy messages (written
-- before voice mode shipped) and every assistant message default to
-- NULL — no backfill required.

ALTER TABLE "Message" ADD COLUMN "inputMethod" TEXT;
