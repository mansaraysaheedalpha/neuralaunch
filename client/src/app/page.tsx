"use client"; // This landing page uses animations and interactive elements

import Link from "next/link";
// Add imports for scroll animations
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react"; // Import useRef
import {
  ArrowRight,
  BrainCircuit,
  Rocket,
  CheckCircle,
  Zap,
  FileText,
  Bot,
} from "lucide-react";
import LandingHeader from "@/components/LandingHeader";
import LandingFooter from "@/components/LandingFooter";
import HeroBackgroundGradient from "@/components/HeroBackgroundGradient";
import HeroForegroundGrid from "@/components/HeroForegroundGrid";
import HeroForegroundStreaks from "@/components/HeroForegroundStreaks";

// --- Animation Variants ---
const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};
const wordVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      damping: 12,
      stiffness: 100,
    },
  },
};
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.1,
    },
  },
};

const featureIconVariants = {
  rest: { scale: 1, rotate: 0 },
  hover: {
    scale: 1.1,
    rotate: 10,
    transition: { type: "spring", stiffness: 300 },
  },
};

// --- Add Icon Animation Variants ---
const iconPopIn = {
  hidden: { scale: 0.5, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 20,
      delay: 0.3, // Small delay after card fades in
    },
  },
};

// --- Section Components ---

const HeroSection = () => {
  const headlineWords = "Build the Right Thing, Faster.".split(" ");
  const primaryWordIndex = 5;
  return (
    <section className="relative overflow-hidden py-32 md:py-48 text-center">
      <HeroBackgroundGradient />
      <HeroForegroundGrid />
      <HeroForegroundStreaks />
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="relative z-10 max-w-4xl mx-auto px-4"
      >
        {/* Animated Headline */}
        <motion.h1
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="text-6xl md:text-8xl font-black tracking-tighter text-foreground mb-6 leading-tight"
        >
          {headlineWords.map((word, index) => (
            <motion.span
              key={index}
              variants={wordVariants}
              className={`inline-block ${
                index === primaryWordIndex ? "text-primary" : ""
              } mr-[0.25em]`}
            >
              {word}
            </motion.span>
          ))}
        </motion.h1>
        {/* Sub-headline */}
        <motion.p
          variants={fadeIn}
          className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto"
        >
          NeuraLaunch combines AI-driven blueprints with a structured validation
          sprint, empowering founders to turn visionary ideas into market-ready
          startups.
        </motion.p>
        {/* Button */}
        <motion.div variants={fadeIn}>
          <Link href="/generate" passHref>
            <motion.span
              whileHover={{
                scale: 1.05,
                boxShadow: "0px 10px 20px hsla(var(--primary), 0.3)",
              }}
              whileTap={{ scale: 0.95 }}
              className="text-2xl inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-primary to-secondary text-primary-foreground rounded-xl font-semibold shadow-lg transition-all duration-300 cursor-pointer"
            >
              Generate Your Blueprint
              <ArrowRight className="w-5 h-5" />
            </motion.span>
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
};

// --- ProblemSolutionSection with Symmetrical Cards and Simplified Scroll Animation ---
const ProblemSolutionSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "center center"],
  });

  const problemOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.7]);
  const solutionOpacity = useTransform(scrollYProgress, [0, 1], [0.7, 1]);
  const lineScaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  // --- NEW Transforms for Background Graphics Opacity ---
  const chaosGraphicOpacity = useTransform(scrollYProgress, [0, 1], [0.6, 0]); // Chaos fades out
  const orderGraphicOpacity = useTransform(scrollYProgress, [0, 1], [0, 0.6]); // Order fades in

  return (
    <section
      ref={sectionRef}
      className="py-24 md:py-32 bg-background dark:bg-slate-900 overflow-hidden relative"
    >
      {/* Animated Dividing Line */}
      <motion.div
        className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-gradient-to-b from-transparent via-primary/50 to-transparent hidden md:block"
        style={{
          scaleY: lineScaleY,
          transformOrigin: "top",
          translateX: "-50%",
        }}
      />

      {/* Content Grid */}
      <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-2 gap-12 md:gap-16 items-center relative z-10">
        {/* Problem Side Card */}
        <motion.div
          style={{ opacity: problemOpacity }}
          className="p-8 border border-border rounded-xl bg-card dark:bg-slate-800/50 shadow-sm md:pr-8 relative overflow-hidden" // Added relative & overflow-hidden
        >
          {/* --- CHAOS/COMPLEXITY GRAPHIC --- */}
          <motion.div
            style={{ opacity: chaosGraphicOpacity }}
            className="absolute inset-0 bg-[url('/noise-texture.svg')] bg-repeat opacity-60 mix-blend-overlay dark:mix-blend-lighten pointer-events-none z-0" // Example chaos graphic
          />
          {/* ---------------------------------- */}
          <div className="relative z-10">
            {" "}
            {/* Wrap content to keep it above graphic */}
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
              Stop Building in the Dark.
            </h2>
            <p className="text-xl text-muted-foreground mb-6">
              Countless startups fail because they build products nobody wants.
              Wasted time, drained resources, and broken dreams are the result
              of poor validation.
            </p>
            <div className="flex flex-wrap gap-4 text-muted-foreground">
              <span className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-red-500" /> Wasted Engineering
                Hours
              </span>
              <span className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-red-500" /> Missed Market
                Opportunities
              </span>
            </div>
          </div>
        </motion.div>

        {/* Solution Side Card */}
        <motion.div
          style={{ opacity: solutionOpacity }}
          className="p-8 border border-border rounded-xl bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5 dark:from-primary/10 dark:via-secondary/10 dark:to-accent/10 shadow-sm md:pl-8 relative overflow-hidden" // Added relative & overflow-hidden
        >
          {/* --- ORDER/CLARITY GRAPHIC --- */}
          <motion.div
            style={{ opacity: orderGraphicOpacity }}
            className="absolute inset-0 bg-[radial-gradient(#301934_1px,transparent_1px)] [background-size:16px_16px] opacity-60 mix-blend-overlay dark:mix-blend-lighten pointer-events-none z-0" // Example order graphic (faint grid)
          />
          {/* ------------------------------- */}
          <div className="relative z-10">
            {" "}
            {/* Wrap content to keep it above graphic */}
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
              Validate with AI Precision.
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground mb-4">
              NeuraLaunch provides an AI-architected blueprint and a rigorous
              72-hour sprint to ensure you're building a solution for a real,
              validated market need *before* you write a line of code.
            </p>
            <div className="flex flex-wrap gap-4 text-primary font-medium">
              <span className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" /> Data-Driven Decisions
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" /> Faster Time-to-Market
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

// --- HowItWorksSection ---
const HowItWorksSection = () => {
  const steps = [
    {
      icon: BrainCircuit,
      title: "Define Your Spark",
      description:
        "Input your skills, passions, or initial idea. Our AI analyzes your unique potential.",
    },
    {
      icon: FileText,
      title: "Receive AI Blueprint",
      description:
        "Get a comprehensive startup plan covering validation, GTM, moat, and economics.",
    },
    {
      icon: Rocket,
      title: "Execute Validation Sprint",
      description:
        "Follow a structured 72-hour plan with AI assistance to test your core assumptions.",
    },
  ];

  const gridRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: gridRef,
    offset: ["start end", "center center"],
  });
  const line1ScaleX = useTransform(scrollYProgress, [0, 0.5], [0, 1]);
  const line2ScaleX = useTransform(scrollYProgress, [0.5, 1], [0, 1]);

  return (
    <section className="py-24 bg-muted/30 dark:bg-slate-800/30 overflow-hidden">
      {" "}
      {/* Added overflow-hidden */}
      <div className="max-w-5xl mx-auto px-4 text-center">
        <motion.h2
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-5xl md:text-6xl font-bold tracking-tight text-foreground mb-4"
        >
          How NeuraLaunch Works
        </motion.h2>
        <motion.p
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          transition={{ delay: 0.1 }}
          className="text-xl md:text-2xl text-muted-foreground mb-16 max-w-2xl mx-auto"
        >
          From initial concept to validated idea in three streamlined steps.
        </motion.p>

        {/* --- Grid Container - ADD REF and RELATIVE --- */}
        <motion.div
          ref={gridRef} // Attach ref here
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="grid md:grid-cols-3 gap-8 relative" // <<< Added relative positioning
        >
          {/* --- Animated Connecting Lines (Hidden below md breakpoint) --- */}
          {/* Line between card 1 and 2 */}
          <motion.div
            className="absolute top-1/2 left-[calc(16.66%+1rem)] w-[calc(33.33%-2rem)] h-[2px] bg-gradient-to-r from-primary/50 to-primary/50 hidden md:block" // Position and style
            style={{
              scaleX: line1ScaleX, // Animate horizontal scale
              transformOrigin: "left", // Scale from left to right
              translateY: "-50%", // Center vertically
            }}
          />
          {/* Line between card 2 and 3 */}
          <motion.div
            className="absolute top-1/2 left-[calc(50%+1rem)] w-[calc(33.33%-2rem)] h-[2px] bg-gradient-to-r from-primary/50 to-primary/50 hidden md:block" // Position and style
            style={{
              scaleX: line2ScaleX, // Animate horizontal scale
              transformOrigin: "left", // Scale from left to right
              translateY: "-50%", // Center vertically
            }}
          />
          {/* ---------------------------------------------------------------- */}

          {/* Map through steps (cards) */}
          {steps.map((step, index) => (
            <motion.div
              variants={fadeIn}
              key={index}
              whileHover={{
                scale: 1.03,
                boxShadow: "0px 10px 20px -5px hsla(var(--primary), 0.2)",
                transition: { type: "spring", stiffness: 300 },
              }}
              className="p-8 bg-card dark:bg-slate-800 border border-border rounded-xl shadow-sm text-left cursor-pointer relative z-10" // <<< Added relative z-10 to keep cards above lines
            >
              <motion.div
                variants={iconPopIn} // Use the new pop-in animation
                className="mb-4 inline-block" // Wrap icon to animate independently
              >
                <step.icon className="w-12 h-12 text-primary" />
              </motion.div>
              <h3 className="text-2xl font-semibold text-foreground mb-2">
                {step.title}
              </h3>
              <p className="text-base text-muted-foreground">
                {step.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

// --- FeaturesSection ---
const FeaturesSection = () => {
  const features = [
    {
      icon: FileText,
      title: "AI Architect Blueprints",
      description:
        "Receive detailed, actionable startup plans generated by AI, covering everything from niche selection to unit economics.",
    },
    {
      icon: Zap,
      title: "72-Hour Validation Sprint",
      description:
        "Execute a structured, time-boxed sprint with AI-assisted tasks designed to rigorously test your core assumptions.",
    },
    {
      icon: Bot,
      title: "Persistent AI Co-Pilot",
      description:
        "Chat with your AI cofounder that remembers your project context, analyzes data, and provides strategic guidance.",
    },
  ];

  return (
    <section className="py-24 bg-background dark:bg-slate-900">
      <div className="max-w-6xl mx-auto px-4 perspective-[1000px]">
        <motion.h2
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-5xl md:text-6xl font-bold tracking-tight text-foreground text-center mb-16"
        >
          Powered by Intelligent Tools
        </motion.h2>
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="grid md:grid-cols-3 gap-8"
        >
          {features.map((feature, index) => (
            <motion.div
              variants={fadeIn}
              key={index}
              whileHover={{
                rotateX: 5,
                rotateY: index === 0 ? -5 : index === 2 ? 5 : 0,
                transition: { type: "spring", stiffness: 300, damping: 20 },
                // Removed y and boxShadow from here, will handle via CSS
              }}
              // --- ADD GRADIENT SHIFT CLASS ---
              className="feature-card p-8 rounded-xl border border-border bg-card dark:bg-slate-800/50 transition-all duration-300 group cursor-pointer relative hover:border-primary/50" // Added 'feature-card'
              // ---------------------------------
            >
              {/* Inner wrapper (keep this) */}
              <motion.div
                className="relative z-10"
                // whileHover={{ rotateX: -3, rotateY: index === 0 ? 3 : index === 2 ? -3 : 0 }} // Keep commented or uncomment if desired
              >
                {/* Icon animation (remains the same) */}
                <motion.div
                  variants={featureIconVariants}
                  whileHover="hover"
                  initial="rest"
                  className="inline-block mb-5"
                >
                  <feature.icon className="w-12 h-12 text-primary transition-transform duration-300" />
                </motion.div>
                <h3 className="text-2xl font-semibold text-foreground mb-4">
                  {feature.title}
                </h3>
                <p className="text-base text-muted-foreground">
                  {feature.description}
                </p>
              </motion.div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};
// --- FinalCTASection ---
const FinalCTASection = () => (
  <section className="py-32 md:py-40 bg-gradient-to-t from-background via-violet-50/10 to-purple-50/10 dark:from-slate-900 dark:via-slate-800/30 dark:to-slate-900 text-center">
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
    >
      <motion.h2
        variants={fadeIn}
        className="text-5xl md:text-6xl font-black tracking-tight text-foreground mb-6"
      >
        Ready to Validate Your Vision?
      </motion.h2>
      <motion.p
        variants={fadeIn}
        className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-xl mx-auto"
      >
        {" "}
        {/* Increased bottom margin */}
        Stop guessing, start validating. Get your AI-powered blueprint and
        launch your startup with confidence.
      </motion.p>
      <motion.div variants={fadeIn}>
        <Link href="/generate" passHref>
          <motion.span
            whileHover={{
              scale: 1.05,
              boxShadow: "0px 10px 20px hsla(var(--primary), 0.3)",
            }}
            whileTap={{ scale: 0.95 }}
            // --- ADD GLOWING/BREATHING ANIMATION ---
            animate={{
              scale: [1, 1.02, 1], // Subtle scale pulse
              boxShadow: [
                "0px 0px 0px 0px hsla(var(--primary), 0.4)", // No glow
                "0px 0px 15px 5px hsla(var(--primary), 0.6)", // Max glow
                "0px 0px 0px 0px hsla(var(--primary), 0.4)", // Back to subtle glow/no glow
              ],
            }}
            transition={{
              duration: 2.5, // Duration of one cycle
              ease: "easeInOut",
              repeat: Infinity, // Loop forever
              repeatDelay: 1, // Pause slightly between pulses
            }}
            // ----------------------------------------
            className="inline-flex items-center gap-2 px-10 py-5 bg-gradient-to-r from-primary to-secondary text-primary-foreground  md:text-xl rounded-xl font-semibold text-lg shadow-lg transition-all duration-300 cursor-pointer"
          >
            Start Generating
            <ArrowRight className="w-6 h-6" />
          </motion.span>
        </Link>
      </motion.div>
    </motion.div>
  </section>
);

// --- Main Page Component ---
export default function LandingPage() {
  return (
    <div className="pt-20">
      <LandingHeader />
      <HeroSection />
      <ProblemSolutionSection /> {/* Removed scroll animation imports/logic */}
      <HowItWorksSection />
      <FeaturesSection />
      <FinalCTASection />
      <LandingFooter />
    </div>
  );
}
