"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import React from "react";
import { Copy } from "lucide-react";
import {
  TwitterShareButton,
  LinkedinShareButton,
  WhatsappShareButton,
  TwitterIcon,
  LinkedinIcon,
  WhatsappIcon,
} from "react-share";

interface HeroSignupFormProps {
  landingPageSlug: string;
  ctaText: string;
  surveyQuestion1: string | null | undefined;
  surveyQuestion2: string | null | undefined;
}

export default function HeroSignupForm({
  landingPageSlug,
  ctaText,
  surveyQuestion1,
  surveyQuestion2,
}: HeroSignupFormProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signupId, setSignupId] = useState<string | null>(null);
  const [surveyResponse1, setSurveyResponse1] = useState("");
  const [surveyResponse2, setSurveyResponse2] = useState("");
  const [isSubmittingSurvey, setIsSubmittingSurvey] = useState(false);
  const [isSurveySubmitted, setIsSurveySubmitted] = useState(false);

  // --- 1. ADD STATE FOR REFERRAL ---
  const [baseUrl, setBaseUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Ensure this runs only on the client
    setBaseUrl(window.location.origin);
  }, []);

  const referralUrl = `${baseUrl}/lp/${landingPageSlug}?ref=${signupId}`;
  // Use a default title if document.title isn't ready
  const [shareTitle, setShareTitle] = useState("Check out this startup idea");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareTitle(`Check out this startup idea: ${document.title}`);
    }
  }, [isSurveySubmitted]); // Update title when ready

  const handleCopy = () => {
    if (!signupId) return;
    void navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  // --------------------------------

  // --- NEW: Helper function to track CTA click ---
  const trackCtaClick = () => {
    // Use sendBeacon for reliable tracking on page unload/redirect
    const sessionId =
      localStorage.getItem("neurallaunch_session_id") || undefined;
    const data = JSON.stringify({
      landingPageSlug: landingPageSlug,
      sessionId: sessionId,
      ctaClicked: true, // The important part
    });
    // Use sendBeacon as handleSubmit might redirect before fetch completes
    navigator.sendBeacon("/api/landing-page/track-view", data);
  };
  // -------------------------------------------

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    trackCtaClick(); // <<< Track the click
    setIsSubmitting(true);
    setErrorMessage(null);

  

    void (async () => {
      try {
        const response = await fetch("/api/landing-page/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            landingPageSlug: landingPageSlug,
            email,
            name: "", // Passing empty name, can be made optional in API
          }),
        });

        const data = (await response.json()) as { message?: string; signupId?: string };
        if (!response.ok) {
          throw new Error(
            data.message || "Submission failed. Please try again."
          );
        }

        setIsSubmitted(true);
        if (data.signupId) {
          setSignupId(data.signupId);
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "An unknown error occurred."
        );
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const handleSurveySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupId || isSubmittingSurvey) return;
    setIsSubmittingSurvey(true);

    void (async () => {
      try {
        const response = await fetch("/api/landing-page/survey", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signupId,
            response1: surveyResponse1,
            response2: surveyResponse2,
          }),
        });
        if (!response.ok) {
          throw new Error("Survey submission failed.");
        }
        setIsSurveySubmitted(true);
      } catch (error) {
        console.error("Survey submission error:", error);
      } finally {
        setIsSubmittingSurvey(false);
      }
    })();
  };

  const q1 = surveyQuestion1 || "What's the #1 reason you signed up?*";
  const q2 = surveyQuestion2 || "What are you using now to solve this problem?";
  // --- Render Logic ---
  if (isSubmitted && isSurveySubmitted) {
    // 3. Final Thank You
    return (
      <motion.div
        key="thank-you"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto mt-10 p-6 rounded-2xl border-2 border-lp-primary bg-lp-bg"
      >
        <div className="text-5xl mb-3">🎉</div>
        <h3 className="text-2xl font-bold mb-2">Thank You!</h3>
        <p className="opacity-70">
          Your feedback is valuable. Help us reach more people.
        </p>
        {/* --- 2. RENDER REFERRAL UI --- */}
        {signupId && (
          <div className="text-left">
            <label className="text-sm font-medium opacity-80 mb-1 block">
              Share your unique link:
            </label>
            <div className="flex w-full mb-4">
              <input
                type="text"
                readOnly
                value={referralUrl}
                className="flex-1 px-4 py-2 rounded-l-md border-r-0 border text-sm bg-lp-bg text-lp-text focus:outline-none"
                style={{ borderColor: "var(--lp-primary)" }}
              />
              <button
                onClick={handleCopy}
                className="px-4 py-2 rounded-r-md border border-lp-primary bg-lp-primary text-lp-primary-text font-semibold text-sm transition-all"
              >
                {copied ? "Copied!" : <Copy size={16} />}
              </button>
            </div>
            <div className="flex justify-center gap-4">
              <TwitterShareButton url={referralUrl} title={shareTitle}>
                <TwitterIcon size={36} round />
              </TwitterShareButton>
              <LinkedinShareButton url={referralUrl} title={shareTitle}>
                <LinkedinIcon size={36} round />
              </LinkedinShareButton>
              <WhatsappShareButton url={referralUrl} title={shareTitle}>
                <WhatsappIcon size={36} round />
              </WhatsappShareButton>
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  if (isSubmitted && !isSurveySubmitted) {
    // 2. Survey Form
    return (
      <motion.div
        key="survey-form"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto mt-10 p-6 rounded-2xl border-2 border-lp-primary bg-lp-bg"
      >
        <div className="text-3xl mb-3">✅</div>
        <h3 className="text-xl font-bold mb-3">One last step!</h3>
        <p className="opacity-70 mb-5 text-sm">
          Help us build the best product for you:
        </p>
        <form onSubmit={handleSurveySubmit} className="space-y-4 text-left">
          <div>
            {/* --- USE DYNAMIC QUESTION 1 --- */}
            <label
              htmlFor="survey1"
              className="block text-sm font-medium opacity-80 mb-1"
            >
              {q1}
            </label>
            {/* ---------------------------- */}
            <input
              id="survey1"
              type="text"
              value={surveyResponse1}
              required
              onChange={(e) => setSurveyResponse1(e.target.value)}
              className="w-full px-4 py-2 rounded-md border text-sm focus:outline-none focus:ring-1 ring-lp-primary bg-lp-bg text-lp-text border-lp-primary/50"
            />
          </div>
          <div>
            {/* --- USE DYNAMIC QUESTION 2 --- */}
            <label
              htmlFor="survey2"
              className="block text-sm font-medium opacity-80 mb-1"
            >
              {q2}
            </label>
            {/* ---------------------------- */}
            <input
              id="survey2"
              type="text"
              value={surveyResponse2}
              onChange={(e) => setSurveyResponse2(e.target.value)}
              className="w-full px-4 py-2 rounded-md border text-sm focus:outline-none focus:ring-1 ring-lp-primary bg-lp-bg text-lp-text border-lp-primary/50"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmittingSurvey}
            className="w-full px-6 py-2.5 rounded-lg font-semibold text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50 bg-lp-primary text-lp-bg"
          >
            {isSubmittingSurvey ? "Submitting..." : "Submit Feedback"}
          </button>
        </form>
      </motion.div>
    );
  }

  // 1. Initial Signup Form
  return (
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
          {isSubmitting ? "Submitting..." : ctaText || "Join Waitlist"}
        </button>
      </div>
      <p className="text-sm opacity-60 mt-3">No spam. Unsubscribe anytime.</p>
      {errorMessage && (
        <p className="text-sm text-red-500 mt-2">{errorMessage}</p>
      )}
    </motion.form>
  );
}
