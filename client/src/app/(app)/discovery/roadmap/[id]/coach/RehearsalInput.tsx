import type { KeyboardEvent } from "react";

export function RehearsalInput({
  otherPartyName,
  draft,
  submitting,
  onChange,
  onSend,
}: {
  otherPartyName: string;
  draft: string;
  submitting: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSend();
    }
  };
  return (
    <div className="sticky bottom-0 z-20 border border-rule bg-bg-2 [padding-bottom:env(safe-area-inset-bottom)] focus-within:border-accent lg:static lg:pb-0">
      <textarea
        aria-label={`Respond to ${otherPartyName}`}
        aria-describedby="coach-rehearsal-help"
        value={draft}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Say what you would say in the room…"
        disabled={submitting}
        className="min-h-[110px] w-full resize-none bg-transparent p-4 font-serif text-[18px] italic text-fg outline-none placeholder:text-muted-2"
      />
      <p id="coach-rehearsal-help" className="sr-only">
        Write the response you would use in the real conversation. Control or
        Command plus Enter sends.
      </p>
      <div className="flex justify-end border-t border-rule p-3">
        <button
          type="button"
          onClick={onSend}
          disabled={!draft.trim() || submitting}
          className="bg-accent px-4 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-bg disabled:opacity-35"
        >
          Respond →
        </button>
      </div>
    </div>
  );
}
