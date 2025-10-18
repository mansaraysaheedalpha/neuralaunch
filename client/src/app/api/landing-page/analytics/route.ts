// app/api/landing-page/analytics/route.ts
// API endpoint to get analytics data for a landing page

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    // Authentication
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get landing page ID from query params
    const { searchParams } = new URL(req.url);
    const landingPageId = searchParams.get("landingPageId");

    if (!landingPageId) {
      return NextResponse.json(
        { error: "Missing landingPageId parameter" },
        { status: 400 }
      );
    }

    // Verify ownership
    const landingPage = await prisma.landingPage.findFirst({
      where: {
        id: landingPageId,
        userId: session.user.id,
      },
    });

    if (!landingPage) {
      return NextResponse.json(
        { error: "Landing page not found or access denied" },
        { status: 404 }
      );
    }

    // Calculate date ranges
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get analytics data in parallel
    const [
      totalViews,
      uniqueVisitorGroups,
      signups,
      recentViews7Days,
      recentViews30Days,
      topSources,
    ] = await Promise.all([
      // Total page views
      prisma.pageView.count({
        where: { landingPageId },
      }),

      // Unique visitors (group by sessionId)
      prisma.pageView.groupBy({
        by: ["sessionId"],
        where: { landingPageId },
      }),

      // Email signups with details
      prisma.emailSignup.findMany({
        where: { landingPageId },
        orderBy: { createdAt: "desc" },
        take: 50, // Limit to recent 50
      }),

      // Views over last 7 days (for chart)
      prisma.$queryRaw<Array<{ date: Date; views: number }>>`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as views
        FROM "PageView"
        WHERE landing_page_id = ${landingPageId}
          AND created_at >= ${last7Days}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,

      // Views over last 30 days
      prisma.$queryRaw<Array<{ date: Date; views: number }>>`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as views
        FROM "PageView"
        WHERE landing_page_id = ${landingPageId}
          AND created_at >= ${last30Days}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,

      // Top traffic sources
      prisma.pageView.groupBy({
        by: ["utmSource"],
        where: {
          landingPageId,
          utmSource: { not: null },
        },
        _count: true,
        orderBy: {
          _count: {
            utmSource: "desc",
          },
        },
        take: 5,
      }),
    ]);

    // Calculate metrics
    const uniqueVisitors = uniqueVisitorGroups.length;
    const signupCount = signups.length;
    const conversionRate =
      uniqueVisitors > 0
        ? ((signupCount / uniqueVisitors) * 100).toFixed(1)
        : "0.0";

    // Calculate average time on page
    const avgTimeOnPage = await prisma.pageView.aggregate({
      where: {
        landingPageId,
        timeOnPage: { not: null },
      },
      _avg: {
        timeOnPage: true,
      },
    });

    const avgTime = avgTimeOnPage._avg.timeOnPage || 0;

    // Calculate bounce rate (visitors who didn't click CTA)
    const ctaClicks = await prisma.pageView.count({
      where: {
        landingPageId,
        ctaClicked: true,
      },
    });

    const bounceRate =
      uniqueVisitors > 0
        ? (((uniqueVisitors - ctaClicks) / uniqueVisitors) * 100).toFixed(1)
        : "0.0";

    // Format chart data (fill in missing dates)
    const formatChartData = (
      data: Array<{ date: Date; views: number }>,
      days: number
    ) => {
      const result = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];

        const found = data.find(
          (d) => new Date(d.date).toISOString().split("T")[0] === dateStr
        );

        result.push({
          date: dateStr,
          views: found ? Number(found.views) : 0,
        });
      }

      return result;
    };

    // Build response
    const analytics = {
      // Overview metrics
      overview: {
        totalViews,
        uniqueVisitors,
        signupCount,
        conversionRate: parseFloat(conversionRate),
        avgTimeOnPage: Math.round(avgTime),
        bounceRate: parseFloat(bounceRate),
        isPublished: landingPage.isPublished,
        publishedAt: landingPage.publishedAt,
      },

      // Chart data
      charts: {
        last7Days: formatChartData(recentViews7Days, 7),
        last30Days: formatChartData(recentViews30Days, 30),
      },

      // Recent signups
      recentSignups: signups.slice(0, 10).map((signup) => ({
        id: signup.id,
        email: signup.email,
        name: signup.name,
        createdAt: signup.createdAt,
        source: signup.source,
      })),

      // Traffic sources
      topSources: topSources.map((source) => ({
        source: source.utmSource || "Direct",
        count: source._count,
      })),

      // Landing page details
      landingPage: {
        id: landingPage.id,
        slug: landingPage.slug,
        title: landingPage.title,
        url: `https://ideaspark-three.vercel.app/${landingPage.slug}`,
        createdAt: landingPage.createdAt,
        updatedAt: landingPage.updatedAt,
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
