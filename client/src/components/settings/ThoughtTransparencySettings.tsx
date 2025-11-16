// components/settings/ThoughtTransparencySettings.tsx
"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Brain, Eye, Settings, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface ThoughtPreferences {
  deepDiveEnabled: boolean;
  showMetadata: boolean;
}

interface ThoughtPreferencesResponse {
  success: boolean;
  preferences: ThoughtPreferences;
}

interface SavePreferencesResponse {
  success: boolean;
  error?: string;
}

export function ThoughtTransparencySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deepDiveEnabled, setDeepDiveEnabled] = useState(false);
  const [showMetadata, setShowMetadata] = useState(true);

  // Load preferences
  useEffect(() => {
    void loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const res = await fetch("/api/user/settings/thought-preferences");
      const data = await res.json() as ThoughtPreferencesResponse;

      if (data.success) {
        setDeepDiveEnabled(data.preferences.deepDiveEnabled);
        setShowMetadata(data.preferences.showMetadata);
      }
    } catch (error) {
      console.error("Failed to load preferences:", error);
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);

    try {
      const res = await fetch("/api/user/settings/thought-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deepDiveEnabled,
          showMetadata,
        }),
      });

      const data = await res.json() as SavePreferencesResponse;

      if (data.success) {
        toast.success("Preferences saved!", {
          description: "Your thought transparency settings have been updated.",
          icon: <CheckCircle className="w-4 h-4" />,
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast.error("Failed to save preferences", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    void savePreferences();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          Thought Transparency
        </CardTitle>
        <CardDescription>
          Control how much of the AI&apos;s reasoning process you want to see
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Deep Dive Mode */}
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="deep-dive" className="font-semibold">
                  Deep Dive Mode
                </Label>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                  Power User
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Show raw AI reasoning from Claude&apos;s extended thinking. This
                reveals the AI&apos;s actual internal decision-making process,
                not just curated messages.
              </p>
              <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs">
                <p className="font-medium mb-1">What you&apos;ll see:</p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  <li>Claude&apos;s step-by-step reasoning</li>
                  <li>Option evaluation and trade-offs</li>
                  <li>Decision justifications</li>
                  <li>Self-corrections and refinements</li>
                </ul>
              </div>
            </div>
            <Switch
              id="deep-dive"
              checked={deepDiveEnabled}
              onCheckedChange={setDeepDiveEnabled}
              className="ml-4"
            />
          </div>
        </div>

        {/* Show Metadata */}
        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1">
              <Label htmlFor="show-metadata" className="font-semibold">
                Show Metadata
              </Label>
              <p className="text-sm text-muted-foreground">
                Display technical metadata like token counts, file counts, and
                execution details within thoughts.
              </p>
            </div>
            <Switch
              id="show-metadata"
              checked={showMetadata}
              onCheckedChange={setShowMetadata}
              className="ml-4"
            />
          </div>
        </div>

        {/* Info Box */}
        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <div className="flex gap-3">
            <Eye className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                Transparency Modes Explained
              </p>
              <ul className="space-y-1 text-blue-700 dark:text-blue-300">
                <li>
                  <span className="font-medium">Standard:</span> Clean,
                  user-friendly status updates
                </li>
                <li>
                  <span className="font-medium">Deep Dive:</span> + Raw AI
                  reasoning and decision-making
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full"
          size="lg"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Settings className="w-4 h-4 mr-2" />
              Save Preferences
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
