// src/components/agent/PlatformSelector.tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Globe,
  Smartphone,
  Server,
  Monitor,
  Layers,
  ArrowRight,
  Lock,
} from "lucide-react";

interface PlatformSelectorProps {
  projectId: string;
  onPlatformSelected: (platform: string) => void;
}

type Platform = {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
  tagline: string;
};

const PLATFORMS: Platform[] = [
  {
    id: "web",
    name: "Web Application",
    description: "SaaS platforms, dashboards, landing pages, e-commerce",
    icon: <Globe className="w-8 h-8" />,
    available: true,
    tagline: "Build modern web apps with Next.js, Remix, or Vue",
  },
  {
    id: "mobile",
    name: "Mobile App",
    description: "iOS and Android native apps, cross-platform solutions",
    icon: <Smartphone className="w-8 h-8" />,
    available: false,
    tagline: "Coming Soon - Flutter, React Native, Swift, Kotlin",
  },
  {
    id: "backend",
    name: "Backend API/Service",
    description: "REST APIs, GraphQL servers, microservices, serverless",
    icon: <Server className="w-8 h-8" />,
    available: false,
    tagline: "Coming Soon - Node.js, Python, Java, C#, Go, Rust",
  },
  {
    id: "desktop",
    name: "Desktop Application",
    description: "Cross-platform desktop apps for Windows, Mac, Linux",
    icon: <Monitor className="w-8 h-8" />,
    available: false,
    tagline: "Coming Soon - Electron, Tauri, Flutter Desktop",
  },
  {
    id: "multi",
    name: "Multi-Platform",
    description: "Unified web + mobile experience with shared backend",
    icon: <Layers className="w-8 h-8" />,
    available: false,
    tagline: "Coming Soon - Complete cross-platform solution",
  },
];

export default function PlatformSelector({
  projectId,
  onPlatformSelected,
}: PlatformSelectorProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);

  const handlePlatformClick = async (platform: Platform) => {
    if (!platform.available) {
      setShowWaitlist(true);
      return;
    }

    setSelectedPlatform(platform.id);

    // Save platform selection to database
    try {
      const res = await fetch(`/api/projects/${projectId}/platform`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platform.id }),
      });

      if (!res.ok) throw new Error("Failed to save platform");

      // Navigate to architect preferences
      onPlatformSelected(platform.id);
    } catch (error) {
      console.error("Failed to save platform:", error);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <h1 className="text-4xl font-bold text-foreground mb-4">
          What Are You Building?
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Choose your platform and our AI architect will design a complete,
          production-ready system tailored to your needs.
        </p>
      </motion.div>

      {/* Platform Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {PLATFORMS.map((platform, index) => (
          <motion.button
            key={platform.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => void handlePlatformClick(platform)}
            disabled={!platform.available}
            className={`relative p-6 rounded-xl border-2 text-left transition-all ${
              platform.available
                ? "border-border hover:border-primary hover:shadow-lg cursor-pointer"
                : "border-border opacity-60 cursor-not-allowed"
            } ${
              selectedPlatform === platform.id
                ? "border-primary bg-primary/5"
                : "bg-card"
            }`}
          >
            {/* Lock Icon for Unavailable */}
            {!platform.available && (
              <div className="absolute top-4 right-4">
                <Lock className="w-5 h-5 text-muted-foreground" />
              </div>
            )}

            {/* Icon */}
            <div
              className={`inline-flex items-center justify-center w-16 h-16 rounded-lg mb-4 ${
                platform.available
                  ? "bg-gradient-to-br from-primary/20 to-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {platform.icon}
            </div>

            {/* Content */}
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {platform.name}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {platform.description}
            </p>

            {/* Tagline */}
            <div
              className={`text-xs ${
                platform.available ? "text-primary" : "text-muted-foreground"
              } font-medium`}
            >
              {platform.tagline}
            </div>

            {/* Coming Soon Badge */}
            {!platform.available && (
              <div className="mt-4">
                <span className="inline-block px-3 py-1 text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full">
                  Coming Soon
                </span>
              </div>
            )}

            {/* Arrow for Available */}
            {platform.available && (
              <div className="absolute bottom-6 right-6">
                <ArrowRight className="w-5 h-5 text-primary" />
              </div>
            )}
          </motion.button>
        ))}
      </div>

      {/* Waitlist Modal */}
      {showWaitlist && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowWaitlist(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card border border-border rounded-xl p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-bold text-foreground mb-4">
              Coming Soon! 🚀
            </h3>
            <p className="text-muted-foreground mb-6">
              We&apos;re working hard to bring mobile, backend, and desktop
              support to NeuraLaunch. Join our waitlist to be the first to know
              when these platforms launch!
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowWaitlist(false)}
                className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Maybe Later
              </button>
              <button
                onClick={() => {
                  window.open(
                    "https://tally.so/r/your-waitlist-form",
                    "_blank"
                  );
                  setShowWaitlist(false);
                }}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
              >
                Join Waitlist
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Info Box */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-center"
      >
        <p className="text-sm text-blue-600 dark:text-blue-400">
          <strong>Pro Tip:</strong> Start with Web Application to validate your
          idea quickly. You can always expand to mobile and other platforms
          later!
        </p>
      </motion.div>
    </div>
  );
}
