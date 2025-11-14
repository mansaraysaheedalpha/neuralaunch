// src/components/monitoring/MetricsChart.tsx
"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface MetricPoint {
  time: string;
  responseTime: number;
  errorRate: number;
  requests: number;
}

interface MetricsChartProps {
  projectId: string;
}

export default function MetricsChart({ projectId }: MetricsChartProps) {
  const [data, setData] = useState<MetricPoint[]>([]);

  useEffect(() => {
    // Generate mock data for demo purposes
    // In production, this would fetch real metrics data
    const generateMockData = (): MetricPoint[] => {
      const now = Date.now();
      const points: MetricPoint[] = [];
      for (let i = 23; i >= 0; i--) {
        const timestamp = now - i * 60 * 60 * 1000; // Last 24 hours
        points.push({
          time: new Date(timestamp).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          responseTime: Math.floor(100 + Math.random() * 100),
          errorRate: Math.random() * 2,
          requests: Math.floor(100 + Math.random() * 200),
        });
      }
      return points;
    };

    setData(generateMockData());
  }, [projectId]);

  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        Loading metrics...
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="time"
          className="text-xs"
          tick={{ fill: "hsl(var(--muted-foreground))" }}
        />
        <YAxis
          className="text-xs"
          tick={{ fill: "hsl(var(--muted-foreground))" }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "0.5rem",
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="responseTime"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          name="Response Time (ms)"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="errorRate"
          stroke="hsl(0 70% 55%)"
          strokeWidth={2}
          name="Error Rate (%)"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
