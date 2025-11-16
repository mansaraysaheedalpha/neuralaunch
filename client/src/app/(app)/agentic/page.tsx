// src/app/(app)/agentic/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Zap,
  ArrowRight,
  Sparkles,
  Code,
  Rocket,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import toast from "react-hot-toast";

export default function AgenticInterfacePage() {
  const router = useRouter();
  const [visionText, setVisionText] = useState("");
  const [projectName, setProjectName] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);

  // Tech preferences (optional)
  const [frontend, setFrontend] = useState<string>("");
  const [backend, setBackend] = useState<string>("");
  const [database, setDatabase] = useState<string>("");
  const [deployment, setDeployment] = useState<string>("");

  const handleStartBuilding = async () => {
    // Validation
    if (!visionText.trim()) {
      toast.error("Please describe your project vision");
      return;
    }

    if (!projectName.trim()) {
      toast.error("Please provide a project name");
      return;
    }

    setIsBuilding(true);

    try {
      const response = await fetch("/api/orchestrator/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "vision",
          visionText: visionText.trim(),
          projectName: projectName.trim(),
          techPreferences: {
            frontend: frontend || undefined,
            backend: backend || undefined,
            database: database || undefined,
            deployment: deployment || undefined,
          },
          async: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json() as { message?: string };
        throw new Error(error.message ?? "Failed to start build");
      }

      const result = await response.json() as { projectId: string };

      toast.success("Build started! Redirecting to execution dashboard...");

      // Redirect to execution dashboard
      setTimeout(() => {
        router.push(`/projects/${result.projectId}/execution`);
      }, 1500);
    } catch (error) {
      console.error("Build start error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to start build"
      );
      setIsBuilding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{
                rotate: [0, 10, -10, 0],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Bot className="w-8 h-8 text-primary" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                AI Agent Builder
              </h1>
              <p className="text-sm text-muted-foreground">
                Build full-stack applications from your vision
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Hero Section */}
          <div className="text-center mb-12">
            <motion.div
              animate={{
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full mb-4"
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">
                Powered by 13+ AI Agents
              </span>
            </motion.div>

            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Describe Your Vision
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Our AI agents will analyze, architect, and build your entire
              application—complete with code, tests, and deployment.
            </p>
          </div>

          {/* Main Form Card */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5 text-primary" />
                Project Details
              </CardTitle>
              <CardDescription>
                Tell us about the application you want to build
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Project Name */}
              <div className="space-y-2">
                <Label htmlFor="projectName" className="text-base font-medium">
                  Project Name
                </Label>
                <Input
                  id="projectName"
                  placeholder="My Awesome App"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="text-lg"
                  disabled={isBuilding}
                />
              </div>

              {/* Vision Textarea */}
              <div className="space-y-2">
                <Label htmlFor="vision" className="text-base font-medium">
                  Project Vision
                </Label>
                <Textarea
                  id="vision"
                  placeholder="Describe your project in detail. For example:

'I want to build a task management app like Asana, but specifically designed for remote teams. It should have:
- Real-time collaboration
- Video call integration
- Time zone-aware scheduling
- Project templates for distributed teams
- Async communication features

The app should feel modern, use a clean UI, and be mobile-responsive.'"
                  value={visionText}
                  onChange={(e) => setVisionText(e.target.value)}
                  className="min-h-[280px] text-base resize-none"
                  disabled={isBuilding}
                />
                <div className="flex items-center justify-between text-sm">
                  <p className="text-muted-foreground">
                    Be as detailed as you like—our AI will extract the key
                    requirements
                  </p>
                  <span
                    className={`${
                      visionText.length > 100
                        ? "text-green-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {visionText.length} characters
                  </span>
                </div>
              </div>

              {/* Advanced Options Toggle */}
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full justify-between"
                  disabled={isBuilding}
                >
                  <span className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Advanced Options (Optional)
                  </span>
                  {showAdvanced ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>

                <AnimatePresence>
                  {showAdvanced && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="grid md:grid-cols-2 gap-4 mt-4 pt-4 border-t">
                        {/* Frontend Framework */}
                        <div className="space-y-2">
                          <Label htmlFor="frontend">Frontend Framework</Label>
                          <Select
                            value={frontend}
                            onValueChange={setFrontend}
                            disabled={isBuilding}
                          >
                            <SelectTrigger id="frontend">
                              <SelectValue placeholder="Auto-detect" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="nextjs">Next.js</SelectItem>
                              <SelectItem value="react">React</SelectItem>
                              <SelectItem value="vue">Vue.js</SelectItem>
                              <SelectItem value="angular">Angular</SelectItem>
                              <SelectItem value="svelte">Svelte</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Backend Framework */}
                        <div className="space-y-2">
                          <Label htmlFor="backend">Backend Framework</Label>
                          <Select
                            value={backend}
                            onValueChange={setBackend}
                            disabled={isBuilding}
                          >
                            <SelectTrigger id="backend">
                              <SelectValue placeholder="Auto-detect" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="nextjs-api">
                                Next.js API Routes
                              </SelectItem>
                              <SelectItem value="express">Express</SelectItem>
                              <SelectItem value="fastapi">FastAPI</SelectItem>
                              <SelectItem value="django">Django</SelectItem>
                              <SelectItem value="rails">Rails</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Database */}
                        <div className="space-y-2">
                          <Label htmlFor="database">Database</Label>
                          <Select
                            value={database}
                            onValueChange={setDatabase}
                            disabled={isBuilding}
                          >
                            <SelectTrigger id="database">
                              <SelectValue placeholder="Auto-detect" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="postgresql">
                                PostgreSQL
                              </SelectItem>
                              <SelectItem value="mysql">MySQL</SelectItem>
                              <SelectItem value="mongodb">MongoDB</SelectItem>
                              <SelectItem value="sqlite">SQLite</SelectItem>
                              <SelectItem value="none">
                                None (Static)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Deployment */}
                        <div className="space-y-2">
                          <Label htmlFor="deployment">
                            Deployment Platform
                          </Label>
                          <Select
                            value={deployment}
                            onValueChange={setDeployment}
                            disabled={isBuilding}
                          >
                            <SelectTrigger id="deployment">
                              <SelectValue placeholder="Auto-detect" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="vercel">Vercel</SelectItem>
                              <SelectItem value="railway">Railway</SelectItem>
                              <SelectItem value="render">Render</SelectItem>
                              <SelectItem value="fly">Fly.io</SelectItem>
                              <SelectItem value="aws">AWS</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Build Button */}
              <div className="pt-4">
                <Button
                  onClick={() => { void handleStartBuilding(); }}
                  disabled={
                    isBuilding || !visionText.trim() || !projectName.trim()
                  }
                  size="lg"
                  className="w-full text-lg h-14 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  {isBuilding ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Starting AI Agents...
                    </>
                  ) : (
                    <>
                      <Rocket className="w-5 h-5 mr-2" />
                      Start Building
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>

                {/* Estimated time */}
                <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4" />
                  <span>Estimated build time: 20-30 minutes</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {[
              {
                icon: Code,
                title: "Full-Stack Code",
                description: "Production-ready frontend and backend code",
              },
              {
                icon: CheckCircle,
                title: "Automated Testing",
                description: "Unit tests, integration tests, and QA",
              },
              {
                icon: Rocket,
                title: "Auto-Deployment",
                description: "CI/CD pipeline with preview and production",
              },
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
              >
                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardContent className="pt-6">
                    <feature.icon className="w-10 h-10 text-primary mb-3" />
                    <h3 className="font-semibold text-foreground mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
