"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface LandingPageProps {
  landingPage: {
    id: string;
    slug: string;
    headline: string;
    subheadline: string;
    problemStatement: string | null;
    solutionStatement: string | null;
    features: any; // JSON array
    ctaText: string;
    colorScheme: any; // JSON object
  };
}

export default function LandingPagePublic({ landingPage }: LandingPageProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const colors = landingPage.colorScheme as {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };

  const features = landingPage.features as Array<{
    title: string;
    description: string;
    icon: string;
  }>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/landing-page/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingPageSlug: landingPage.slug,
          email,
          name,
        }),
      });
      if (!response.ok) {
        throw new Error("Submission failed. Please try again.");
      }
      setIsSubmitted(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "An unknown error occurred."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen font-sans"
      style={
        {
          "--lp-primary": colors.primary,
          "--lp-secondary": colors.secondary,
          "--lp-accent": colors.accent,
          "--lp-bg": colors.background,
          "--lp-text": colors.text,
        } as React.CSSProperties
      }
    >
      {/* This style block injects the dynamic colors as CSS variables */}
      <style jsx global>{`
        .bg-lp-primary {
          background-color: var(--lp-primary);
        }
        .text-lp-primary {
          color: var(--lp-primary);
        }
        .border-lp-primary {
          border-color: var(--lp-primary);
        }
        .ring-lp-primary {
          --tw-ring-color: var(--lp-primary);
        }
        .bg-lp-secondary {
          background-color: var(--lp-secondary);
        }
        .bg-lp-accent {
          background-color: var(--lp-accent);
        }
        .bg-lp-bg {
          background-color: var(--lp-bg);
        }
        .text-lp-text {
          color: var(--lp-text);
        }
        .text-lp-bg {
          color: var(--lp-bg);
        }
      `}</style>

      <main className="bg-lp-bg text-lp-text">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 50%, ${colors.accent} 100%)`,
            }}
          />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 md:pt-32 md:pb-32">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center"
            >
              <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6">
                {landingPage.headline}
              </h1>
              <p className="text-xl md:text-2xl mb-10 max-w-3xl mx-auto opacity-80">
                {landingPage.subheadline}
              </p>

              {!isSubmitted ? (
                <motion.form
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                  onSubmit={handleSubmit}
                  className="max-w-md mx-auto"
                >
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="flex-1 px-6 py-4 rounded-xl border-2 text-lg focus:outline-none focus:ring-2 ring-lp-primary transition-all bg-lp-bg text-lp-text border-lp-primary"
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-lp-primary text-lp-bg"
                    >
                      {isSubmitting ? "Submitting..." : landingPage.ctaText}
                    </button>
                  </div>
                  <p className="text-sm opacity-60 mt-3">
                    No spam. Unsubscribe anytime.
                  </p>
                  {errorMessage && (
                    <p className="text-sm text-red-500 mt-2">{errorMessage}</p>
                  )}
                </motion.form>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-md mx-auto p-6 rounded-2xl border-2 border-lp-primary bg-lp-bg"
                >
                  <div className="text-5xl mb-3">🎉</div>
                  <h3 className="text-2xl font-bold mb-2">
                    You&apos;re on the list!
                  </h3>
                  <p className="opacity-70">We&apos;ll be in touch soon.</p>
                </motion.div>
              )}
            </motion.div>
          </div>
        </section>

        {/* Problem/Solution Section */}
        {(landingPage.problemStatement || landingPage.solutionStatement) && (
          <section
            className="py-20 border-t"
            style={{ borderColor: `${colors.primary}20` }}
          >
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid md:grid-cols-2 gap-12">
                {landingPage.problemStatement && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                  >
                    <div
                      className="inline-block px-4 py-2 rounded-full text-sm font-semibold mb-4 text-lp-primary"
                      style={{ backgroundColor: `${colors.primary}20` }}
                    >
                      The Problem
                    </div>
                    <p className="text-lg leading-relaxed opacity-80">
                      {landingPage.problemStatement}
                    </p>
                  </motion.div>
                )}
                {landingPage.solutionStatement && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                  >
                    <div
                      className="inline-block px-4 py-2 rounded-full text-sm font-semibold mb-4"
                      style={{
                        backgroundColor: `${colors.accent}20`,
                        color: colors.accent,
                      }}
                    >
                      Our Solution
                    </div>
                    <p className="text-lg leading-relaxed opacity-80">
                      {landingPage.solutionStatement}
                    </p>
                  </motion.div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Features Section */}
        {features && features.length > 0 && (
          <section
            className="py-20 border-t"
            style={{ borderColor: `${colors.primary}20` }}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-4xl md:text-5xl font-black text-center mb-16"
              >
                Why Choose Us?
              </motion.h2>
              <div className="grid md:grid-cols-3 gap-8">
                {features.map((feature, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1, duration: 0.6 }}
                    className="p-8 rounded-2xl border-2 hover:shadow-xl transition-all bg-lp-bg"
                    style={{ borderColor: `${colors.primary}20` }}
                  >
                    <div className="text-5xl mb-4">{feature.icon}</div>
                    <h3 className="text-2xl font-bold mb-3">{feature.title}</h3>
                    <p className="opacity-70 leading-relaxed">
                      {feature.description}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer
          className="py-8 border-t"
          style={{ borderColor: `${colors.primary}20` }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-sm opacity-50">
              Powered by{" "}
              <a
                href="https://ideaspark-three.vercel.app"
                className="font-semibold hover:opacity-100 transition-opacity text-lp-primary"
              >
                IdeaSpark
              </a>
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
