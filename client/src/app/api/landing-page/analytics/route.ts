// src/app/api/landing-page/analytics/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";
import {
  checkRateLimit,
  RATE_LIMITS,
  getRequestIdentifier,
  getClientIp,
} from "@/lib/rate-limit";

const prismaClient = prisma as unknown as PrismaClient;

// Helper function to format chart data
const formatChartData = (
  data: Array<{ date: Date | string; views: bigint | number }>,
  days: number
) => {
  const result = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const viewMap = new Map<string, number>();
  data.forEach((d) => {
    const dateStr =
      typeof d.date === "string"
        ? d.date.split("T")[0]
        : d.date.toISOString().split("T")[0];
    viewMap.set(dateStr, Number(d.views));
  });

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    result.push({
      date: dateStr,
      views: viewMap.get(dateStr) || 0,
    });
  }
  return result;
};

export async function GET(req: NextRequest) {
  try {
    // --- Authentication & Ownership Verification ---
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // Rate limiting
    const clientIp = getClientIp(req.headers);
    const rateLimitId = getRequestIdentifier(userId, clientIp);
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMITS.API_READ,
      identifier: rateLimitId,
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: `Too many requests. Please try again in ${rateLimitResult.retryAfter} seconds.`,
          retryAfter: rateLimitResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimitResult.retryAfter?.toString() || "60",
            "X-RateLimit-Limit": RATE_LIMITS.API_READ.maxRequests.toString(),
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": new Date(rateLimitResult.resetAt).toISOString(),
          },
        }
      );
    }

    const { searchParams } = new URL(req.url);
    const landingPageId = searchParams.get("landingPageId");

    if (!landingPageId) {
      return NextResponse.json(
        { error: "Missing landingPageId parameter" },
        { status: 400 }
      );
    }

    const landingPage = await prisma.landingPage.findFirst({
      where: { id: landingPageId, userId: userId },
      select: {
        id: true,
        slug: true,
        title: true,
        isPublished: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!landingPage) {
      return NextResponse.json(
        { error: "Landing page not found or access denied" },
        { status: 404 }
      );
    }
    // ---------------------------------------------

    // --- Fetch All Analytics Data in Parallel ---
    const now = new Date();
    const last7Days = new Date(now);
    last7Days.setUTCDate(last7Days.getUTCDate() - 6);
    last7Days.setUTCHours(0, 0, 0, 0);
    const last30Days = new Date(now);
    last30Days.setUTCDate(last30Days.getUTCDate() - 29);
    last30Days.setUTCHours(0, 0, 0, 0);

    const totalViewsQuery = prismaClient.pageView.count({
      where: { landingPageId },
    });
    const uniqueVisitorGroupsQuery = prismaClient.pageView.groupBy({
      by: ["sessionId"],
      where: { landingPageId },
    });
    const signupsQuery = prismaClient.emailSignup.findMany({
      where: { landingPageId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        source: true,
        surveyResponse1: true,
        surveyResponse2: true,
      },
      take: 100,
    });
    const recentViews7DaysQuery = prismaClient.$queryRaw<
      Array<{ date: string; views: bigint }>
    >`
      SELECT DATE("createdAt")::text as date, COUNT(*) as views
      FROM "PageView"
      WHERE "landingPageId" = ${landingPageId} AND "createdAt" >= ${last7Days}
      GROUP BY DATE("createdAt") ORDER BY date ASC`;
    const recentViews30DaysQuery = prismaClient.$queryRaw<
      Array<{ date: string; views: bigint }>
    >`
      SELECT DATE("createdAt")::text as date, COUNT(*) as views
      FROM "PageView"
      WHERE "landingPageId" = ${landingPageId} AND "createdAt" >= ${last30Days}
      GROUP BY DATE("createdAt") ORDER BY date ASC`;
    const _topSourcesQuery = prismaClient.pageView.groupBy({
      by: ["utmSource"],
      where: { landingPageId, utmSource: { not: null } },
      _count: { utmSource: true },
      orderBy: { _count: { utmSource: "desc" } },
      take: 5,
    });
    const problemRatingsQuery = prismaClient.landingPageFeedback.findMany({
      where: { landingPageId: landingPageId, feedbackType: "problem_rating" },
      select: { value: true },
    }) as Promise<Array<{ value: string | null }>>;

    // --- ADDED SOLUTION RATING QUERY ---
    const solutionRatingsQuery = prismaClient.landingPageFeedback.findMany({
      where: { landingPageId: landingPageId, feedbackType: "solution_rating" },
      select: { value: true },
    }) as Promise<Array<{ value: string | null }>>;

    const featureVotesQuery = prismaClient.landingPageFeedback.findMany({
      where: { landingPageId: landingPageId, feedbackType: "feature_vote" },
      select: { value: true }, // 'value' will store the feature title
    }) as Promise<Array<{ value: string | null }>>;

    // --- ADD PRICING VOTE QUERY ---
    const pricingVotesQuery = prismaClient.landingPageFeedback.findMany({
      where: { landingPageId: landingPageId, feedbackType: "pricing_vote" },
      select: { value: true }, // 'value' will store the tier name
    }) as Promise<Array<{ value: string | null }>>;
    // -----------------------------------

    const avgTimeQuery = prismaClient.pageView.aggregate({
      where: { landingPageId, timeOnPage: { not: null } },
      _avg: { timeOnPage: true },
    });
    const ctaClicksQuery = prismaClient.pageView.count({
      where: { landingPageId, ctaClicked: true },
    });

    const utmSourcesQuery = prismaClient.pageView.groupBy({
      by: ["utmSource"],
      where: { landingPageId, utmSource: { not: null } },
      _count: { utmSource: true },
      orderBy: { _count: { utmSource: "desc" } },
      take: 10, // Fetch a few more initially
    });

    const referrersQuery = prismaClient.pageView.groupBy({
      by: ["referrer"],
      // Only count referrers for views *without* a UTM source
      where: { landingPageId, utmSource: null, referrer: { not: null } },
      _count: { referrer: true },
      orderBy: { _count: { referrer: "desc" } },
      take: 10, // Fetch a few more initially
    });

    const [
      totalViews,
      uniqueVisitorGroups,
      signupsWithSurvey,
      recentViews7Days,
      recentViews30Days,
      utmSources,
      referrers,
      problemRatingsFeedback,
      solutionRatingsFeedback, // <-- Added
      featureVotes,
      pricingVotes,
      avgTimeOnPage,
      ctaClicks,
    ] = await Promise.all([
      totalViewsQuery,
      uniqueVisitorGroupsQuery,
      signupsQuery,
      recentViews7DaysQuery,
      recentViews30DaysQuery,
      utmSourcesQuery, // <-- New query execution
      referrersQuery,
      problemRatingsQuery,
      solutionRatingsQuery, // <-- Added
      featureVotesQuery,
      pricingVotesQuery,
      avgTimeQuery,
      ctaClicksQuery,
    ]);

    const validProblemRatings = problemRatingsFeedback.filter(
      (p): p is { value: string } => p.value !== null && p.value !== undefined
    );
    const validSolutionRatings = solutionRatingsFeedback.filter(
      (p): p is { value: string } => p.value !== null && p.value !== undefined
    );
    const validFeatureVotes = featureVotes.filter(
      (p): p is { value: string } => !!p.value
    );
    const validPricingVotes = pricingVotes.filter(
      (p): p is { value: string } => !!p.value
    );

    // --- Process Analytics ---
    const uniqueVisitors = uniqueVisitorGroups.length;
    const signupCount = signupsWithSurvey.length;
    const conversionRate =
      uniqueVisitors > 0 ? (signupCount / uniqueVisitors) * 100 : 0;
    const avgTime = Math.round(avgTimeOnPage._avg?.timeOnPage || 0);

    // --- FIXED BOUNCE RATE LOGIC ---
    // (Unique visitors who did not click the CTA) / (Total unique visitors)
    const bouncedSessions = uniqueVisitors - ctaClicks;
    const bounceRate =
      uniqueVisitors > 0 ? (bouncedSessions / uniqueVisitors) * 100 : 0;
    // -------------------------------

    // --- Process Feedback ---
    const processRatings = (
      ratings: Array<{ value: string }>
    ): { average: number; distribution: number[] } => {
      let average = 0;
      const distribution: number[] = Array.from({ length: 11 }, () => 0);
      let validCount = 0;
      let sum = 0;

      ratings.forEach((feedback) => {
        const rating = parseInt(feedback.value, 10);
        if (!isNaN(rating) && rating >= 0 && rating <= 10) {
          sum += rating;
          distribution[rating]++;
          validCount++;
        }
      });
      if (validCount > 0) {
        average = sum / validCount;
      }
      return { average, distribution };
    };

    // Helper function to count string votes (for features and pricing)
    const processVotes = (
      votes: Array<{ value: string }>
    ): { name: string; count: number }[] => {
      const voteCounts = new Map<string, number>();
      votes.forEach((vote) => {
        voteCounts.set(vote.value, (voteCounts.get(vote.value) || 0) + 1);
      });
      return Array.from(voteCounts.entries()).map(([name, count]) => ({
        name,
        count,
      }));
    };

    const problemRatingData = processRatings(validProblemRatings);
    const solutionRatingData = processRatings(validSolutionRatings);
    const featureVoteDistribution = processVotes(validFeatureVotes);
    const pricingVoteDistribution = processVotes(validPricingVotes);

    const surveyResponses = signupsWithSurvey
      .filter((signup) => signup.surveyResponse1 || signup.surveyResponse2)
      .map((signup) => ({
        email: signup.email,
        response1: signup.surveyResponse1,
        response2: signup.surveyResponse2,
        createdAt: signup.createdAt,
      }))
      .slice(0, 50);
    // -----------------------

    const combinedSources: { source: string; count: number }[] = [];

    // Add UTM sources first
    utmSources.forEach((source) => {
      if (source.utmSource) {
        combinedSources.push({
          source: source.utmSource,
          count: source._count.utmSource ?? 0,
        });
      }
    });

    // Add referrers, trying to extract domain for cleaner display
    referrers.forEach((ref) => {
      if (ref.referrer) {
        let sourceName = "Referral"; // Default
        try {
          const url = new URL(ref.referrer);
          sourceName = url.hostname.replace(/^www\./, ""); // Extract domain like 'google.com'
        } catch {
          // If referrer is not a valid URL, use it as is (or keep 'Referral')
          sourceName = ref.referrer.substring(0, 30); // Truncate long invalid referrers
        }
        // Check if this domain (or similar) already exists from UTMs
        const existingIndex = combinedSources.findIndex(
          (s) => s.source.toLowerCase() === sourceName.toLowerCase()
        );
        if (existingIndex !== -1) {
          combinedSources[existingIndex].count += ref._count.referrer ?? 0;
        } else {
          combinedSources.push({
            source: sourceName,
            count: ref._count.referrer ?? 0,
          });
        }
      }
    });

    // Calculate Direct traffic (Total views - views with UTM - views with Referrer)
    const trackedViewsCount =
      utmSources.reduce((sum, s) => sum + (s._count.utmSource ?? 0), 0) +
      referrers.reduce((sum, r) => sum + (r._count.referrer ?? 0), 0);
    const directViews = totalViews - trackedViewsCount;
    if (directViews > 0) {
      combinedSources.push({ source: "Direct", count: directViews });
    }

    // Sort combined list and take top 5
    const top5Sources = combinedSources
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // --- Format Final Response ---
    const analytics = {
      overview: {
        totalViews,
        uniqueVisitors,
        signupCount,
        conversionRate: parseFloat(conversionRate.toFixed(1)),
        avgTimeOnPage: avgTime,
        bounceRate: parseFloat(bounceRate.toFixed(1)), // <-- Use calculated value
        isPublished: landingPage.isPublished,
        publishedAt: landingPage.publishedAt?.toISOString() || null,
      },
      charts: {
        last7Days: formatChartData(recentViews7Days, 7),
        last30Days: formatChartData(recentViews30Days, 30),
      },
      recentSignups: signupsWithSurvey.slice(0, 10).map((signup) => ({
        id: signup.id,
        email: signup.email,
        name: signup.name,
        createdAt: signup.createdAt.toISOString(),
        source: signup.source,
      })),
      topSources: top5Sources,
      landingPage: {
        id: landingPage.id,
        slug: landingPage.slug,
        title: landingPage.title,
        url: `${env.NEXT_PUBLIC_APP_URL || ""}/lp/${landingPage.slug}`,
        createdAt: landingPage.createdAt.toISOString(),
        updatedAt: landingPage.updatedAt.toISOString(),
      },
      feedback: {
        averageProblemRating: parseFloat(problemRatingData.average.toFixed(1)),
        ratingDistribution: problemRatingData.distribution,
        averageSolutionRating: parseFloat(
          solutionRatingData.average.toFixed(1)
        ), // <-- Added
        solutionRatingDistribution: solutionRatingData.distribution, // <-- Added
        featureVoteDistribution: featureVoteDistribution,
        pricingVoteDistribution: pricingVoteDistribution,
        surveyResponses: surveyResponses.map((res) => ({
          ...res,
          createdAt: res.createdAt.toISOString(),
        })),
      },
    };

    return NextResponse.json(analytics);
  } catch (error) {
    console.error("[LANDING_PAGE_ANALYTICS]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
