import assert from "node:assert/strict";
import test from "node:test";
import { register } from "tsx/esm/api";

register();
const { createQueryClient } = await import(
  "../artifacts/who-am-i/src/lib/query-client.ts"
);

const baseUrl = (process.env.API_BASE_URL ?? "http://127.0.0.1:8080").replace(/\/+$/, "");

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.text();

  assert.equal(
    response.ok,
    true,
    `GET ${path} returned ${response.status}: ${body.slice(0, 300)}`,
  );

  try {
    return JSON.parse(body);
  } catch {
    assert.fail(`GET ${path} did not return valid JSON: ${body.slice(0, 300)}`);
  }
}

test("API health check is available", async () => {
  assert.deepEqual(await getJson("/api/healthz"), { status: "ok" });
});

test("career profile loads", async () => {
  const profile = await getJson("/api/discovery/profile");
  assert.equal(typeof profile.id, "number");
  assert.equal(typeof profile.summary, "string");
  assert.ok(Array.isArray(profile.strengths));
  assert.ok(Array.isArray(profile.interests));
  assert.ok(Array.isArray(profile.workPreferences));
});

test("dashboard data loads with counts and profile", async () => {
  const dashboard = await getJson("/api/discovery/dashboard");
  assert.equal(typeof dashboard.profile?.id, "number");
  assert.equal(typeof dashboard.conversationCount, "number");
  assert.equal(typeof dashboard.assessmentCount, "number");
  assert.equal(typeof dashboard.recommendationCount, "number");
  assert.ok(Array.isArray(dashboard.recentActivity));
});

test("reflection list loads", async () => {
  assert.ok(Array.isArray(await getJson("/api/discovery/conversations")));
});

test("past check-ins load", async () => {
  assert.ok(Array.isArray(await getJson("/api/discovery/assessments")));
});

test("check-in queries recover after a brief API failure", async () => {
  const queryClient = createQueryClient();
  let attempts = 0;

  try {
    const results = await queryClient.fetchQuery({
      queryKey: ["check-in-recovery-smoke-test"],
      queryFn: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new TypeError("Failed to fetch");
        }
        return [{ id: 1 }];
      },
    });

    assert.deepEqual(results, [{ id: 1 }]);
    assert.equal(attempts, 2);
    assert.equal(
      queryClient.getDefaultOptions().queries?.refetchOnReconnect,
      true,
    );
    assert.equal(
      queryClient.getDefaultOptions().queries?.refetchOnWindowFocus,
      true,
    );
  } finally {
    queryClient.clear();
  }
});

test("recommendations load", async () => {
  assert.ok(Array.isArray(await getJson("/api/discovery/recommendations")));
});
