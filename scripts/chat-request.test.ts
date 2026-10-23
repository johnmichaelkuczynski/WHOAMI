import assert from "node:assert/strict";
import test from "node:test";
import { retryChatRequest } from "../artifacts/who-am-i/src/lib/chat-request";

test("a lost response is retried and returns one successful exchange", async () => {
  let attempts = 0;
  const retries: number[] = [];
  const response = await retryChatRequest(async () => {
    attempts++;
    if (attempts === 1) throw new TypeError("Failed to fetch");
    return { id: 42 };
  }, (attempt) => retries.push(attempt), async () => {});
  assert.equal(attempts, 2);
  assert.deepEqual(retries, [1]);
  assert.deepEqual(response, { id: 42 });
});

test("retries are bounded and do not replay authentication or validation failures", async () => {
  let attempts = 0;
  await assert.rejects(retryChatRequest(async () => {
    attempts++;
    throw new TypeError("Failed to fetch");
  }, () => {}, async () => {}), /Failed to fetch/);
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(retryChatRequest(async () => {
    attempts++;
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }, () => {}, async () => {}), /Unauthorized/);
  assert.equal(attempts, 1);
});
