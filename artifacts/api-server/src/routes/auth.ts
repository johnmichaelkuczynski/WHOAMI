import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { OAuth2Client } from "google-auth-library";
import { and, eq, isNull } from "drizzle-orm";
import {
  appSessionsTable,
  appUsersTable,
  careerAssessmentsTable,
  careerConversationsTable,
  careerProfilesTable,
  careerRecommendationsTable,
  db,
} from "@workspace/db";
import { requireAuth, requireSameOrigin, makeCookie, getRequestOrigin, readCookie } from "../middlewares/auth";

const router: IRouter = Router();
const OAUTH_COOKIE = "who_am_i_google_oauth";
const SESSION_COOKIE = "who_am_i_session";
const SESSION_SECONDS = process.env.NODE_ENV === "development"
  ? 365 * 24 * 60 * 60
  : 30 * 24 * 60 * 60;
const OAUTH_SECONDS = 10 * 60;

type OAuthState = {
  state: string;
  nonce: string;
  verifier: string;
  expiresAt: number;
};

function credentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!clientId || !clientSecret || !sessionSecret) return null;
  return { clientId, clientSecret, sessionSecret };
}

function redirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

function signState(value: OAuthState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyStateCookie(value: string, secret: string): OAuthState | null {
  const [payload, signature, ...extra] = value.split(".");
  if (!payload || !signature || extra.length) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (
      typeof state.state !== "string" ||
      typeof state.nonce !== "string" ||
      typeof state.verifier !== "string" ||
      typeof state.expiresAt !== "number" ||
      state.expiresAt < Date.now()
    ) return null;
    return state;
  } catch {
    return null;
  }
}

function clearOAuthCookie(req: Parameters<typeof makeCookie>[0]): string {
  return makeCookie(req, OAUTH_COOKIE, "", 0);
}

router.get("/auth/google", (req, res): void => {
  const config = credentials();
  const origin = getRequestOrigin(req);
  if (!config || !origin) {
    res.status(503).send("Google sign-in is not configured for this app.");
    return;
  }

  const verifier = randomBytes(32).toString("base64url");
  const state: OAuthState = {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    verifier,
    expiresAt: Date.now() + OAUTH_SECONDS * 1000,
  };
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  res.setHeader("Set-Cookie", makeCookie(req, OAUTH_COOKIE, signState(state, config.sessionSecret), OAUTH_SECONDS));
  res.setHeader("Cache-Control", "no-store");

  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state: state.state,
    nonce: state.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  res.redirect(302, authorization.toString());
});

router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const config = credentials();
  const origin = getRequestOrigin(req);
  const cookie = readCookie(req, OAUTH_COOKIE);
  const state = config && cookie ? verifyStateCookie(cookie, config.sessionSecret) : null;
  res.setHeader("Set-Cookie", clearOAuthCookie(req));
  res.setHeader("Cache-Control", "no-store");

  const code = typeof req.query.code === "string" ? req.query.code : "";
  const returnedState = typeof req.query.state === "string" ? req.query.state : "";
  const googleError = typeof req.query.error === "string" ? req.query.error : "";
  if (googleError || !config || !origin || !state || state.state !== returnedState || !code) {
    req.log.warn({ hasCode: Boolean(code), hasStateCookie: Boolean(state), providerError: Boolean(googleError) }, "Google sign-in could not be completed");
    res.status(401).send("Google sign-in could not be completed. Return to the app and try again.");
    return;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri(origin),
        grant_type: "authorization_code",
        code_verifier: state.verifier,
      }),
    });
    if (!tokenResponse.ok) {
      req.log.warn({ statusCode: tokenResponse.status }, "Google authorization code exchange failed");
      res.status(401).send("Google sign-in could not be completed. Check the OAuth redirect URI and try again.");
      return;
    }
    const tokens = await tokenResponse.json() as { id_token?: string };
    if (!tokens.id_token) {
      res.status(401).send("Google did not return an identity token. Try signing in again.");
      return;
    }

    const verifier = new OAuth2Client(config.clientId);
    const ticket = await verifier.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
    const profile = ticket.getPayload();
    if (
      !profile?.sub ||
      !profile.email ||
      profile.email_verified !== true ||
      profile.nonce !== state.nonce
    ) {
      res.status(401).send("Google did not verify this account. Try signing in again.");
      return;
    }

    const userId = profile.sub;
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
    const sessionToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(sessionToken).digest("hex");

    await db.transaction(async (tx) => {
      await tx
        .insert(appUsersTable)
        .values({
          id: userId,
          email: profile.email!,
          name: profile.name || profile.email!,
          picture: profile.picture || null,
        })
        .onConflictDoUpdate({
          target: appUsersTable.id,
          set: {
            email: profile.email!,
            name: profile.name || profile.email!,
            picture: profile.picture || null,
            updatedAt: new Date(),
          },
        });

      // Existing single-user records have no owner yet. The first Google account
      // to sign in claims them once; later accounts only see their own rows.
      await tx.update(careerProfilesTable).set({ userId }).where(isNull(careerProfilesTable.userId));
      await tx.update(careerConversationsTable).set({ userId }).where(isNull(careerConversationsTable.userId));
      await tx.update(careerAssessmentsTable).set({ userId }).where(isNull(careerAssessmentsTable.userId));
      await tx.update(careerRecommendationsTable).set({ userId }).where(isNull(careerRecommendationsTable.userId));
      await tx.insert(appSessionsTable).values({ userId, tokenHash, expiresAt });
    });

    res.append("Set-Cookie", makeCookie(req, SESSION_COOKIE, sessionToken, SESSION_SECONDS));
    res.redirect(303, "/");
  } catch (error) {
    req.log.error({ err: error }, "Google OAuth callback failed");
    res.status(502).send("Google sign-in failed. Please try again.");
  }
});

router.get("/auth/me", requireAuth, (req, res): void => {
  if (!req.authUser) {
    res.status(401).json({ error: "Sign in with Google to continue." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({
    email: req.authUser.email,
    name: req.authUser.name,
    picture: req.authUser.picture,
    development: req.authUser.id.startsWith("dev:"),
  });
});

router.post("/auth/logout", requireAuth, requireSameOrigin, async (req, res): Promise<void> => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await db.delete(appSessionsTable).where(and(eq(appSessionsTable.tokenHash, tokenHash), eq(appSessionsTable.userId, req.authUser!.id)));
  }
  res.setHeader("Set-Cookie", makeCookie(req, SESSION_COOKIE, "", 0));
  res.setHeader("Cache-Control", "no-store");
  res.json({ loggedOut: true });
});

export default router;
