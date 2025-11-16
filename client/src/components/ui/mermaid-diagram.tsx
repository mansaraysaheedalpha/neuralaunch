// src/components/ui/mermaid-diagram.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";

interface MermaidDiagramProps {
  title: string;
  content: string;
  className?: string;
}

export function MermaidDiagram({
  title,
  content,
  className = "",
}: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const renderDiagram = async () => {
      if (!containerRef.current || !content) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Dynamically import mermaid
        const mermaid = (await import("mermaid")).default;

        // Initialize mermaid
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "loose",
          fontFamily: "var(--font-geist-sans)",
        });

        // Clean up content - remove "mermaid" prefix and backticks
        let cleanContent = content
          .replace(/^mermaid\n?/i, "")
          .replace(/^```mermaid\n?/i, "")
          .replace(/```$/,"")
          .trim();

        // Generate unique ID
        const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;

        // Render diagram
        const { svg } = await mermaid.render(id, cleanContent);

        if (mounted && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }

        setIsLoading(false);
      } catch (err) {
        console.error("Mermaid rendering error:", err);
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to render diagram"
          );
          setIsLoading(false);
        }
      }
    };

    void renderDiagram();

    return () => {
      mounted = false;
    };
  }, [content]);

  if (!content) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Rendering diagram...
            </span>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to render diagram: {error}
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && !error && (
          <div
            ref={containerRef}
            className="flex items-center justify-center p-4 bg-muted/30 rounded-lg overflow-x-auto"
          />
        )}
      </CardContent>
    </Card>
  );
}
