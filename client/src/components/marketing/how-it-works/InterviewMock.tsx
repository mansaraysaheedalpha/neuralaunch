import { MockFrame } from "./mock-frame";

export function InterviewMock() {
  return (
    <MockFrame className="min-h-[260px]">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
        Discovery &middot; Question 7 of 11
      </p>
      <div className="mt-3 space-y-2">
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">
          <p className="text-xs leading-snug text-slate-200">
            When you say &ldquo;stuck&rdquo;, is it the next step that&rsquo;s
            unclear &mdash; or do you not trust the direction itself?
          </p>
        </div>
        <div className="ml-6 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2">
          <p className="text-xs leading-snug text-slate-200">
            Mostly the next step &mdash; but sometimes I wonder if I should
            pivot.
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">
          <p className="text-xs leading-snug text-slate-200">
            What would &ldquo;right next step&rdquo; need to feel like for you
            to trust it?
          </p>
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
          <span>Question 7 of 11</span>
          <span>64%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-[64%] rounded-full bg-primary" />
        </div>
      </div>
    </MockFrame>
  );
}
