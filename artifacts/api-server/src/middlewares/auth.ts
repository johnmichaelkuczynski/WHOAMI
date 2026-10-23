import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { appSessionsTable, appUsersTable, db, type AppUser } from "@workspace/db";

const SESSION_COOKIE = "who_am_i_session";
let cachedDevelopmentUser: AppUser | null = null;

async function getDevelopmentUser(): Promise<AppUser | null> {
  if (process.env.NODE_ENV !== "development" || !process.env.REPL_ID) return null;
  if (cachedDevelopmentUser) return cachedDevelopmentUser;

  const id = `dev:${process.env.REPL_ID}`;
  await db
    .insert(appUsersTable)
    .values({ id, email: "development-preview@replit.local", name: "Development preview" })
    .onConflictDoNothing();
  const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, id)).limit(1);
  cachedDevelopmentUser = user ?? null;
  return cachedDevelopmentUser;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AppUser;
    }
  }
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim() || null;
    }
  }
  return null;
}

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}

export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) {
    const developmentUser = await getDevelopmentUser();
    if (developmentUser) {
      request.authUser = developmentUser;
      next();
      return;
    }
    response.status(401).json({ error: "Sign in with Google to continue." });
    return;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [session] = await db
    .select({ userId: appSessionsTable.userId })
    .from(appSessionsTable)
    .where(and(eq(appSessionsTable.tokenHash, tokenHash), gt(appSessionsTable.expiresAt, new Date())))
    .limit(1);
  if (!session) {
    const developmentUser = await getDevelopmentUser();
    if (developmentUser) {
      request.authUser = developmentUser;
      next();
      return;
    }
    response.status(401).json({ error: "Your sign-in has expired. Sign in again." });
    return;
  }

  const [user] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.id, session.userId))
    .limit(1);
  if (!user) {
    const developmentUser = await getDevelopmentUser();
    if (developmentUser) {
      request.authUser = developmentUser;
      next();
      return;
    }
    response.status(401).json({ error: "Your sign-in is no longer valid. Sign in again." });
    return;
  }

  request.authUser = user;
  next();
}

function requestOrigin(request: Request): string | null {
  const forwardedHost = request.get("x-forwarded-host")?.split(",")[0].trim();
  const host = forwardedHost || request.get("host");
  const forwardedProtocol = request.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = (forwardedProtocol || request.protocol).toLowerCase();
  if (!host || (protocol !== "https" && protocol !== "http")) return null;
  return `${protocol}://${host}`;
}

export function isSecureRequest(request: Request): boolean {
  return requestOrigin(request)?.startsWith("https://") ?? false;
}

export function makeCookie(
  request: Request,
  name: string,
  value: string,
  maxAgeSeconds: number,
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isSecureRequest(request)) parts.push("Secure");
  return parts.join("; ");
}

export function requireSameOrigin(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    next();
    return;
  }
  const origin = request.get("origin");
  const expectedOrigin = requestOrigin(request);
  if (!origin || !expectedOrigin || origin !== expectedOrigin) {
    response.status(403).json({ error: "This request must come from the signed-in app." });
    return;
  }
  next();
}

export function getRequestOrigin(request: Request): string | null {
  return requestOrigin(request);
}

export function readCookie(request: Request, name: string): string | null {
  return cookieValue(request, name);
}
