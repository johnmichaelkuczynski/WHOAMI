import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { inArray } from "drizzle-orm";
import {
  appSessionsTable,
  appUsersTable,
  db,
  pool,
} from "@workspace/db";

const baseUrl = (process.env.API_BASE_URL ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
const baseOrigin = new URL(baseUrl).origin;

type RequestOptions = {
  method?: string;
  token?: string;
  body?: unknown;
};

async function request(path: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.token) headers.cookie = `who_am_i_session=${options.token}`;
  if (options.method && options.method !== "GET") headers.origin = baseOrigin;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Redirect responses and OAuth error pages are intentionally plain text.
  }
  return { response, body };
}

async function json(path: string, token?: string) {
  const result = await request(path, { token });
  assert.equal(
    result.response.ok,
    true,
    `GET ${path} returned ${result.response.status}: ${String(result.body).slice(0, 300)}`,
  );
  return result.body as Record<string, unknown>;
}

test("health is public and the preview has an authenticated development identity", async () => {
  const health = await json("/api/healthz");
  assert.deepEqual(health, { status: "ok" });

  const me = await request("/api/auth/me");
  const profile = await request("/api/discovery/profile");
  if (me.response.status === 200) {
    const signedIn = me.body as { development?: boolean };
    assert.equal(signedIn.development, true, "unauthenticated access is only allowed for the development preview identity");
    assert.equal(profile.response.status, 200);
  } else {
    assert.equal(me.response.status, 401, "production must require a Google session");
    assert.equal(profile.response.status, 401, "production must protect personal data");
  }
});

test("Google sign-in starts an OAuth authorization-code flow with PKCE", async () => {
  const { response } = await request("/api/auth/google");
  assert.equal(response.status, 302);
  const location = response.headers.get("location");
  assert.ok(location, "Google authorization redirect is present");
  const authorization = new URL(location);
  assert.equal(authorization.origin, "https://accounts.google.com");
  assert.equal(authorization.searchParams.get("response_type"), "code");
  assert.match(authorization.searchParams.get("scope") ?? "", /openid/);
  assert.match(authorization.searchParams.get("scope") ?? "", /email/);
  assert.ok((authorization.searchParams.get("state") ?? "").length >= 32);
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.ok((authorization.searchParams.get("code_challenge") ?? "").length >= 40);
});

test("profile and conversation data stay isolated between Google accounts", async () => {
  const suffix = randomUUID();
  const userIds = [`auth-test-a-${suffix}`, `auth-test-b-${suffix}`];
  const tokens = [randomBytes(32).toString("base64url"), randomBytes(32).toString("base64url")];
  try {
    await db.transaction(async (tx) => {
      await tx.insert(appUsersTable).values([
        { id: userIds[0], email: `auth-a-${suffix}@example.invalid`, name: "Account A" },
        { id: userIds[1], email: `auth-b-${suffix}@example.invalid`, name: "Account B" },
      ]);
      await tx.insert(appSessionsTable).values(userIds.map((userId, index) => ({
        userId,
        tokenHash: createHash("sha256").update(tokens[index]).digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
      })));
    });

    const [profileA, profileB] = await Promise.all([
      request("/api/discovery/profile", { token: tokens[0] }),
      request("/api/discovery/profile", { token: tokens[1] }),
    ]);
    assert.equal(profileA.response.status, 200);
    assert.equal(profileB.response.status, 200);

    const updateA = await request("/api/discovery/profile", {
      method: "PATCH",
      token: tokens[0],
      body: { summary: "Private account A marker", strengths: [], interests: [], workPreferences: [] },
    });
    assert.equal(updateA.response.status, 200);

    const profileAAfter = await json("/api/discovery/profile", tokens[0]);
    const profileBAfter = await json("/api/discovery/profile", tokens[1]);
    assert.equal(profileAAfter.summary, "Private account A marker");
    assert.notEqual(profileBAfter.summary, "Private account A marker");

    const conversationA = await request("/api/discovery/conversations", {
      method: "POST",
      token: tokens[0],
      body: { title: `Private A ${suffix}` },
    });
    const conversationB = await request("/api/discovery/conversations", {
      method: "POST",
      token: tokens[1],
      body: { title: `Private B ${suffix}` },
    });
    assert.equal(conversationA.response.status, 201);
    assert.equal(conversationB.response.status, 201);

    const [listA, listB] = await Promise.all([
      json("/api/discovery/conversations", tokens[0]),
      json("/api/discovery/conversations", tokens[1]),
    ]);
    const rowsA = listA as unknown as Array<{ id: number; title: string }>;
    const rowsB = listB as unknown as Array<{ id: number; title: string }>;
    const createdA = rowsA.find((row) => row.title === `Private A ${suffix}`);
    assert.ok(createdA, "Account A sees its own conversation");
    assert.ok(!rowsB.some((row) => row.title === `Private A ${suffix}`), "Account B cannot see Account A's conversation");

    const crossAccountMessages = await request(
      `/api/discovery/conversations/${createdA.id}/messages`,
      { token: tokens[1] },
    );
    assert.equal(crossAccountMessages.response.status, 404);
  } finally {
    await db.delete(appUsersTable).where(inArray(appUsersTable.id, userIds));
  }
});

test("a completed check-in appears in Past check-ins", async (t) => {
  const targetHost = new URL(baseUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(targetHost)) {
    t.skip("assessment flow tests only write to the local development API");
    return;
  }

  const suffix = randomUUID();
  const userId = `assessment-test-${suffix}`;
  const token = randomBytes(32).toString("base64url");
  try {
    await db.transaction(async (tx) => {
      await tx.insert(appUsersTable).values({
        id: userId,
        email: `assessment-${suffix}@example.invalid`,
        name: "Assessment test",
      });
      await tx.insert(appSessionsTable).values({
        userId,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
      });
    });

    const start = await request("/api/discovery/assessments/start", {
      method: "POST",
      token,
      body: { kind: "interests", verificationRun: true },
    });
    assert.equal(start.response.status, 201, JSON.stringify(start.body));
    const session = start.body as {
      id: number;
      kind: string;
      verificationRun: boolean;
      questions: Array<{ id: string }>;
    };
    assert.equal(session.kind, "interests");
    assert.equal(session.verificationRun, true);
    assert.ok(session.questions.length > 0);

    const answers = session.questions.map((question, index) => ({
      questionId: question.id,
      score: (index % 5) + 1,
    }));
    assert.equal(answers.length, session.questions.length);
    const submit = await request(`/api/discovery/assessments/${session.id}/submit`, {
      method: "POST",
      token,
      body: { answers },
    });
    assert.equal(submit.response.status, 201, JSON.stringify(submit.body));
    const savedResult = submit.body as {
      id: number;
      kind: string;
      verificationRun: boolean;
      scores: Array<{ trait: string; score: number }>;
      completedAt: string;
      profileUpdated: boolean;
    };
    assert.equal(savedResult.id, session.id);
    assert.equal(savedResult.kind, "interests");
    assert.equal(savedResult.verificationRun, true);
    assert.equal(savedResult.profileUpdated, false);
    assert.ok(savedResult.scores.length > 0);
    assert.ok(Number.isFinite(Date.parse(savedResult.completedAt)));

    const pastCheckIns = await json("/api/discovery/assessments", token) as unknown as Array<{
      id: number;
      kind: string;
      scores: Array<{ trait: string; score: number }>;
      completedAt: string;
    }>;
    const saved = pastCheckIns.find((result) => result.id === session.id);
    assert.ok(saved, "submitted check-in should appear in Past check-ins");
    assert.equal(saved.kind, "interests");
    assert.deepEqual(saved.scores, savedResult.scores);
    assert.equal(saved.completedAt, savedResult.completedAt);
  } finally {
    await db.delete(appUsersTable).where(inArray(appUsersTable.id, [userId]));
  }
});

after(async () => {
  await pool.end();
});
