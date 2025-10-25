// src/components/landing-page/analytics/TrafficSources.tsx
import React from "react";
import { AnalyticsApiResponse } from "../LandingPageBuilder";

interface TrafficSourcesProps {
  sources: AnalyticsApiResponse["topSources"];
}

const TrafficSources: React.FC<TrafficSourcesProps> = ({ sources }) => {
  const totalSourceCount = sources.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="p-6 border rounded-2xl bg-card shadow-sm h-full">
      {" "}
      {/* Added h-full */}
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Top Traffic Sources
      </h3>
      {sources.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No referral or UTM source data yet.
        </p>
      ) : (
        <div className="space-y-3">
          {sources.map((source, index) => {
            const percentage =
              totalSourceCount > 0
                ? (source.count / totalSourceCount) * 100
                : 0;
            return (
              <div key={index}>
                <div className="flex justify-between items-center text-sm mb-1">
                  <span className="font-medium text-foreground truncate max-w-[70%]">
                    {source.source}
                  </span>
                  <span className="text-muted-foreground">
                    {source.count} visits
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full"
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TrafficSources;
