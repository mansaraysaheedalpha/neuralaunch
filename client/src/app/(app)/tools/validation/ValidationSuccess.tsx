import Link from "next/link";
import type { ValidationCreateResponse } from "./validation-types";

export function ValidationSuccess({
  result,
}: {
  result: ValidationCreateResponse;
}) {
  return (
    <div className="grid min-h-[560px] lg:grid-cols-[1fr_1.35fr]">
      <aside className="border-r border-rule px-6 py-8 sm:px-10">
        <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
          <span>01 · Draft</span>
          <span className="text-accent">Created</span>
        </div>
        <h2 className="mt-12 font-serif text-[27px] italic text-fg">
          The page exists. The evidence does not—yet.
        </h2>
        <p className="mt-4 text-[13px] leading-relaxed text-fg-2">
          Open the editor, inspect every claim, and publish only when the offer
          is accurate. Views and actions become evidence after the page is
          shared with real prospects.
        </p>
        <dl className="mt-8 border border-rule-strong">
          <div className="grid grid-cols-[100px_1fr] border-b border-rule px-4 py-3">
            <dt className="font-mono text-[8px] uppercase text-muted">
              Status
            </dt>
            <dd className="text-[12px] text-accent">Draft</dd>
          </div>
          <div className="grid grid-cols-[100px_1fr] px-4 py-3">
            <dt className="font-mono text-[8px] uppercase text-muted">
              Reserved URL
            </dt>
            <dd className="truncate font-mono text-[10px] text-fg-2">
              /{result.slug}
            </dd>
          </div>
        </dl>
      </aside>
      <section className="flex flex-col justify-center px-6 py-8 sm:px-10">
        <span
          aria-hidden="true"
          className="font-serif text-[54px] italic text-accent"
        >
          ✓
        </span>
        <h3 className="mt-4 font-serif text-[30px] italic text-fg">
          Ready for editorial review.
        </h3>
        <Link
          href={`/discovery/validation/${result.pageId}`}
          className="mt-8 self-start bg-accent px-5 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-bg"
        >
          Open page editor →
        </Link>
      </section>
    </div>
  );
}
