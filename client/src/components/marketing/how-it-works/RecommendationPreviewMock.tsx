import { AlertTriangle, Check } from "lucide-react";
import { MockFrame } from "./mock-frame";

export function RecommendationPreviewMock() {
  return (
    <MockFrame className="min-h-[260px] border-l-[3px] border-l-gold">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
        Recommendation
      </p>
      <h4 className="mt-2 text-base font-semibold text-white">
        Pivot to validated services before code.
      </h4>
      <div className="mt-4 space-y-2">
        <div className="flex items-start gap-2.5 rounded-md border border-success/20 bg-success/10 px-3 py-2">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
          <p className="text-xs leading-snug text-slate-200">
            <span className="font-medium text-white">Reasoning:</span> Faster
            cash, lower risk than a 6-month build.
          </p>
        </div>
        <div className="flex items-start gap-2.5 rounded-md border border-gold/20 bg-gold/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
          <p className="text-xs leading-snug text-slate-200">
            <span className="font-medium text-white">
              What would make this wrong:
            </span>{" "}
            Service margin under 40%.
          </p>
        </div>
      </div>
    </MockFrame>
  );
}
