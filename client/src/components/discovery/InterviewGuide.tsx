// src/components/discovery/InterviewGuide.tsx
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface InterviewGuideProps {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
}

function Tip({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="shrink-0 text-muted-foreground/40 select-none mt-0.5">→</span>
      <p className="text-sm text-foreground/80 leading-relaxed">
        <span className="font-medium text-foreground">{label}.</span>{' '}{detail}
      </p>
    </div>
  );
}

/**
 * InterviewGuide
 *
 * Controlled Dialog presenting the full discovery session guide.
 * Built from 19 real evaluation sessions — explains how answer quality
 * directly determines recommendation quality.
 */
export function InterviewGuide({ open, onOpenChange }: InterviewGuideProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle>Getting the most out of your session</DialogTitle>
          <DialogDescription>
            Built from 19 real discovery sessions. The quality of your recommendation depends entirely on the quality of what you share.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest">The core principle</p>
            <p className="text-sm text-foreground/80 leading-relaxed">
              The recommendation you receive will only ever be as specific as the information you provide.
              Vague answers produce general recommendations. Specific answers produce recommendations that
              feel like they were written for you — because they were.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest">What produces the best results</p>
            <Tip
              label="Give specific numbers"
              detail={`"Maybe 10 to 12 hours a week" is far more useful than "some time on evenings and weekends." Cover time, money, revenue targets, team size. Approximations are fine — anchors are not optional.`}
            />
            <Tip
              label="Name failed attempts honestly"
              detail={`"I tried freelancing on Fiverr, made $80 in three months, and stopped because I couldn't get clients" produces a fundamentally different recommendation than "I tried freelancing before." The failure pattern shapes the plan.`}
            />
            <Tip
              label="Define success concretely"
              detail={`"10 people I've never met decide my thing is worth $100 a month" is an anchor. "I want to be successful" is not. Define it precisely enough that a stranger could verify it.`}
            />
            <Tip
              label="Answer the psychological questions as honestly as the practical ones"
              detail="What would make you walk away. What has stopped you before. Whether you trust your own discipline. These determine whether the recommendation accounts for the real constraints on your behaviour, not just the logistical ones."
            />
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest">What to avoid</p>
            <Tip
              label="Don't give the answer you think the engine wants"
              detail="It has no preference for what your situation is. A founder with Le 300,000 and 25 free hours who answers honestly will receive a better recommendation than someone who overstates their readiness."
            />
            <Tip
              label="Don't compress multiple answers into one"
              detail="Answer the question asked, then let the engine ask the next one. Compressed answers are harder to extract signal from and may cause the engine to revisit something you thought you'd already covered."
            />
            <Tip
              label="Don't answer in hypotheticals"
              detail={`"I could probably get 10 hours a week if I really committed" is not the same as "I have 10 hours a week." The engine builds recommendations around what is real, not what is possible under ideal conditions.`}
            />
            <Tip
              label="Don't skip the resilience questions"
              detail="What has stopped you before. What you would do if things don't work. Whether you trust yourself to follow through. These feel like the least important questions. They are usually the most important."
            />
          </div>

          <div className="rounded-lg bg-muted/50 px-4 py-3.5 space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest mb-3">Quick reference</p>
            {[
              'Specific numbers over approximations',
              'Failed attempts named honestly — what, why, what caused the stop',
              'Success defined concretely enough that a stranger could verify it',
              'Psychological questions answered with the same honesty as practical ones',
              'One question, one answer — no compression',
              'Your real situation, not the version you wish were true',
            ].map(item => (
              <div key={item} className="flex gap-2.5 text-sm text-foreground/75">
                <span className="shrink-0 text-muted-foreground/40 select-none">·</span>
                <span>{item}</span>
              </div>
            ))}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
