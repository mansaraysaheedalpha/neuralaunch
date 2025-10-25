// src/lib/sanitize.ts
/**
 * Input Sanitization Utilities
 * 
 * Provides utilities to sanitize user input and prevent XSS attacks
 */

/**
 * Sanitize string input by escaping HTML special characters
 * Prevents XSS attacks by encoding dangerous characters
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
  };

  return input.replace(/[&<>"'/]/g, (char) => map[char] || char);
}

/**
 * Sanitize user input for display
 * Removes potentially dangerous characters while preserving readability
 */
export function sanitizeUserInput(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  // Remove null bytes
  let sanitized = input.replace(/\0/g, "");

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length to prevent DoS
  const MAX_LENGTH = 10000;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH);
  }

  return sanitized;
}

/**
 * Sanitize email address
 * Returns null if email is invalid
 */
export function sanitizeEmail(email: string): string | null {
  if (typeof email !== "string") {
    return null;
  }

  const sanitized = email.trim().toLowerCase();

  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    return null;
  }

  // Prevent email injection
  if (sanitized.includes("\n") || sanitized.includes("\r")) {
    return null;
  }

  return sanitized;
}

/**
 * Sanitize URL
 * Returns null if URL is invalid or uses disallowed protocol
 */
export function sanitizeUrl(url: string): string | null {
  if (typeof url !== "string") {
    return null;
  }

  const sanitized = url.trim();

  try {
    const parsedUrl = new URL(sanitized);
    
    // Only allow http and https protocols
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

/**
 * Sanitize slug for URLs
 * Converts string to URL-safe format
 */
export function sanitizeSlug(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Sanitize markdown content
 * Allows basic markdown but prevents script injection
 */
export function sanitizeMarkdown(markdown: string): string {
  if (typeof markdown !== "string") {
    return "";
  }

  // Remove script tags and event handlers
  let sanitized = markdown.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");
  sanitized = sanitized.replace(/javascript:/gi, "");

  return sanitized;
}

/**
 * Sanitize object for JSON storage
 * Removes potentially dangerous properties and limits depth
 */
export function sanitizeJsonObject<T extends Record<string, unknown>>(
  obj: T,
  maxDepth = 5,
  currentDepth = 0
): Record<string, unknown> {
  if (currentDepth >= maxDepth) {
    return {};
  }

  if (obj === null || typeof obj !== "object") {
    return obj as unknown as Record<string, unknown>;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => 
      typeof item === "object" && item !== null
        ? sanitizeJsonObject(item as Record<string, unknown>, maxDepth, currentDepth + 1)
        : item
    ) as unknown as Record<string, unknown>;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip __proto__ and constructor to prevent prototype pollution
    if (key === "__proto__" || key === "constructor") {
      continue;
    }

    if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeJsonObject(
        value as Record<string, unknown>,
        maxDepth,
        currentDepth + 1
      );
    } else if (typeof value === "string") {
      sanitized[key] = sanitizeUserInput(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Validate and sanitize file name
 * Prevents directory traversal attacks
 */
export function sanitizeFileName(fileName: string): string | null {
  if (typeof fileName !== "string") {
    return null;
  }

  // Remove path separators and null bytes
  const sanitized = fileName
    .replace(/[\/\\]/g, "")
    .replace(/\0/g, "")
    .trim();

  // Prevent hidden files
  if (sanitized.startsWith(".")) {
    return null;
  }

  // Check for valid file name
  if (!sanitized || sanitized.length > 255) {
    return null;
  }

  return sanitized;
}
