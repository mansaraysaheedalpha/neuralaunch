"use client";

import { motion } from "framer-motion";
import {
  BrainCircuit,
  Rocket,
  Bot,
  Zap,
  Target,
  TrendingUp,
  Award,
  Clock,
  Shield,
  BarChart,
  Users,
  Code,
} from "lucide-react";
import Link from "next/link";
import LandingHeader from "@/components/LandingHeader";
import LandingFooter from "@/components/LandingFooter";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

export default function AboutPage() {
  const features = [
    {
      icon: BrainCircuit,
      title: "AI-Powered Blueprints",
      description:
        "Generate comprehensive startup plans using Google Gemini AI, covering everything from market analysis to unit economics.",
    },
    {
      icon: Clock,
      title: "72-Hour Validation Sprint",
      description:
        "Execute structured, time-boxed validation sprints with AI-assisted tasks to test core assumptions before building.",
    },
    {
      icon: Bot,
      title: "Persistent AI Co-Founder",
      description:
        "Chat with an AI that remembers your entire project history using RAG (Retrieval-Augmented Generation) technology.",
    },
    {
      icon: BarChart,
      title: "Landing Page Builder",
      description:
        "Create and test landing pages with built-in analytics and A/B testing to validate feature interest.",
    },
    {
      icon: Award,
      title: "Gamification System",
      description:
        "Track milestones, unlock achievements, and see how your startup compares on global leaderboards.",
    },
    {
      icon: TrendingUp,
      title: "Market Intelligence",
      description:
        "Get automated niche selection, competitive analysis, and insights into trending startup ideas.",
    },
  ];

  const techStack = [
    {
      category: "Frontend",
      technologies: [
        "Next.js 15 (App Router)",
        "TypeScript (strict mode)",
        "Tailwind CSS",
        "Radix UI + shadcn/ui",
        "Framer Motion",
      ],
    },
    {
      category: "Backend",
      technologies: [
        "Node.js 20+",
        "Next.js API Routes",
        "PostgreSQL 14+ with pgvector",
        "Prisma ORM",
        "NextAuth (v5)",
      ],
    },
    {
      category: "AI & ML",
      technologies: [
        "Google Gemini (gemini-1.5-flash, gemini-1.5-pro)",
        "OpenAI GPT-4",
        "pgvector for RAG",
        "OpenAI Embeddings",
      ],
    },
  ];

  return (
    <div className="pt-20 min-h-screen bg-background">
      <LandingHeader />
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-primary/5 via-background to-background">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="max-w-5xl mx-auto text-center"
        >
          <motion.div variants={fadeIn} className="mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-6 bg-gradient-to-br from-primary to-secondary rounded-2xl">
              <Rocket className="w-10 h-10 text-primary-foreground" />
            </div>
          </motion.div>
          <motion.h1
            variants={fadeIn}
            className="text-5xl md:text-6xl font-black tracking-tight text-foreground mb-6"
          >
            About NeuraLaunch
          </motion.h1>
          <motion.p
            variants={fadeIn}
            className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-8"
          >
            Transform ideas into validated startups with AI-powered precision.
            We combine intelligent blueprints with structured validation sprints
            to empower founders worldwide.
          </motion.p>
        </motion.div>
      </section>

      {/* Mission Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.h2
              variants={fadeIn}
              className="text-4xl font-bold tracking-tight text-foreground mb-6 text-center"
            >
              Our Mission
            </motion.h2>
            <motion.div
              variants={fadeIn}
              className="prose prose-lg dark:prose-invert mx-auto text-center max-w-3xl"
            >
              <p className="text-xl text-muted-foreground leading-relaxed">
                Too many startups fail because they build products nobody wants.
                NeuraLaunch exists to change that narrative. We empower founders
                to validate their ideas rigorously before committing time and
                resources to development, combining the strategic guidance of a
                Y Combinator partner with the execution framework of lean
                startup methodology.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Key Features Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/30 dark:bg-slate-800/30">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.h2
              variants={fadeIn}
              className="text-4xl font-bold tracking-tight text-foreground mb-12 text-center"
            >
              What We Offer
            </motion.h2>
            <motion.div
              variants={staggerContainer}
              className="grid md:grid-cols-2 lg:grid-cols-3 gap-8"
            >
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  variants={fadeIn}
                  className="p-6 bg-card dark:bg-slate-800 border border-border rounded-xl shadow-sm hover:shadow-md transition-shadow"
                >
                  <feature.icon className="w-12 h-12 text-primary mb-4" />
                  <h3 className="text-xl font-semibold text-foreground mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.h2
              variants={fadeIn}
              className="text-4xl font-bold tracking-tight text-foreground mb-12 text-center"
            >
              How It Works
            </motion.h2>
            <div className="space-y-12">
              <motion.div
                variants={fadeIn}
                className="flex gap-6 items-start"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-xl">
                  1
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-foreground mb-3">
                    Define Your Spark
                  </h3>
                  <p className="text-lg text-muted-foreground">
                    Input your skills, passions, or initial idea. Our AI
                    analyzes your unique potential and generates tailored
                    startup opportunities.
                  </p>
                </div>
              </motion.div>
              <motion.div
                variants={fadeIn}
                className="flex gap-6 items-start"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-xl">
                  2
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-foreground mb-3">
                    Receive AI Blueprint
                  </h3>
                  <p className="text-lg text-muted-foreground">
                    Get a comprehensive startup plan covering validation
                    strategy, go-to-market approach, competitive moat, and unit
                    economics projections.
                  </p>
                </div>
              </motion.div>
              <motion.div
                variants={fadeIn}
                className="flex gap-6 items-start"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-xl">
                  3
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-foreground mb-3">
                    Execute Validation Sprint
                  </h3>
                  <p className="text-lg text-muted-foreground">
                    Follow a structured 72-hour validation plan with AI
                    assistance to test your core assumptions and gather
                    real-world feedback.
                  </p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Technology Stack Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/30 dark:bg-slate-800/30">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.h2
              variants={fadeIn}
              className="text-4xl font-bold tracking-tight text-foreground mb-12 text-center"
            >
              Built with Modern Technology
            </motion.h2>
            <motion.div
              variants={staggerContainer}
              className="grid md:grid-cols-3 gap-8"
            >
              {techStack.map((stack, index) => (
                <motion.div
                  key={index}
                  variants={fadeIn}
                  className="p-6 bg-card dark:bg-slate-800 border border-border rounded-xl"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <Code className="w-6 h-6 text-primary" />
                    <h3 className="text-xl font-semibold text-foreground">
                      {stack.category}
                    </h3>
                  </div>
                  <ul className="space-y-2">
                    {stack.technologies.map((tech, techIndex) => (
                      <li
                        key={techIndex}
                        className="text-muted-foreground flex items-center gap-2"
                      >
                        <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
                        {tech}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Security & Performance Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 gap-8"
          >
            <motion.div
              variants={fadeIn}
              className="p-8 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-xl"
            >
              <Shield className="w-12 h-12 text-green-600 dark:text-green-400 mb-4" />
              <h3 className="text-2xl font-bold text-foreground mb-4">
                A+ Security Rating
              </h3>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  Input validation with Zod schemas
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  Configurable rate limiting
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  XSS & CSRF protection
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  Secure session management
                </li>
              </ul>
            </motion.div>
            <motion.div
              variants={fadeIn}
              className="p-8 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl"
            >
              <Zap className="w-12 h-12 text-blue-600 dark:text-blue-400 mb-4" />
              <h3 className="text-2xl font-bold text-foreground mb-4">
                A+ Performance Rating
              </h3>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-blue-600 dark:text-blue-400">✓</span>
                  Optimized database indexes
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600 dark:text-blue-400">✓</span>
                  Smart response caching
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600 dark:text-blue-400">✓</span>
                  Code splitting & lazy loading
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600 dark:text-blue-400">✓</span>
                  Connection pooling
                </li>
              </ul>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/30 dark:bg-slate-800/30">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.h2
              variants={fadeIn}
              className="text-4xl font-bold tracking-tight text-foreground mb-6"
            >
              Built for Founders, by Founders
            </motion.h2>
            <motion.p
              variants={fadeIn}
              className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8"
            >
              NeuraLaunch was created by entrepreneurs who understand the
              challenges of building a startup. We&apos;ve experienced the pain of
              building the wrong thing and are committed to helping others avoid
              that mistake.
            </motion.p>
            <motion.div variants={fadeIn} className="flex items-center justify-center gap-3">
              <Users className="w-6 h-6 text-primary" />
              <p className="text-muted-foreground">
                Created with ❤️ by the NeuraLaunch team
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.h2
              variants={fadeIn}
              className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-6"
            >
              Ready to Validate Your Vision?
            </motion.h2>
            <motion.p
              variants={fadeIn}
              className="text-xl text-muted-foreground mb-10"
            >
              Join founders worldwide who are building validated startups with
              NeuraLaunch.
            </motion.p>
            <motion.div variants={fadeIn}>
              <Link href="/generate">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-primary to-secondary text-primary-foreground rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all"
                >
                  Start Generating
                  <Target className="w-5 h-5" />
                </motion.button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>
      <LandingFooter />
    </div>
  );
}
