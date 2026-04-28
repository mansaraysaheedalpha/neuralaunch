export type Archetype = {
  id: string;
  role: string;
  tag: string;
  monologue: string;
  situation: string;
  shift: string;
};

export const ARCHETYPES: Archetype[] = [
  {
    id: "graduate",
    role: "The graduate",
    tag: "skills, no path",
    monologue: "I did everything right and somehow ended up here.",
    situation:
      "Studied for years. Applied everywhere. Got nowhere. Has skills the world needs — and no clear path to use them.",
    shift:
      "One direction matched to your actual skills, your geography, and the next 8 weeks of your life.",
  },
  {
    id: "stuck-founder",
    role: "The stuck founder",
    tag: "traction, then a wall",
    monologue:
      "Something is wrong but I can't tell what's actually broken.",
    situation:
      "Started something. Got some traction. Hit a wall. Cannot tell if the problem is the product, the market, the pricing, or something deeper.",
    shift:
      "A diagnosis of which wall you're hitting, and the shortest path to test the fix that matters most.",
  },
  {
    id: "shop-owner",
    role: "The shop owner",
    tag: "real customers, hidden ceiling",
    monologue:
      "I know there's growth here. I just can't see the next step from where I'm standing.",
    situation:
      "Has real customers and real revenue. Knows growth is possible. Cannot see the next move from where they're standing.",
    shift:
      "The single highest-leverage growth move for a business at your size — with the steps to execute it.",
  },
  {
    id: "aspiring-builder",
    role: "The aspiring builder",
    tag: "an idea, no route",
    monologue: "I have the idea. I have no idea how to not waste six months.",
    situation:
      "Has a real idea. Maybe even early users. No idea how to take the next step without burning months on the wrong thing.",
    shift:
      "An execution plan sized to the hours you actually have, with the validation step before the build.",
  },
  {
    id: "professional",
    role: "The professional with a side project",
    tag: "career + side project, no time",
    monologue: "Too many possibilities, no way to commit to one.",
    situation:
      "Has skills, has resources, maybe even a small team. Drowning in options. Cannot find the one direction that actually fits.",
    shift:
      "One commitment. Phased to the evenings and weekends you have. Defended against the tradeoffs of the ones you didn't pick.",
  },
];
