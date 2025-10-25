//components/landing-page/LandingPagePublic.tsx
"use client";

import { motion } from "framer-motion";
import React, { useEffect, useState } from "react";
import HeroSignupForm from "./HeroSignupForm";
import RatingWidget from "./RatingWidget";
import FeaturePrioritization from "../FeaturePriotization";
import CalendlyEmbed from "../CalendlyEmbed";
import PricingFeedback from "../PricingFeedback";
import type { InitialLandingPageData } from "../LandingPageBuilder";
import { toast } from "react-hot-toast"; // <<< Import toast
import type { PricingTier } from "../PricingFeedback";
import { getABTestVariant, getABTestSessionId, trackABTestVariant } from "@/lib/ab-testing";

// Define proper types for the JSON fields
interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

interface Feature {
  title: string;
  description: string;
  icon: string;
}

// Update props to use the detailed type
interface LandingPageProps {
  landingPage: InitialLandingPageData & { 
    preorderLink?: string | null;
    abTestVariants?: Record<string, string[]> | null;
  };
}

// Helper function to get session ID
function getSessionIdForFeedback(): string | undefined {
   if (typeof window !== "undefined") {
      return localStorage.getItem("neurallaunch_session_id") || undefined;
   }
   return undefined;
}

// --- NEW Smoke Test Feature Card Component ---
const SmokeTestFeatureCard: React.FC<{
  feature: Feature;
  index: number;
  slug: string;
  primaryColor: string;
}> = ({ feature, index, slug, primaryColor }) => {
  
  const handleClick = () => {
    // Send tracking event
    void fetch("/api/landing-page/smoke-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            landingPageSlug: slug,
            featureName: feature.title,
            sessionId: getSessionIdForFeedback(),
        }),
    });
    
    // Notify user
    toast.success(`"${feature.title}" is coming soon! Thanks for your interest.`);
  };

  return (
    <motion.div
      key={index}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.6 }}
      className="p-6 sm:p-8 rounded-2xl border-2 hover:shadow-xl transition-all bg-lp-bg"
      style={{ borderColor: `${primaryColor}20` }}
    >
      <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">{feature.icon}</div>
      <h3 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-3">{feature.title}</h3>
      <p className="text-sm sm:text-base opacity-70 leading-relaxed mb-4 sm:mb-5">
        {feature.description}
      </p>
      {/* This button *looks* like a CTA but is a smoke test */}
      <motion.button
        onClick={handleClick}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.98 }}
        className="w-full px-4 py-2 rounded-lg font-semibold text-sm transition-all"
        style={{
            backgroundColor: `${primaryColor}20`,
            color: primaryColor,
        }}
      >
        Notify Me
      </motion.button>
    </motion.div>
  );
};
// ---------------------------------------------

export default function LandingPagePublic({ landingPage }: LandingPageProps) {
  // A/B testing state
  const [headline, setHeadline] = useState(landingPage.headline);
  const [subheadline, setSubheadline] = useState(landingPage.subheadline);
  const [ctaText, setCtaText] = useState(landingPage.ctaText);

  // Initialize A/B testing on mount
  useEffect(() => {
    if (!landingPage.abTestVariants) return;

    const abTestVariants = landingPage.abTestVariants as Record<string, string[]>;
    const sessionId = getABTestSessionId();

    // Test headline variants
    if (abTestVariants.headline && abTestVariants.headline.length > 0) {
      const selectedHeadline = getABTestVariant(abTestVariants.headline, sessionId);
      if (selectedHeadline) {
        setHeadline(selectedHeadline);
        trackABTestVariant(landingPage.slug, "headline", selectedHeadline, sessionId);
      }
    }

    // Test subheadline variants
    if (abTestVariants.subheadline && abTestVariants.subheadline.length > 0) {
      const selectedSubheadline = getABTestVariant(abTestVariants.subheadline, sessionId);
      if (selectedSubheadline) {
        setSubheadline(selectedSubheadline);
        trackABTestVariant(landingPage.slug, "subheadline", selectedSubheadline, sessionId);
      }
    }

    // Test CTA text variants
    if (abTestVariants.ctaText && abTestVariants.ctaText.length > 0) {
      const selectedCtaText = getABTestVariant(abTestVariants.ctaText, sessionId);
      if (selectedCtaText) {
        setCtaText(selectedCtaText);
        trackABTestVariant(landingPage.slug, "ctaText", selectedCtaText, sessionId);
      }
    }
  }, [landingPage.slug, landingPage.abTestVariants, landingPage.headline, landingPage.subheadline, landingPage.ctaText]);

  const colors = landingPage.colorScheme as unknown as ColorScheme;
  // Ensure features is an array before mapping
  const features = Array.isArray(landingPage.features)
    ? (landingPage.features as Feature[])
    : [];
  
  // Extract pricingTiers from landingPage
  const pricingTiers = Array.isArray(landingPage.pricingTiers)
    ? (landingPage.pricingTiers as unknown as PricingTier[])
    : [];

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
        .accent-lp-primary {
          accent-color: var(--lp-primary);
        } /* For slider */
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
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-20 sm:pb-24 md:pt-32 md:pb-32">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center"
            >
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight mb-4 sm:mb-6 px-2">
                {headline}
              </h1>
              <p className="text-base sm:text-lg md:text-xl lg:text-2xl mb-8 sm:mb-10 max-w-3xl mx-auto opacity-80 px-4">
                {subheadline}
              </p>

              {/* --- RENDER THE SIGNUP FORM COMPONENT --- */}
              <HeroSignupForm
                landingPageSlug={landingPage.slug}
                ctaText={ctaText}
                surveyQuestion1={landingPage.surveyQuestion1}
                surveyQuestion2={landingPage.surveyQuestion2}
              />
              {/* ----------------------------------------- */}
            </motion.div>
          </div>
        </section>

        {/* Problem/Solution Section */}
        {(landingPage.problemStatement || landingPage.solutionStatement) && (
          <section
            className="py-12 sm:py-16 md:py-20 border-t"
            style={{ borderColor: `${colors.primary}20` }}
          >
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid md:grid-cols-2 gap-8 sm:gap-10 md:gap-12 items-start">
                {landingPage.problemStatement && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                  >
                    <div
                      className="inline-block px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-3 sm:mb-4 text-lp-primary"
                      style={{ backgroundColor: `${colors.primary}20` }}
                    >
                      The Problem
                    </div>
                    <p className="text-base sm:text-lg leading-relaxed opacity-80">
                      {landingPage.problemStatement}
                    </p>

                    {/* --- RENDER THE RATING WIDGET --- */}
                    <RatingWidget
                      landingPageSlug={landingPage.slug}
                      primaryColor={colors.primary}
                      feedbackType="problem_rating"
                      question="How much does this problem affect you?"
                    />
                    {/* --------------------------------- */}
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
                      className="inline-block px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-3 sm:mb-4"
                      style={{
                        backgroundColor: `${colors.accent}20`,
                        color: colors.accent,
                      }}
                    >
                      Our Solution
                    </div>
                    <p className="text-base sm:text-lg leading-relaxed opacity-80">
                      {landingPage.solutionStatement}
                    </p>
                    {/* --- ADD SOLUTION RATING WIDGET --- */}
                    <RatingWidget
                      landingPageSlug={landingPage.slug}
                      primaryColor={colors.accent} // Use accent color
                      feedbackType="solution_rating"
                      question="How valuable does this solution seem?"
                    />
                  </motion.div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Features Section */}
        {features.length > 0 && (
          <section
            className="py-12 sm:py-16 md:py-20 border-t"
            style={{ borderColor: `${colors.primary}20` }}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-3xl sm:text-4xl md:text-5xl font-black text-center mb-10 sm:mb-12 md:mb-16"
              >
                Why Choose Us?
              </motion.h2>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
                {features.map((feature, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1, duration: 0.6 }}
                    className="p-6 sm:p-8 rounded-2xl border-2 hover:shadow-xl transition-all bg-lp-bg"
                    style={{ borderColor: `${colors.primary}20` }}
                  >
                    <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">{feature.icon}</div>
                    <h3 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-3">{feature.title}</h3>
                    <p className="text-sm sm:text-base opacity-70 leading-relaxed">
                      {feature.description}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        )}

        {features.length > 0 && (
          <section
            className="py-12 sm:py-16 md:py-20 border-t"
            style={{ borderColor: `${colors.primary}20` }}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-3xl sm:text-4xl md:text-5xl font-black text-center mb-10 sm:mb-12 md:mb-16"
              >
                Features Coming Soon
              </motion.h2>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
                {features.map((feature, index) => (
                  // Use the new SmokeTestFeatureCard
                  <SmokeTestFeatureCard
                    key={index}
                    feature={feature}
                    index={index}
                    slug={landingPage.slug}
                    primaryColor={colors.primary}
                  />
                ))}
              </div>
            </div>
          </section>
        )}
        {/* ------------------------------------------------- */}

        {/* FeaturePrioritization Section */}
        {landingPage.surveyQuestion1 && (
          <FeaturePrioritization
            landingPageSlug={landingPage.slug}
            features={features}
            primaryColor={colors.primary}
            backgroundColor={colors.background}
            textColor={colors.text}
          />
        )}

        {/* PricingFeedback Section */}
        {pricingTiers.length > 0 && (
          <PricingFeedback
            landingPageSlug={landingPage.slug}
            tiers={pricingTiers}
            primaryColor={colors.primary}
            backgroundColor={colors.background}
            textColor={colors.text}
          />
        )}

        {/* --- ADD PRE-ORDER SECTION --- */}
        {landingPage.preorderLink && (
          <section
            className="py-12 sm:py-16 md:py-20 border-t"
            style={{ borderColor: `${colors.primary}20` }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-3xl mx-auto px-4 sm:px-6 text-center rounded-2xl p-6 sm:p-8 md:p-10"
              style={{
                background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
              }}
            >
              <h2
                className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4"
                style={{ color: colors.background }}
              >
                Get Lifetime Access
              </h2>
              <p
                className="text-base sm:text-lg opacity-90 mb-6 sm:mb-8"
                style={{ color: colors.background }}
              >
                Be one of our first 100 users and get a lifetime deal. Pre-order
                now to lock in your spot.
              </p>
              <motion.a
                href={landingPage.preorderLink}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-block px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg shadow-lg transition-all"
                style={{
                  backgroundColor: colors.background,
                  color: colors.primary,
                }}
              >
                Pre-Order Now
              </motion.a>
            </motion.div>
          </section>
        )}
        {/* ----------------------------- */}

        {/* Calendly Section */}
        {landingPage.calendlyUrl && (
          <CalendlyEmbed
            calendlyUrl={landingPage.calendlyUrl}
          />
        )}
        {/* Footer */}
        <footer
          className="py-6 sm:py-8 border-t"
          style={{ borderColor: `${colors.primary}20` }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-xs sm:text-sm opacity-50">
              Powered by{" "}
              <a
                href="https://startupvalidator.app" // Use your main domain
                className="font-semibold hover:opacity-100 transition-opacity text-lp-primary"
              >
                NeuraLaunch
              </a>
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
