// src/app/(app)/projects/[id]/deployment/page.tsx
"use client";

import { use } from "react";
import useSWR from "swr";
import {
  ArrowLeft,
  Rocket,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Globe,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DeploymentCard from "@/components/deployment/DeploymentCard";
import DeploymentHistory from "@/components/deployment/DeploymentHistory";
import toast from "react-hot-toast";

interface DeploymentPageProps {
  params: Promise<{
    id: string;
  }>;
}

interface Deployment {
  id: string;
  environment: string;
  status: string;
  url?: string;
  platform?: string;
  deployedAt?: string;
  duration?: number;
  createdAt: Date | string;
  commitMessage?: string;
  commitHash?: string;
}

interface DeploymentsResponse {
  deployments: Deployment[];
}

const fetcher = (url: string) => fetch(url).then((res) => res.json() as Promise<DeploymentsResponse>);

export default function DeploymentDashboardPage({
  params,
}: DeploymentPageProps) {
  const { id: projectId } = use(params);
  const router = useRouter();

  // Fetch deployments
  const { data: deploymentsData, error, mutate } = useSWR<DeploymentsResponse, Error>(
    `/api/projects/${projectId}/deployments`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const handleDeploy = async (environment: "preview" | "production") => {
    try {
      const response = await fetch(`/api/projects/${projectId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment }),
      });

      if (!response.ok) {
        const error = await response.json() as { message?: string };
        throw new Error(error.message ?? "Failed to deploy");
      }

      await response.json();
      toast.success(
        `Deployment started! Environment: ${environment}. This will take 2-3 minutes.`
      );
      void mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start deployment"
      );
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Error Loading Deployments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {error?.message ?? "Failed to load deployment data"}
            </p>
            <Button onClick={() => router.push("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!deploymentsData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading deployments...</p>
        </div>
      </div>
    );
  }

  const deployments = deploymentsData.deployments || [];
  const previewDeployment = deployments.find(
    (d) => d.environment === "preview" && d.status !== "failed"
  );
  const productionDeployment = deployments.find(
    (d) => d.environment === "production" && d.status !== "failed"
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/projects/${projectId}/execution`}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Execution
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Deployment Management
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage preview and production deployments
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Deployment Cards Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Preview Deployment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-purple-500" />
                Preview Environment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {previewDeployment ? (
                <DeploymentCard
                  deployment={{
                    environment: "preview",
                    status: previewDeployment.status as "failed" | "deploying" | "live",
                    url: previewDeployment.url || "",
                    platform: previewDeployment.platform || "",
                    deployedAt: previewDeployment.deployedAt
                      ? new Date(previewDeployment.deployedAt)
                      : undefined,
                    duration: previewDeployment.duration,
                  }}
                  onRedeploy={() => { void handleDeploy("preview"); }}
                />
              ) : (
                <div className="text-center py-8">
                  <Globe className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground mb-4">
                    No preview deployment yet
                  </p>
                  <Button
                    onClick={() => { void handleDeploy("preview"); }}
                    variant="outline"
                    className="w-full"
                  >
                    <Rocket className="w-4 h-4 mr-2" />
                    Deploy to Preview
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Production Deployment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Production Environment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {productionDeployment ? (
                <DeploymentCard
                  deployment={{
                    environment: "production",
                    status: productionDeployment.status as "failed" | "deploying" | "live",
                    url: productionDeployment.url || "",
                    platform: productionDeployment.platform || "",
                    deployedAt: productionDeployment.deployedAt
                      ? new Date(productionDeployment.deployedAt)
                      : undefined,
                    duration: productionDeployment.duration,
                  }}
                  onRedeploy={() => { void handleDeploy("production"); }}
                />
              ) : (
                <div className="text-center py-8">
                  <Rocket className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground mb-4">
                    No production deployment yet
                  </p>
                  <Button
                    onClick={() => { void handleDeploy("production"); }}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <Rocket className="w-4 h-4 mr-2" />
                    Deploy to Production
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Deployment History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Deployment History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DeploymentHistory deployments={deployments} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
