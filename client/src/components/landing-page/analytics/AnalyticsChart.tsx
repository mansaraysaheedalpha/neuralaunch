// src/components/landing-page/analytics/AnalyticsChart.tsx
"use client";

import React, { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  TooltipProps,
} from "recharts";
import {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import { AnalyticsApiResponse } from "../LandingPageBuilder";

interface AnalyticsChartsProps {
  chartData: AnalyticsApiResponse["charts"];
  primaryColor: string; // For line color
}

// Custom Tooltip for better formatting
const CustomTooltip = (props: TooltipProps<ValueType, NameType>) => {
  const { active } = props;
  // tooltip label and payload may not be declared on the TooltipProps type in some versions, extend the type safely
  type TooltipCustomProps = TooltipProps<ValueType, NameType> & {
    label?: string | number;
    payload?: Array<{ value?: number } | undefined>;
  };
  const tp = props as TooltipCustomProps;
  const label = tp.label;
  const payload = tp.payload;

  if (active && payload && payload.length) {
    return (
      <div className="bg-card/90 dark:bg-slate-800/90 backdrop-blur-sm p-3 border border-border rounded-lg shadow-md">
        <p className="text-sm font-semibold text-foreground">{`Date: ${label}`}</p>
        <p className="text-sm text-primary">{`Views: ${payload[0]?.value}`}</p>
      </div>
    );
  }
  return null;
};

const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({
  chartData,
  primaryColor,
}) => {
  const [timeframe, setTimeframe] = useState<"7days" | "30days">("7days");

  // Ensure dataToShow is always an array of { date: string; views: number }
  const dataToShow: { date: string; views: number }[] =
    timeframe === "7days"
      ? Array.isArray(chartData.last7Days)
        ? chartData.last7Days
        : []
      : Array.isArray(chartData.last30Days)
        ? chartData.last30Days
        : [];

  // Format date for XAxis (e.g., "Oct 24")
  const formatDateTick = (tickItem: string) => {
    try {
      const date = new Date(tickItem + "T00:00:00Z"); // Treat date string as UTC
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
    } catch {
      return tickItem; // Fallback
    }
  };

  return (
    <div className="p-6 border rounded-2xl bg-card shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-foreground">
          Page Views Trend
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setTimeframe("7days")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              timeframe === "7days"
                ? "bg-primary/10 text-primary"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            7 Days
          </button>
          <button
            onClick={() => setTimeframe("30days")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              timeframe === "30days"
                ? "bg-primary/10 text-primary"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            30 Days
          </button>
        </div>
      </div>

      {/* Chart Container - Ensure aspect ratio */}
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <LineChart
            data={dataToShow}
            margin={{ top: 5, right: 10, left: -20, bottom: 5 }} // Adjust margins
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border) / 0.5)"
            />
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickFormatter={formatDateTick}
              interval={timeframe === "30days" ? 6 : "preserveStartEnd"} // Dynamically adjust interval for 30 days if needed
              angle={-30} // Angle labels slightly if they overlap
              textAnchor="end" // Align angled labels
              dy={5} // Adjust vertical position of labels
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              allowDecimals={false}
              width={30} // Allocate space for YAxis labels
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: "hsl(var(--primary))",
                strokeWidth: 1,
                strokeDasharray: "3 3",
              }}
            />
            {/* <Legend /> */}
            <Line
              type="monotone"
              dataKey="views"
              stroke={primaryColor || "#8B5CF6"} // Use dynamic primary color
              strokeWidth={2}
              dot={{ r: 3, fill: primaryColor || "#8B5CF6" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AnalyticsCharts;
