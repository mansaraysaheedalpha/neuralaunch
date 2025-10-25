// src/lib/api-response.ts
/**
 * API Response Utilities
 * 
 * Provides consistent response formatting for API routes
 */

import { NextResponse } from "next/server";

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
  message?: string;
}

export interface PaginatedResponse<T = unknown> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  timestamp: string;
}

/**
 * Create a success response
 */
export function successResponse<T>(
  data: T,
  message?: string,
  status = 200
): NextResponse<SuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      ...(message && { message }),
    },
    { status }
  );
}

/**
 * Create a paginated response
 */
export function paginatedResponse<T>(
  data: T[],
  page: number,
  perPage: number,
  total: number,
  status = 200
): NextResponse<PaginatedResponse<T>> {
  const totalPages = Math.ceil(total / perPage);
  
  return NextResponse.json(
    {
      success: true,
      data,
      pagination: {
        page,
        perPage,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

/**
 * Create a created response (201)
 */
export function createdResponse<T>(
  data: T,
  message?: string
): NextResponse<SuccessResponse<T>> {
  return successResponse(data, message, 201);
}

/**
 * Create a no content response (204)
 */
export function noContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Parse pagination parameters from URL search params
 */
export interface PaginationParams {
  page: number;
  perPage: number;
  skip: number;
}

export function parsePaginationParams(
  searchParams: URLSearchParams,
  defaultPerPage = 20,
  maxPerPage = 100
): PaginationParams {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const perPage = Math.min(
    maxPerPage,
    Math.max(1, parseInt(searchParams.get("perPage") || defaultPerPage.toString(), 10))
  );
  const skip = (page - 1) * perPage;

  return { page, perPage, skip };
}

/**
 * Add cache headers to response
 */
export function withCache(
  response: NextResponse,
  maxAge: number,
  staleWhileRevalidate?: number
): NextResponse {
  const cacheControl = staleWhileRevalidate
    ? `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`
    : `public, max-age=${maxAge}, s-maxage=${maxAge}`;

  response.headers.set("Cache-Control", cacheControl);
  return response;
}

/**
 * Add no-cache headers to response
 */
export function withNoCache(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
