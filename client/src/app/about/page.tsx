"use client";

import { motion, useScroll, useTransform, useInView } from "framer-motion";
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
  Sparkles,
  Globe,
  Heart,
  Star,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { useRef, useEffect, useState, useMemo } from "react";
import LandingHeader from "@/components/LandingHeader";
import LandingFooter from "@/components/LandingFooter";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.42, 0, 0.58, 1] as const },
  },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: [0.42, 0, 0.58, 1] as const },
  },
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

const floatingAnimation = {
  y: [0, -20, 0],
  transition: {
    duration: 3,
    repeat: Infinity,
    ease: [0.42, 0, 0.58, 1] as const,
  },
};

// Animated Counter Component
const AnimatedCounter = ({
  end,
  duration = 2,
  suffix = "",
}: {
  end: number;
  duration?: number;
  suffix?: string;
}) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (isInView) {
      let startTime: number;
      let animationFrame: number;

      const animate = (currentTime: number) => {
        if (!startTime) startTime = currentTime;
        const progress = Math.min(
          (currentTime - startTime) / (duration * 1000),
          1
        );

        setCount(Math.floor(progress * end));

        if (progress < 1) {
          animationFrame = requestAnimationFrame(animate);
        }
      };

      animationFrame = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animationFrame);
    }
  }, [isInView, end, duration]);

  return (
    <span ref={ref}>
      {count}
      {suffix}
    </span>
  );
};

export default function AboutPage() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.8]);

  const features = [
    {
      icon: BrainCircuit,
      title: "AI-Powered Blueprints",
      description:
        "Generate comprehensive startup plans using Google Gemini AI, covering everything from market analysis to unit economics.",
      gradient: "from-violet-500 to-purple-600",
    },
    {
      icon: Clock,
      title: "72-Hour Validation Sprint",
      description:
        "Execute structured, time-boxed validation sprints with AI-assisted tasks to test core assumptions before building.",
      gradient: "from-blue-500 to-cyan-600",
    },
    {
      icon: Bot,
      title: "Persistent AI Co-Founder",
      description:
        "Chat with an AI that remembers your entire project history using RAG (Retrieval-Augmented Generation) technology.",
      gradient: "from-pink-500 to-rose-600",
    },
    {
      icon: BarChart,
      title: "Landing Page Builder",
      description:
        "Create and test landing pages with built-in analytics and A/B testing to validate feature interest.",
      gradient: "from-green-500 to-emerald-600",
    },
    {
      icon: Award,
      title: "Gamification System",
      description:
        "Track milestones, unlock achievements, and see how your startup compares on global leaderboards.",
      gradient: "from-yellow-500 to-orange-600",
    },
    {
      icon: TrendingUp,
      title: "Market Intelligence",
      description:
        "Get automated niche selection, competitive analysis, and insights into trending startup ideas.",
      gradient: "from-indigo-500 to-blue-600",
    },
  ];

  const techStack = [
    {
      category: "Frontend",
      icon: Code,
      technologies: [
        "Next.js 15 (App Router)",
        "TypeScript (strict mode)",
        "Tailwind CSS",
        "Radix UI + shadcn/ui",
        "Framer Motion",
      ],
      color: "from-blue-400 to-cyan-500",
    },
    {
      category: "Backend",
      icon: Globe,
      technologies: [
        "Node.js 20+",
        "Next.js API Routes",
        "PostgreSQL 14+ with pgvector",
        "Prisma ORM",
        "NextAuth (v5)",
      ],
      color: "from-green-400 to-emerald-500",
    },
    {
      category: "AI & ML",
      icon: Sparkles,
      technologies: [
        "Google Gemini (gemini-1.5-flash, gemini-1.5-pro)",
        "OpenAI GPT-4",
        "pgvector for RAG",
        "OpenAI Embeddings",
      ],
      color: "from-purple-400 to-pink-500",
    },
  ];

  const stats = [
    { value: 500, suffix: "+", label: "Startups Validated", icon: Rocket },
    { value: 72, suffix: "hr", label: "Average Sprint Time", icon: Clock },
    { value: 95, suffix: "%", label: "Success Rate", icon: Target },
    { value: 50, suffix: "K+", label: "Ideas Generated", icon: BrainCircuit },
  ];

  const journey = [
    {
      year: "2024",
      title: "The Beginning",
      description:
        "NeuraLaunch was born from the frustration of seeing too many startups fail by building products nobody wanted.",
      icon: Sparkles,
    },
    {
      year: "Q1",
      title: "AI Blueprint Launch",
      description:
        "Launched our AI-powered startup blueprint generator, helping founders create comprehensive validation plans.",
      icon: BrainCircuit,
    },
    {
      year: "Q2",
      title: "Validation Sprint",
      description:
        "Introduced the 72-hour validation sprint framework, revolutionizing how founders test assumptions.",
      icon: Clock,
    },
    {
      year: "Present",
      title: "Global Impact",
      description:
        "Empowering founders worldwide with AI-driven insights and structured validation methodologies.",
      icon: Globe,
    },
  ];

  return (
    <div className="pt-20 min-h-screen bg-background relative overflow-hidden">
      <LandingHeader />

      {/* Ambient Background Elements */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-primary/5 rounded-full blur-[120px] animate-pulse" />
        <div
          className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-secondary/5 rounded-full blur-[120px] animate-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/3 h-1/3 bg-accent/5 rounded-full blur-[100px] animate-pulse"
          style={{ animationDelay: "2s" }}
        />
      </div>

      {/* Hero Section with 3D Effects */}
      <section
        ref={heroRef}
        className="relative overflow-hidden py-27.5 px-4 sm:px-6 lg:px-8"
      >
        <motion.div
          style={{ opacity: heroOpacity, scale: heroScale }}
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="max-w-6xl mx-auto text-center relative z-10"
        >
          <motion.div variants={scaleIn} className="mb-8 py-5 mt-7">
            <motion.div
              animate={floatingAnimation}
              className="inline-flex items-center justify-center w-28 h-28 mb-6 bg-gradient-to-br from-primary via-secondary to-accent rounded-3xl shadow-2xl relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-3xl blur-xl animate-pulse" />
              <Rocket className="w-14 h-14 text-primary-foreground relative z-10" />
            </motion.div>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight mb-6 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent"
          >
            About NeuraLaunch
          </motion.h1>

          <motion.div variants={fadeIn} className="relative inline-block">
            <p className="text-2xl md:text-3xl text-muted-foreground max-w-4xl mx-auto mb-8 leading-relaxed">
              Transform ideas into validated startups with{" "}
              <span className="text-primary font-semibold">
                AI-powered precision
              </span>
              . We combine intelligent blueprints with structured validation
              sprints to empower founders worldwide.
            </p>
          </motion.div>

          {/* Floating Decorative Elements */}
          <motion.div
            animate={{ y: [0, -10, 0], rotate: [0, 5, 0] }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: [0.42, 0, 0.58, 1],
            }}
            className="absolute top-20 left-10 opacity-20"
          >
            <Sparkles className="w-8 h-8 text-primary" />
          </motion.div>
          <motion.div
            animate={{ y: [0, 10, 0], rotate: [0, -5, 0] }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: [0.42, 0, 0.58, 1],
              delay: 1,
            }}
            className="absolute bottom-20 right-10 opacity-20"
          >
            <Star className="w-12 h-12 text-secondary" />
          </motion.div>
        </motion.div>

        {/* Gradient Orbs */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-primary/20 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-l from-secondary/20 to-transparent rounded-full blur-3xl" />
        </div>
      </section>

      {/* Animated Stats Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={staggerContainer}
            className="grid grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                variants={scaleIn}
                whileHover={{ scale: 1.05, y: -5 }}
                className="relative group"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8 text-center shadow-lg">
                  <stat.icon className="w-10 h-10 text-primary mx-auto mb-4" />
                  <div className="text-4xl md:text-5xl font-black text-foreground mb-2">
                    <AnimatedCounter end={stat.value} suffix={stat.suffix} />
                  </div>
                  <div className="text-sm text-muted-foreground font-medium">
                    {stat.label}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Mission Section with Glassmorphism */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="relative"
          >
            <motion.div variants={fadeInUp} className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full mb-6">
                <Target className="w-5 h-5 text-primary" />
                <span className="text-sm font-semibold text-primary">
                  Our Mission
                </span>
              </div>
              <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
                Building the Future of
                <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  {" "}
                  Startup Validation
                </span>
              </h2>
            </motion.div>

            <motion.div
              variants={fadeIn}
              className="relative backdrop-blur-xl bg-gradient-to-br from-card/80 to-card/40 border border-border/50 rounded-3xl p-10 md:p-12 shadow-2xl overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
              <div className="relative z-10">
                <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed mb-6">
                  Too many startups fail because they build products nobody
                  wants. NeuraLaunch exists to change that narrative.
                </p>
                <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                  We empower founders to validate their ideas rigorously before
                  committing time and resources to development, combining the
                  strategic guidance of a Y Combinator partner with the
                  execution framework of lean startup methodology.
                </p>
              </div>

              {/* Decorative Corner Elements */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-bl-full" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-secondary/20 to-transparent rounded-tr-full" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Interactive Journey Timeline */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp} className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
                Our Journey
              </h2>
              <p className="text-xl text-muted-foreground">
                From vision to reality
              </p>
            </motion.div>

            <div className="relative">
              {/* Timeline Line */}
              <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-gradient-to-b from-primary via-secondary to-accent hidden md:block" />

              {/* Timeline Items */}
              {journey.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.2 }}
                  className={`relative mb-16 md:mb-20 flex items-center ${
                    index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                  }`}
                >
                  {/* Content Card */}
                  <div className="flex-1 md:w-5/12">
                    <motion.div
                      whileHover={{ scale: 1.03, y: -5 }}
                      className="relative group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="relative bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 shadow-lg">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center">
                            <item.icon className="w-5 h-5 text-primary-foreground" />
                          </div>
                          <span className="text-sm font-bold text-primary">
                            {item.year}
                          </span>
                        </div>
                        <h3 className="text-xl font-bold text-foreground mb-2">
                          {item.title}
                        </h3>
                        <p className="text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </motion.div>
                  </div>

                  {/* Center Icon */}
                  <div className="hidden md:flex md:w-2/12 justify-center">
                    <motion.div
                      whileHover={{ scale: 1.2, rotate: 360 }}
                      transition={{ duration: 0.6 }}
                      className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center shadow-lg z-10 border-4 border-background"
                    >
                      <CheckCircle2 className="w-6 h-6 text-primary-foreground" />
                    </motion.div>
                  </div>

                  {/* Spacer for alternating layout */}
                  <div className="hidden md:block md:w-5/12" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Key Features Section with 3D Cards */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.h2
              variants={fadeInUp}
              className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-16 text-center"
            >
              What Makes Us{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Different
              </span>
            </motion.h2>
            <motion.div
              variants={staggerContainer}
              className="grid md:grid-cols-2 lg:grid-cols-3 gap-8"
            >
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  variants={scaleIn}
                  whileHover={{
                    y: -10,
                    rotateX: 5,
                    rotateY: index % 3 === 0 ? -5 : index % 3 === 2 ? 5 : 0,
                  }}
                  className="group relative"
                  style={{ perspective: "1000px" }}
                >
                  {/* Glow Effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-2xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  {/* Card */}
                  <div className="relative bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8 shadow-lg overflow-hidden h-full">
                    {/* Gradient Overlay */}
                    <div
                      className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${feature.gradient}`}
                    />

                    {/* Animated Icon Background */}
                    <motion.div
                      animate={{
                        scale: [1, 1.2, 1],
                        rotate: [0, 10, 0],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: [0.42, 0, 0.58, 1],
                      }}
                      className="absolute -top-8 -right-8 w-32 h-32 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-2xl"
                    />

                    {/* Icon */}
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      className={`w-16 h-16 bg-gradient-to-br ${feature.gradient} rounded-xl flex items-center justify-center mb-6 shadow-lg relative z-10`}
                    >
                      <feature.icon className="w-8 h-8 text-white" />
                    </motion.div>

                    {/* Content */}
                    <h3 className="text-2xl font-bold text-foreground mb-4 relative z-10">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed relative z-10">
                      {feature.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* How It Works Section with Interactive Steps */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-transparent via-muted/20 to-transparent">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.h2
              variants={fadeInUp}
              className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-16 text-center"
            >
              How It Works
            </motion.h2>
            <div className="space-y-8">
              {[
                {
                  step: 1,
                  title: "Define Your Spark",
                  description:
                    "Input your skills, passions, or initial idea. Our AI analyzes your unique potential and generates tailored startup opportunities.",
                  icon: Sparkles,
                  color: "from-violet-500 to-purple-600",
                },
                {
                  step: 2,
                  title: "Receive AI Blueprint",
                  description:
                    "Get a comprehensive startup plan covering validation strategy, go-to-market approach, competitive moat, and unit economics projections.",
                  icon: BrainCircuit,
                  color: "from-blue-500 to-cyan-600",
                },
                {
                  step: 3,
                  title: "Execute Validation Sprint",
                  description:
                    "Follow a structured 72-hour validation plan with AI assistance to test your core assumptions and gather real-world feedback.",
                  icon: Rocket,
                  color: "from-pink-500 to-rose-600",
                },
              ].map((item, index) => (
                <motion.div
                  key={index}
                  variants={fadeInUp}
                  whileHover={{ x: 10 }}
                  className="flex gap-6 items-start group"
                >
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: 360 }}
                    transition={{ duration: 0.6 }}
                    className={`flex-shrink-0 w-16 h-16 bg-gradient-to-br ${item.color} text-white rounded-2xl flex items-center justify-center font-bold text-2xl shadow-xl relative overflow-hidden`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <item.icon className="w-8 h-8" />
                  </motion.div>
                  <div className="flex-1 relative">
                    <div className="absolute -left-8 top-4 w-0.5 h-full bg-gradient-to-b from-primary/50 to-transparent hidden lg:block" />
                    <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-3 flex items-center gap-3">
                      {item.title}
                      <span className="text-sm text-muted-foreground font-normal">
                        Step {item.step}
                      </span>
                    </h3>
                    <p className="text-lg text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Technology Stack Section with Animated Cards */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp} className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full mb-6">
                <Code className="w-5 h-5 text-primary" />
                <span className="text-sm font-semibold text-primary">
                  Technology
                </span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
                Built with Modern Technology
              </h2>
              <p className="text-xl text-muted-foreground">
                Cutting-edge tools for cutting-edge solutions
              </p>
            </motion.div>
            <motion.div
              variants={staggerContainer}
              className="grid md:grid-cols-3 gap-8"
            >
              {techStack.map((stack, index) => (
                <motion.div
                  key={index}
                  variants={scaleIn}
                  whileHover={{ y: -10, scale: 1.02 }}
                  className="relative group"
                >
                  {/* Animated Background */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${stack.color} opacity-0 group-hover:opacity-10 rounded-2xl blur-xl transition-opacity duration-500`}
                  />

                  {/* Card */}
                  <div className="relative bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8 shadow-lg h-full">
                    <div className="flex items-center gap-4 mb-6">
                      <div
                        className={`w-14 h-14 bg-gradient-to-br ${stack.color} rounded-xl flex items-center justify-center shadow-lg`}
                      >
                        <stack.icon className="w-7 h-7 text-white" />
                      </div>
                      <h3 className="text-2xl font-bold text-foreground">
                        {stack.category}
                      </h3>
                    </div>
                    <ul className="space-y-3">
                      {stack.technologies.map((tech, techIndex) => (
                        <motion.li
                          key={techIndex}
                          initial={{ opacity: 0, x: -10 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          transition={{ delay: techIndex * 0.1 }}
                          className="flex items-center gap-3 text-muted-foreground group/item"
                        >
                          <div className="w-2 h-2 bg-gradient-to-r from-primary to-secondary rounded-full group-hover/item:scale-150 transition-transform" />
                          <span className="group-hover/item:text-foreground transition-colors">
                            {tech}
                          </span>
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Security & Performance Section with Animated Icons */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 gap-8"
          >
            <motion.div
              variants={scaleIn}
              whileHover={{ scale: 1.03, y: -5 }}
              className="relative group overflow-hidden rounded-3xl"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-emerald-500/10 to-teal-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative p-10 bg-gradient-to-br from-green-50/50 to-emerald-50/50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200/50 dark:border-green-800/50 backdrop-blur-sm">
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                  }}
                  className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg"
                >
                  <Shield className="w-8 h-8 text-white" />
                </motion.div>
                <h3 className="text-3xl font-black text-foreground mb-6 flex items-center gap-3">
                  A+ Security Rating
                  <motion.span
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-2xl"
                  >
                    🛡️
                  </motion.span>
                </h3>
                <ul className="space-y-4">
                  {[
                    "Input validation with Zod schemas",
                    "Configurable rate limiting",
                    "XSS & CSRF protection",
                    "Secure session management",
                  ].map((item, idx) => (
                    <motion.li
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="flex items-center gap-3 text-foreground"
                    >
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                      <span>{item}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </motion.div>

            <motion.div
              variants={scaleIn}
              whileHover={{ scale: 1.03, y: -5 }}
              className="relative group overflow-hidden rounded-3xl"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative p-10 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200/50 dark:border-blue-800/50 backdrop-blur-sm">
                <motion.div
                  animate={{ rotate: [0, -5, 5, 0] }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                  }}
                  className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg"
                >
                  <Zap className="w-8 h-8 text-white" />
                </motion.div>
                <h3 className="text-3xl font-black text-foreground mb-6 flex items-center gap-3">
                  A+ Performance Rating
                  <motion.span
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                    className="text-2xl"
                  >
                    ⚡
                  </motion.span>
                </h3>
                <ul className="space-y-4">
                  {[
                    "Optimized database indexes",
                    "Smart response caching",
                    "Code splitting & lazy loading",
                    "Connection pooling",
                  ].map((item, idx) => (
                    <motion.li
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="flex items-center gap-3 text-foreground"
                    >
                      <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      <span>{item}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Team Section with Heart Animation */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-transparent via-muted/20 to-transparent">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.div variants={scaleIn} className="mb-8">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                }}
                className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-pink-500 to-rose-600 rounded-full shadow-2xl mb-6"
              >
                <Heart className="w-10 h-10 text-white fill-white" />
              </motion.div>
            </motion.div>
            <motion.h2
              variants={fadeInUp}
              className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-6"
            >
              Built for Founders, by Founders
            </motion.h2>
            <motion.p
              variants={fadeIn}
              className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-8 leading-relaxed"
            >
              NeuraLaunch was created by entrepreneurs who understand the
              challenges of building a startup. We&apos;ve experienced the pain
              of building the wrong thing and are committed to helping others
              avoid that mistake.
            </motion.p>
            <motion.div
              variants={fadeIn}
              className="flex items-center justify-center gap-4 flex-wrap"
            >
              <div className="flex items-center gap-3 px-6 py-3 bg-card/50 backdrop-blur-sm border border-border/50 rounded-full">
                <Users className="w-6 h-6 text-primary" />
                <p className="text-muted-foreground font-medium">
                  Created with ❤️ by the NeuraLaunch team
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section with Pulsing Effects */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-secondary/5 to-accent/5" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.div variants={scaleIn} className="mb-8">
              <motion.div
                animate={{
                  rotate: [0, 360],
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  rotate: {
                    duration: 20,
                    repeat: Infinity,
                    ease: [0, 0, 1, 1],
                  },
                  scale: {
                    duration: 2,
                    repeat: Infinity,
                    ease: [0.42, 0, 0.58, 1],
                  },
                }}
                className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-primary via-secondary to-accent rounded-full shadow-2xl mb-6 relative"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-secondary/30 rounded-full blur-2xl animate-pulse" />
                <Target className="w-12 h-12 text-white relative z-10" />
              </motion.div>
            </motion.div>

            <motion.h2
              variants={fadeInUp}
              className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight mb-6"
            >
              <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                Ready to Validate Your Vision?
              </span>
            </motion.h2>

            <motion.p
              variants={fadeIn}
              className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto"
            >
              Join founders worldwide who are building validated startups with
              NeuraLaunch.
            </motion.p>

            <motion.div variants={fadeIn}>
              <Link href="/generate">
                <motion.button
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  animate={{
                    boxShadow: [
                      "0 0 0 0 rgba(168, 85, 247, 0)",
                      "0 0 0 20px rgba(168, 85, 247, 0)",
                      "0 0 0 0 rgba(168, 85, 247, 0)",
                    ],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                  }}
                  className="group relative inline-flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-primary via-secondary to-accent text-primary-foreground rounded-2xl font-bold text-xl shadow-2xl overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-accent via-primary to-secondary opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <span className="relative z-10 flex items-center gap-3">
                    Start Generating
                    <motion.span
                      animate={{ x: [0, 5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <Target className="w-6 h-6" />
                    </motion.span>
                  </span>
                </motion.button>
              </Link>
            </motion.div>
          </motion.div>
        </div>

        {/* Floating Particles with stable positions */}
        {useMemo(
          () =>
            Array.from({ length: 5 }, (_, i) => ({
              key: i,
              xOffset: Math.random() * 20 - 10,
              left: 20 + i * 15,
              top: 30 + (i % 2) * 40,
            })),
          []
        ).map((particle) => (
          <motion.div
            key={particle.key}
            animate={{
              y: [0, -30, 0],
              x: [0, particle.xOffset, 0],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 3 + particle.key,
              repeat: Infinity,
              ease: [0.42, 0, 0.58, 1],
              delay: particle.key * 0.5,
            }}
            className="absolute w-2 h-2 bg-primary rounded-full"
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
            }}
          />
        ))}
      </section>

      <LandingFooter />
    </div>
  );
}
