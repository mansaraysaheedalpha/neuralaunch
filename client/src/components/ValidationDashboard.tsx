"use client";

import { useState, FormEvent, useEffect } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import toast from "react-hot-toast";
import { ValidationHub } from "@prisma/client"; // Import the type

interface ApiError {
  error?: string;
  issues?: unknown;
}

// This is a custom error class for SWR
class FetchError extends Error {
  status: number;
  info: ApiError;
  constructor(message: string, status: number, info: ApiError) {
    super(message);
    this.status = status;
    this.info = info;
  }
}

const fetcher = async (url: string): Promise<ValidationHub> => {
  const res = await fetch(url);
  if (!res.ok) {
    const info = (await res.json()) as ApiError;
    throw new FetchError(info.error || "An error occurred", res.status, info);
  }
  return (await res.json()) as ValidationHub;
};

// Helper component for the score "Donut"
const ScoreDonut = ({ score }: { score: number | null }) => {
  const safeScore = score ?? 0;
  const circumference = 2 * Math.PI * 50; // r = 50
  const offset = circumference - (safeScore / 100) * circumference;

  let colorClass = "text-red-500";
  if (safeScore >= 70) colorClass = "text-green-500";
  else if (safeScore >= 40) colorClass = "text-yellow-500";

  return (
    <div className="relative flex items-center justify-center w-40 h-40">
      <svg className="absolute w-full h-full" viewBox="0 0 120 120">
        <circle
          className="text-gray-200 dark:text-gray-700"
          strokeWidth="10"
          stroke="currentColor"
          fill="transparent"
          r="50"
          cx="60"
          cy="60"
        />
        <circle
          className={`${colorClass} transition-all duration-1000 ease-in-out`}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r="50"
          cx="60"
          cy="60"
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span className={`text-4xl font-bold ${colorClass}`}>
        {safeScore.toFixed(0)}
      </span>
    </div>
  );
};

// Helper for sub-scores
const SubScore = ({
  title,
  score,
  max,
}: {
  title: string;
  score: number | null;
  max: number;
}) => (
  <div className="p-4 bg-white/50 dark:bg-gray-800/50 rounded-lg shadow-inner">
    <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
      {title}
    </div>
    <div className="text-2xl font-bold text-gray-900 dark:text-white">
      {(score ?? 0).toFixed(0)}
      <span className="text-base font-normal text-gray-400"> / {max}</span>
    </div>
  </div>
);

export default function ValidationDashboard() {
  const params = useParams();
  const conversationId = params.conversationId as string;

  // --- State for the form ---
  const [interviewCount, setInterviewCount] = useState<number>(0);
  const [interviewNotes, setInterviewNotes] = useState<string>("");
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // --- Data Fetching with SWR ---
  const {
    data: hubData,
    error: fetchError, // fetchError is now type FetchError | undefined
    isLoading: isLoadingData,
    mutate,
  } = useSWR<ValidationHub, FetchError>(
    conversationId ? `/api/validation/${conversationId}` : null,
    fetcher
  );

  // --- Sync SWR data with form state ---
  // --- Sync SWR data with form state ---
  useEffect(() => {
    if (hubData) {
      setInterviewCount(hubData.customerInterviewCount ?? 0);
      setInterviewNotes(hubData.interviewNotes ?? "");
    }
  }, [hubData]);

  // --- Handle Form Submission ---
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsCalculating(true);
    setError(null);
    const toastId = toast.loading("Calculating your score...");

    try {
      const res = await fetch(`/api/validation/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerInterviewCount: interviewCount,
          interviewNotes,
        }),
      });

      if (!res.ok) {
        // --- FIX 2.1: Cast the error json to our ApiError type ---
        // This fixes errors 2, 3, and 4 (lines 123, 124)
        const err = (await res.json()) as ApiError;
        throw new Error(err.error || "Failed to calculate score");
      }
      // --- FIX 2.2: Cast the success json to ValidationHub ---
      // This fixes error 5 (line 127)
      const updatedHubData = (await res.json()) as ValidationHub;

      // Update local SWR cache with new data
      await mutate(updatedHubData, false);

      toast.success("Validation Score Updated!", { id: toastId });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unknown error occurred.";
      setError(message);
      toast.error(message, { id: toastId });
    } finally {
      setIsCalculating(false);
    }
  };

  if (isLoadingData) {
    return (
      <div className="flex justify-center items-center h-64">
        Loading Validation Hub...
      </div>
    );
  }
  if (fetchError) {
    return (
      <div className="text-red-500">
        Error loading validation data: {fetchError.message}
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded-2xl shadow-lg">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
        Validation Score
      </h2>

      {/* --- 1. The Dashboard --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Total Score Donut */}
        <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow">
          <ScoreDonut score={hubData?.totalValidationScore ?? null} />
          <div className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-200">
            Total Validation Score
          </div>
        </div>

        {/* Sub-Scores & AI Insight */}
        <div className="space-y-4">
          {/* --- THIS IS THE RESPONSIVE FIX --- */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* - 'grid-cols-1' = stack vertically by default (on mobile)
              - 'sm:grid-cols-3' = become 3 columns on small screens and up
            */}
            <SubScore
              title="Market Demand"
              score={hubData?.marketDemandScore ?? null}
              max={40}
            />
            <SubScore
              title="Problem Validation"
              score={hubData?.problemValidationScore ?? null}
              max={50}
            />
            <SubScore
              title="Execution"
              score={hubData?.executionScore ?? null}
              max={10}
            />
          </div>

          {/* AI Insight Box */}
          {hubData?.aiInsight && (
            <div className="p-4 bg-blue-50 border border-blue-200 dark:bg-blue-900/30 dark:border-blue-700 rounded-lg">
              <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                🚀 AI Advisor Insight
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {hubData.aiInsight}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* --- 2. The Input Form --- */}
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="space-y-6"
      >
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          Update Your Validation Data
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Add your customer interview notes. The more notes you add, the smarter
          the AI analysis will be.
        </p>

        <div>
          <label
            htmlFor="interviewCount"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            How many customer interviews have you completed?
          </label>
          <input
            type="number"
            id="interviewCount"
            value={interviewCount}
            onChange={(e) => setInterviewCount(Number(e.target.value))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-primary focus:border-primary"
            min="0"
          />
        </div>

        <div>
          <label
            htmlFor="interviewNotes"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Interview Notes
          </label>
          <textarea
            id="interviewNotes"
            rows={8}
            value={interviewNotes}
            onChange={(e) => setInterviewNotes(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-primary focus:border-primary"
            placeholder="Paste all your raw notes here. e.g., 'User 1 said they hated finding a parking spot...', 'User 2 mentioned they use a competitor app but don't like it...'"
          />
        </div>

        {error && <div className="text-red-500 text-sm">{error}</div>}

        <button
          type="submit"
          disabled={isCalculating}
          className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCalculating ? "Calculating..." : "Calculate My Score"}
        </button>
      </form>
    </div>
  );
}
