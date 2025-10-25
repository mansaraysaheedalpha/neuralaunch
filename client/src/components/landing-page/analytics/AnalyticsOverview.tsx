// src/components/landing-page/analytics/AnalyticsOverview.tsx
import React from "react";
import { AnalyticsApiResponse } from "../LandingPageBuilder";

interface AnalyticsOverviewProps {
  overview: AnalyticsApiResponse["overview"];
}

// Simple card component for stats
const StatCard = ({
  title,
  value,
  unit = "",
}: {
  title: string;
  value: string | number;
  unit?: string;
}) => (
  <div className="p-6 border rounded-2xl bg-card shadow-sm">
    <div className="text-sm font-medium text-muted-foreground mb-1">
      {title}
    </div>
    <div className="text-3xl font-bold text-foreground">
      {value}
      {unit && (
        <span className="text-lg ml-1 text-muted-foreground">{unit}</span>
      )}
    </div>
  </div>
);

const AnalyticsOverview: React.FC<AnalyticsOverviewProps> = ({ overview }) => {
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-4">Overview</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard title="Total Views" value={overview.totalViews} />
        <StatCard title="Unique Visitors" value={overview.uniqueVisitors} />
        <StatCard title="Email Signups" value={overview.signupCount} />
        <StatCard
          title="Conversion Rate"
          value={overview.conversionRate.toFixed(1)}
          unit="%"
        />
        <StatCard
          title="Avg. Time on Page"
          value={overview.avgTimeOnPage}
          unit="sec"
        />
        <StatCard
          title="Bounce Rate"
          value={overview.bounceRate.toFixed(1)}
          unit="%"
        />
      </div>
    </div>
  );
};

export default AnalyticsOverview;
