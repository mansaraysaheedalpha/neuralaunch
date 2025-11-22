"use client";

import { motion } from "framer-motion";
import { Check, Zap, Crown, Sparkles, Mail, ArrowRight } from "lucide-react";
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
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

export default function PricingPage() {
  const plans = [
    {
      name: "Starter",
      icon: Sparkles,
      price: "Coming Soon",
      description: "Perfect for solo founders testing their first idea",
      features: [
        "1 AI Blueprint per month",
        "Basic validation sprint templates",
        "AI Co-Founder chat (limited)",
        "Landing page builder",
        "Email support",
        "Community access",
      ],
      cta: "Notify Me",
      highlighted: false,
      color: "from-blue-500 to-cyan-500",
    },
    {
      name: "Professional",
      icon: Zap,
      price: "Coming Soon",
      description: "For serious founders validating multiple ideas",
      features: [
        "Unlimited AI Blueprints",
        "Advanced validation sprint tools",
        "Unlimited AI Co-Founder chat",
        "A/B testing & analytics",
        "Priority support",
        "Export & collaboration tools",
        "Custom branding",
        "API access",
      ],
      cta: "Notify Me",
      highlighted: true,
      color: "from-primary to-secondary",
      badge: "Most Popular",
    },
    {
      name: "Enterprise",
      icon: Crown,
      price: "Coming Soon",
      description: "For teams and accelerators at scale",
      features: [
        "Everything in Professional",
        "Unlimited team members",
        "Custom AI model training",
        "Dedicated success manager",
        "White-label options",
        "SLA guarantees",
        "Advanced security features",
        "Custom integrations",
      ],
      cta: "Contact Sales",
      highlighted: false,
      color: "from-purple-500 to-pink-500",
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
          className="max-w-4xl mx-auto text-center"
        >
          <motion.div variants={fadeIn} className="mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-6 bg-gradient-to-br from-primary to-secondary rounded-2xl shadow-lg">
              <Zap className="w-10 h-10 text-primary-foreground" />
            </div>
          </motion.div>
          <motion.h1
            variants={fadeIn}
            className="text-5xl md:text-6xl font-black tracking-tight text-foreground mb-6"
          >
            Pricing Plans
          </motion.h1>
          <motion.p
            variants={fadeIn}
            className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8"
          >
            Choose the perfect plan for your startup journey. All plans include
            our core AI-powered validation tools.
          </motion.p>

          {/* Coming Soon Badge */}
          <motion.div variants={fadeIn}>
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-primary/10 border-2 border-primary/30 rounded-full">
              <Sparkles className="w-5 h-5 text-primary animate-pulse" />
              <span className="text-lg font-bold text-primary">
                Pricing Coming Soon - Stay Tuned!
              </span>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Pricing Cards */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-3 gap-8"
          >
            {plans.map((plan, index) => (
              <motion.div
                key={index}
                variants={fadeIn}
                whileHover={{ y: -10 }}
                className={`relative rounded-3xl overflow-hidden ${
                  plan.highlighted
                    ? "md:scale-105 shadow-2xl ring-2 ring-primary"
                    : "shadow-lg"
                }`}
              >
                {/* Badge for highlighted plan */}
                {plan.badge && (
                  <div className="absolute top-0 right-0 z-10">
                    <div className="bg-gradient-to-r from-primary to-secondary text-primary-foreground text-xs font-bold px-4 py-2 rounded-bl-xl">
                      {plan.badge}
                    </div>
                  </div>
                )}

                {/* Card Background */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${plan.color} opacity-5`}
                />

                {/* Card Content */}
                <div className="relative bg-card/50 backdrop-blur-sm border border-border/50 p-8 h-full flex flex-col">
                  {/* Icon */}
                  <div
                    className={`w-14 h-14 bg-gradient-to-br ${plan.color} rounded-xl flex items-center justify-center mb-6 shadow-lg`}
                  >
                    <plan.icon className="w-7 h-7 text-white" />
                  </div>

                  {/* Plan Name */}
                  <h3 className="text-2xl font-bold text-foreground mb-2">
                    {plan.name}
                  </h3>

                  {/* Description */}
                  <p className="text-muted-foreground mb-6">
                    {plan.description}
                  </p>

                  {/* Price */}
                  <div className="mb-8">
                    <div className="text-4xl font-black text-foreground mb-1">
                      {plan.price}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      We&apos;re finalizing pricing details
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="space-y-4 mb-8 flex-grow">
                    {plan.features.map((feature, featureIndex) => (
                      <li
                        key={featureIndex}
                        className="flex items-start gap-3"
                      >
                        <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA Button */}
                  <button
                    disabled
                    className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-300 ${
                      plan.highlighted
                        ? "bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg opacity-50 cursor-not-allowed"
                        : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
                    }`}
                  >
                    {plan.cta}
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/30 dark:bg-slate-800/30">
        <div className="max-w-4xl mx-auto">
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
              Pricing FAQ
            </motion.h2>
            <div className="space-y-6">
              {[
                {
                  question: "When will pricing be available?",
                  answer:
                    "We're currently finalizing our pricing structure to ensure it provides maximum value to founders at every stage. Sign up for updates to be notified when pricing is announced.",
                },
                {
                  question: "Will there be a free trial?",
                  answer:
                    "Yes! We plan to offer a free trial period so you can experience the full power of NeuraLaunch before committing to a paid plan.",
                },
                {
                  question: "Can I switch plans later?",
                  answer:
                    "Absolutely! You'll be able to upgrade or downgrade your plan at any time to match your needs as your startup grows.",
                },
                {
                  question: "Do you offer discounts for students or nonprofits?",
                  answer:
                    "We're committed to making startup validation accessible. Special pricing for students, nonprofits, and early-stage founders will be available. Contact us to learn more.",
                },
              ].map((faq, index) => (
                <motion.div
                  key={index}
                  variants={fadeIn}
                  className="bg-card border border-border rounded-xl p-6"
                >
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    {faq.question}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Notification CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.div variants={fadeIn} className="mb-6">
              <Mail className="w-16 h-16 text-primary mx-auto mb-4" />
            </motion.div>
            <motion.h2
              variants={fadeIn}
              className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-6"
            >
              Get Notified When Pricing Launches
            </motion.h2>
            <motion.p
              variants={fadeIn}
              className="text-xl text-muted-foreground mb-10"
            >
              Be among the first to know when our pricing plans go live.
              We&apos;ll also include exclusive early-bird discounts.
            </motion.p>
            <motion.div variants={fadeIn}>
              <Link href="/generate">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-primary to-secondary text-primary-foreground rounded-2xl font-bold text-lg shadow-2xl hover:shadow-primary/50 transition-all group"
                >
                  <span>Get Early Access</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
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
