// src/components/landing-page/analytics/FeedbackSection.tsx
import React from "react";
import type { AnalyticsApiResponse } from "../LandingPageBuilder";

interface FeedbackSectionProps {
  feedback: AnalyticsApiResponse["feedback"];
  primaryColor: string;
}

// --- Rating Distribution Chart (Reusable) ---
const RatingDistributionChart = ({
  title,
  distribution,
  barColorClass,
}: {
  title: string;
  distribution: number[];
  barColorClass: string;
}) => {
  if (
    !distribution ||
    distribution.length !== 11 ||
    distribution.every((count) => count === 0)
  ) {
    return (
      <p className="text-muted-foreground text-sm mt-4 pt-4 border-t border-border/50">
        No rating data yet.
      </p>
    );
  }
  const maxCount = Math.max(...distribution, 1);

  return (
    <div className="mt-6 pt-4 border-t border-border/50">
      <h4 className="text-sm font-semibold mb-3 text-foreground">
        {title} (0-10)
      </h4>
      <div className="flex items-end gap-1 h-24 pb-1">
        {distribution.map((count, rating) => (
          <div
            key={rating}
            className="flex-1 flex flex-col items-center justify-end group relative pt-2"
            title={`${count} vote(s)`}
          >
            <div
              className={`w-full rounded-t transition-all duration-200 ${barColorClass}`}
              style={{ 
                height: `${Math.max(4, (count / maxCount) * 100)}%`,
                minWidth: '4px'
              }}
            ></div>
            <span className="text-[10px] text-muted-foreground mt-1 group-hover:font-semibold">
              {rating}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Vote Distribution Chart (Reusable for Features/Pricing) ---
const VoteDistributionChart = ({
  title,
  votes,
  barColorClass,
}: {
  title: string;
  votes: { name: string; count: number }[];
  barColorClass: string;
}) => {
  if (!votes || votes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm mt-4 pt-4 border-t border-border/50">
        No votes yet.
      </p>
    );
  }
  const maxCount = Math.max(...votes.map((v) => v.count), 1);
  const sortedVotes = votes.sort((a, b) => b.count - a.count); // Sort by count

  return (
    <div className="mt-6 pt-4 border-t border-border/50">
      <h4 className="text-sm font-semibold mb-4 text-foreground">{title}</h4>
      <div className="space-y-3">
        {sortedVotes.map((vote) => (
          <div key={vote.name}>
            <div className="flex justify-between items-center text-sm mb-1.5">
              <span
                className="font-medium text-foreground truncate max-w-[60%]"
                title={vote.name}
              >
                {vote.name}
              </span>
              <span className="text-muted-foreground">
                {vote.count} vote(s)
              </span>
            </div>
            <div className="w-full bg-muted/70 rounded-full h-2">
              <div
                className={`${barColorClass} h-2 rounded-full`}
                style={{ width: `${(vote.count / maxCount) * 100}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
// --------------------------------------------------

const FeedbackSection: React.FC<FeedbackSectionProps> = ({
  feedback,
}) => {
  // Fallback for accent color if not defined
  const accentColorClass = "bg-accent"; // Assuming 'bg-accent' is defined in your globals.css
  // If not, use a fallback like 'bg-blue-500'

  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-4">User Feedback</h2>
      {/* --- 2x2 Grid for Ratings and Votes --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Problem Rating Card */}
        <div className="p-6 border rounded-2xl bg-card shadow-sm">
          <h3 className="text-lg font-semibold text-foreground mb-3">
            Problem Score
          </h3>
          <div className="text-sm text-muted-foreground mb-1">
            Average Problem Rating
          </div>
          <div className="text-4xl font-bold text-foreground">
            {feedback.averageProblemRating.toFixed(1)}
            <span className="text-lg text-muted-foreground"> / 10</span>
          </div>
          <RatingDistributionChart
            title="Rating Distribution"
            distribution={feedback.ratingDistribution}
            barColorClass="bg-primary" // Use primary color class
          />
        </div>

        {/* 2. Solution Rating Card */}
        <div className="p-6 border rounded-2xl bg-card shadow-sm">
          <h3 className="text-lg font-semibold text-foreground mb-3">
            Solution Score
          </h3>
          <div className="text-sm text-muted-foreground mb-1">
            Average Solution Rating
          </div>
          <div className="text-4xl font-bold text-foreground">
            {feedback.averageSolutionRating?.toFixed(1) || "0.0"}
            <span className="text-lg text-muted-foreground"> / 10</span>
          </div>
          <RatingDistributionChart
            title="Rating Distribution"
            distribution={feedback.solutionRatingDistribution || []}
            barColorClass={accentColorClass} // Use accent color class
          />
        </div>

        {/* 3. Feature Votes Card */}
        <div className="p-6 border rounded-2xl bg-card shadow-sm">
          <h3 className="text-lg font-semibold text-foreground mb-3">
            Feature Prioritization
          </h3>
          <VoteDistributionChart
            title="Most Voted Features"
            votes={feedback.featureVoteDistribution || []}
            barColorClass="bg-primary"
          />
        </div>

        {/* 4. Pricing Votes Card */}
        <div className="p-6 border rounded-2xl bg-card shadow-sm">
          <h3 className="text-lg font-semibold text-foreground mb-3">
            Pricing Preference
          </h3>
          <VoteDistributionChart
            title="Most Voted Tiers"
            votes={feedback.pricingVoteDistribution || []}
            barColorClass={accentColorClass}
          />
        </div>
        {/* ---------------------------------- */}
      </div>

      {/* Survey Responses Card (Spans full width below) */}
      <div className="mt-6 p-6 border rounded-2xl bg-card shadow-sm">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Micro-Survey Responses
        </h3>
        {feedback.surveyResponses.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No survey responses yet.
          </p>
        ) : (
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-3">
            {feedback.surveyResponses.map((res, index) => (
              <div
                key={index}
                className="p-3 border rounded-lg bg-muted/50 text-sm"
              >
                {res.response1 && (
                  <p>
                    <strong className="font-medium text-foreground">
                      Reason:
                    </strong>{" "}
                    <span className="text-muted-foreground">
                      {res.response1}
                    </span>
                  </p>
                )}
                {res.response2 && (
                  <p className="mt-1">
                    <strong className="font-medium text-foreground">
                      Current solution:
                    </strong>{" "}
                    <span className="text-muted-foreground">
                      {res.response2}
                    </span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground/70 mt-1.5">
                  {new Date(res.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackSection;
