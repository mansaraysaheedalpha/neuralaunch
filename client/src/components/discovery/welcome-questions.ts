// src/components/discovery/welcome-questions.ts
//
// The 49-prompt rotation that drives the WelcomeLayer's "Think about
// this" card. Extracted from the component file so WelcomeLayer.tsx
// stays under the 200-line React component cap (CLAUDE.md §File Size
// Limits) — the constant is data, not logic, and lives more cleanly
// next to the component than inside it.
//
// Pure data — no I/O, no side effects, safe to import from server or
// client. The component picks one entry uniformly at random per
// render, which is fine: the goal is freshness on return visits, not
// statistical balance.

export const WELCOME_QUESTION_POOL = [
  'What problem are you trying to solve, and who wakes up every day frustrated by it?',
  'If you could not raise funding, what is the smallest version of this you could charge for next week?',
  'Have you talked to anyone who has this problem? What did they actually tell you?',
  'What are people doing right now to solve this problem, and why is that not enough?',
  'Who is the one person who would pay for this before it is finished — and why them specifically?',
  'Is the problem urgent, or just interesting? What is the difference for your target customer?',
  'What does success look like in 90 days — not eventually, but in 90 days?',
  'How do you know this is a real problem and not just one you personally have?',
  'Who is your first customer — not the ideal one, the first one you would call tomorrow?',
  'What is the riskiest assumption in your idea right now? Have you tested it?',
  'What would make you abandon this idea? If nothing comes to mind, what does that tell you?',
  'What does the competitive landscape tell you about whether this market is real?',
  'If you built this and nobody paid for it, what would you have learned?',
  'What is the one thing that, if you got it wrong, would make everything else irrelevant?',
  'What do you want to build — and is that the same thing as what people actually need?',
  'What existing behaviour are you trying to change, and how hard has that proven to be for others?',
  'What has already been tried in this space, and why did it not stick?',
  'If your best potential customer solved this problem themselves tomorrow, how would they do it?',
  'What is the unit of value you are selling — time saved, money made, pain removed?',
  'Who loses if your idea succeeds? Understanding that tells you where resistance will come from.',
  'What does your customer do in the ten minutes before and after they feel this problem?',
  'What would have to be true about the market for this to be a ten-million-dollar business?',
  'How often does this problem happen, and how bad does it feel each time?',
  'What is the single sentence that explains why someone would switch from what they do today?',
  'Are you building something people want, or something they say they want when asked?',
  'What would a person have to believe to choose your solution over doing nothing?',
  'Where does your target customer already spend money trying to fix this problem?',
  'What does the person who most desperately needs this look like — what is their day like?',
  'How will you find your first ten customers, and what will you say to them?',
  'What is the smallest experiment that would prove or disprove your core assumption?',
  'If a direct competitor launched tomorrow with more funding, what is your defensible advantage?',
  'What does the world look like in three years if this works exactly as you imagine?',
  'What are you assuming about your customer that you have not yet verified?',
  'Is the pain you are solving a vitamin or a painkiller? How do you know?',
  'What is the one metric that, if it moved, would tell you this is working?',
  'What would make someone refer this to a friend — and do they feel that way yet?',
  'What does the customer already use as a workaround, and what does that tell you about pricing?',
  'How does the problem change depending on the size or type of customer you target?',
  'What is the cheapest way to simulate your solution before you build anything?',
  'What assumption are you most emotionally attached to — and is that a warning sign?',
  'What does your ideal customer fear more than anything when thinking about this problem?',
  'If you had to charge three times what you planned from day one, who would still pay?',
  'What feedback have you received that you dismissed — and should you revisit it?',
  'What is the difference between the customer who tries this and the one who stays?',
  'Who in your life would tell you honestly if this idea was not good enough — and have you asked?',
  'What do early adopters need that mainstream customers do not, and are you ready for that gap?',
  'What does progress look like at week four, week twelve, and week fifty-two?',
  'Is the timing right for this idea — what has changed recently that makes it possible now?',
  'What part of the problem are you solving because it is important versus because it is easy to build?',
] as const;
