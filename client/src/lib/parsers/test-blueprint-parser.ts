// test-blueprint-parser.ts
// Run this with: npx tsx test-blueprint-parser.ts

import {
  parseBlueprint,
  getBlueprintStats,
  validateParsedBlueprint,
} from "./blueprint-parser";

// Test blueprint (paste your actual generated blueprint here)
const testBlueprint = `
# ✨ Quantum Leap Labs

**The Pitch:** We transform confusing physics textbooks into stunning, interactive 3D worlds you can explore, making mastering complex science as intuitive as playing a game.

---

## 📊 Project Metadata

**Industry:** EdTech / B2C SaaS
**Target Market:** North America, High School AP Physics & University-level Physics Students (Ages 16-20)
**Business Model:** Freemium Subscription
**Project Type:** Desktop Application (Windows/Mac) + Web-based marketing

---

## 🎯 The Problem & Opportunity

### The Pain Point
Complex physics concepts like electromagnetism, relativity, and quantum mechanics are fundamentally non-intuitive and cannot be truly understood through static 2D diagrams and equations in a textbook. Students spend hours staring at abstract drawings, feeling frustrated and disconnected, leading to poor grades and a loss of passion for science.

### Target User Profile
- **Who:** Ambitious high school students in AP Physics C or first-year university students in calculus-based physics courses.
- **Current Solution:** Khan Academy videos, dense textbooks, confusing 2D applets, and sheer memorization.
- **Pain Frequency:** Weekly, especially during new topic introductions and exam preparation, leading to hours of inefficient studying.

### Why Now?
Consumer hardware (mid-range laptops and desktops) is now powerful enough to run high-fidelity, real-time simulations that were previously limited to research labs. Furthermore, the shift towards remote and supplemental learning has conditioned parents and students to seek and pay for digital tools that provide a competitive edge.

---

## 💡 The Solution & Unique Value

### What You're Building
Quantum Leap Labs is a downloadable desktop application built in Unreal Engine 5 that provides a suite of interactive, "digital twin" laboratories for complex physics. Instead of reading about magnetic fields, students can see the field lines warp in 3D as they move a current-carrying wire. Instead of being told about time dilation, they can pilot a spaceship near the speed of light and observe the effects firsthand.

### Core Features (MVP Scope)
1. **Electromagnetism Module** - A sandbox to visualize and manipulate electric fields, magnetic fields, and Gauss's Law with real-time feedback. (Priority: Must-Have | Complexity: Medium)
2. **Interactive Lab Challenges** - Goal-oriented tasks that guide students through curriculum-aligned experiments (e.g., "Build a working electric motor"). (Priority: Must-Have | Complexity: Medium)
3. **Variable Controller** - Simple sliders and inputs allowing users to change constants (like charge, mass, velocity) and see immediate, visualized results. (Priority: Must-Have | Complexity: Low)
4. **Special Relativity Module** - A basic simulation demonstrating time dilation and length contraction from the user's perspective. (Priority: Should-Have | Complexity: High)

### Technical Overview
**Recommended Stack:**
- **Core Application:** Unreal Engine 5 using a C# integration (e.g., UnrealCLR or waiting for official support) or C++
- **Web/Marketing Frontend:** Next.js 14, React, Tailwind CSS
- **Backend/Licensing:** Next.js API Routes, Supabase (for user accounts and license keys)
- **Database:** PostgreSQL (via Supabase)
- **Auth:** Supabase Auth
- **Deployment:** Vercel (for web), Steam/Itch.io (for app distribution)
- **Key Integrations:** Stripe (for payments), Lemon Squeezy (handles payments + licensing simply)

### Why This Wins
Competitors are either clunky, 2D Java applets from the 2000s or passive video content. Quantum Leap Labs provides an unparalleled level of immersion and intuitive understanding. It's a "visual-kinesthetic" learning tool in a market dominated by text and diagrams. This is a 10x improvement in learning efficiency and engagement.

---

## 🧪 The Validation Blueprint (Your 14-Day Test)

### Core Hypothesis
We believe AP Physics students will provide their email for a waitlist and express high willingness-to-pay after watching a short video demonstrating an interactive 3D simulation of a complex physics concept (like electromagnetism).

### The Experiment
**What to Build:** A 60-second "cinematic" demo video. Use your UE5 skills to create a visually stunning showcase of ONE concept (e.g., visualizing the magnetic field around a wire). No UI, just pure visual power. A simple landing page (using Carrd or Framer) with a compelling headline ("Stop Memorizing, Start Visualizing"), the demo video, 3 benefit bullet points, and an email capture form for the waitlist.
**How to Test:** Post the video and a link to the landing page in highly specific online communities.
**Timeline:** Days 1-5: Create the 60s demo video in UE5. Days 6-7: Build the landing page. Days 8-14: Distribute and analyze.
**Budget:** $19 for Carrd Pro + $12 for a domain. <$50.

### Success Criteria
| Metric | Target | Stretch Goal | Deal-Breaker |
|--------|--------|--------------|--------------|
| Landing Page Views | 1,000 | 2,500 | <400 |
| Waitlist Signups | 100 (10%) | 200 (8%) | <40 (4%) |
| Customer Interviews | 10 | 20 | <5 |
| Willingness to Pay | 7/10 students say they'd pay $10/mo | 9/10 would pay | <4/10 would pay |

---

## 🚀 The First 100 Users Playbook

### Acquisition Strategy
Your first users are not found through ads; they are found in the digital trenches where they complain about their homework. Your UE5 visuals are your weapon.

### Channel Breakdown
| Channel | Expected Users | Weekly Effort | Timeline |
|---------|----------------|---------------|----------|
| Reddit r/APStudents | 40-60 | 5 hrs | Weeks 1-2 |
| Teacher Outreach | 20-30 | 7 hrs | Weeks 2-4 |
| Discord/Forums | 20-30 | 4 hrs | Weeks 2-6 |

**Timeline to 100 Users:** 4-6 weeks post-validation.

---

## 💰 Business Model & Economics

### Revenue Model
Freemium Subscription. Give one foundational module (e.g., 1D & 2D Kinematics) away for free to get mass adoption and prove the product's value. The advanced, harder-to-visualize modules are locked behind a subscription.

### Pricing Tiers
- **Free:** Access to the "Classical Mechanics" module. A perfect teaser.
- **Pro ($12/mo or $99/year):** Full access to all modules
- **Classroom ($299/year):** A multi-seat license for teachers

### Your Unfair Advantages
1. **Technical Mastery (UE5/C#):** You possess the exact, high-barrier-to-entry skills required to build a visually stunning and technically sound product.
2. **Passion for the Problem:** Your genuine interest in making education engaging means you will have the stamina and insight to build a product that truly resonates with students.
3. **Founder-Problem Fit:** You are building a tool you wish you had.
`;

console.log("🧪 Testing Blueprint Parser...\n");
console.log("=".repeat(60));

try {
  // Parse the blueprint
  const parsed = parseBlueprint(testBlueprint);

  console.log("\n✅ PARSING SUCCESSFUL!\n");

  // Show basic info
  console.log("📊 BASIC INFO:");
  console.log(`   Project Name: ${parsed.projectName}`);
  console.log(`   Industry: ${parsed.industry || "N/A"}`);
  console.log(`   Target Market: ${parsed.targetMarket || "N/A"}`);
  console.log(`   Business Model: ${parsed.businessModel || "N/A"}`);
  console.log(`   Project Type: ${parsed.projectType || "N/A"}`);
  console.log(`   Blueprint Version: ${parsed.blueprintVersion}`);

  // Show features
  console.log("\n🎯 FEATURES EXTRACTED:");
  if (parsed.features.length > 0) {
    parsed.features.forEach((feature, index) => {
      console.log(`   ${index + 1}. ${feature.name}`);
      console.log(
        `      Priority: ${feature.priority} | Complexity: ${feature.complexity}`
      );
      console.log(
        `      Description: ${feature.description.substring(0, 80)}...`
      );
    });
  } else {
    console.log("   ⚠️  No features extracted");
  }

  // Show tech stack
  console.log("\n💻 TECH STACK EXTRACTED:");
  if (parsed.techStack.length > 0) {
    const grouped = parsed.techStack.reduce(
      (acc, tech) => {
        if (!acc[tech.category]) acc[tech.category] = [];
        acc[tech.category].push(tech.name);
        return acc;
      },
      {} as Record<string, string[]>
    );

    Object.entries(grouped).forEach(([category, techs]) => {
      console.log(`   ${category}: ${techs.join(", ")}`);
    });
  } else {
    console.log("   ⚠️  No tech stack extracted");
  }

  // Show success metrics
  console.log("\n📈 SUCCESS METRICS EXTRACTED:");
  if (parsed.successMetrics.length > 0) {
    parsed.successMetrics.forEach((metric, index) => {
      console.log(
        `   ${index + 1}. ${metric.name}: ${metric.target} (stretch: ${metric.stretchGoal})`
      );
    });
  } else {
    console.log("   ⚠️  No success metrics extracted");
  }

  // Show target user profile
  console.log("\n👥 TARGET USER PROFILE:");
  if (parsed.targetUserProfile) {
    console.log(`   Who: ${parsed.targetUserProfile.who}`);
    console.log(
      `   Current Solution: ${parsed.targetUserProfile.currentSolution}`
    );
    console.log(`   Pain Frequency: ${parsed.targetUserProfile.painFrequency}`);
  } else {
    console.log("   ⚠️  No target user profile extracted");
  }

  // Show pricing tiers
  console.log("\n💰 PRICING TIERS:");
  if (parsed.pricingTiers.length > 0) {
    parsed.pricingTiers.forEach((tier, index) => {
      console.log(`   ${index + 1}. ${tier.name} (${tier.price})`);
    });
  } else {
    console.log("   ⚠️  No pricing tiers extracted");
  }

  // Get stats
  console.log("\n📊 STATISTICS:");
  const stats = getBlueprintStats(parsed);
  console.log(`   Total Features: ${stats.featureCount}`);
  console.log(`   Must-Have Features: ${stats.mustHaveFeatures}`);
  console.log(`   Technologies: ${stats.techCount}`);
  console.log(`   Success Metrics: ${stats.metricsCount}`);
  console.log(`   Has Pricing: ${stats.hasPricing}`);

  // Validate
  console.log("\n✔️  VALIDATION:");
  const validation = validateParsedBlueprint(parsed);
  if (validation.valid) {
    console.log("   ✅ Blueprint is valid!");
  } else {
    console.log("   ⚠️  Blueprint has issues:");
    validation.errors.forEach((error) => console.log(`      - ${error}`));
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ TEST COMPLETE!\n");
} catch (error) {
  console.error("\n❌ PARSING FAILED!");
  console.error(error);
}
