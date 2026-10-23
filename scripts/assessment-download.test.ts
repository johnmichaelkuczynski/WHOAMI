import assert from "node:assert/strict";
import test from "node:test";
import { buildAssessmentDownload, hollandCode } from "../artifacts/who-am-i/src/lib/assessment-download";

type Result = Parameters<typeof buildAssessmentDownload>[0];

function fixture(kind: Result["kind"]): Result {
  const count = kind === "riasec" ? 60 : kind === "ipip" ? 50 : 5;
  return {
    id: 123,
    kind,
    verificationRun: false,
    completedAt: "2026-10-23T12:00:00Z",
    questions: Array.from({ length: count }, (_, index) => ({
      id: `item-${index}`,
      prompt: `Private question ${index + 1} <script>alert("unsafe")</script>`,
      trait: kind === "riasec" ? "Investigative" : "Extraversion",
      keying: index % 2 ? "reverse" : "forward",
    })),
    // Intentionally reversed: the export must join by questionId, not array order.
    answers: Array.from({ length: count }, (_, index) => ({ questionId: `item-${index}`, score: index % 5 + 1 })).reverse(),
    scores: kind === "riasec"
      ? [{ trait: "Investigative", score: 45 }, { trait: "Artistic", score: 40 }, { trait: "Social", score: 35 }]
      : [{ trait: "Extraversion", score: kind === "ipip" ? 32 : 64 }],
  };
}

for (const kind of ["riasec", "ipip", "interests", "personality"] as const) {
  test(`${kind}: report-only excludes questions and responses; combined export includes every original answer`, () => {
    const result = fixture(kind);
    const report = buildAssessmentDownload(result, false);
    const combined = buildAssessmentDownload(result, true);
    assert.match(report.filename, /-report\.html$/);
    assert.match(combined.filename, /-test-answers-and-report\.html$/);
    assert.ok(!report.html.includes("Private question"));
    assert.ok(!report.html.includes("<strong>Your answer:</strong>"));
    assert.ok(!report.html.includes('class="questions"'));
    assert.match(report.html, /2026/);
    assert.match(report.html, /Exploratory results, not a diagnosis/);
    assert.ok(report.html.includes(`/ ${kind === "riasec" || kind === "ipip" ? 50 : 100}`));
    assert.equal((combined.html.match(/class="prompt"/g) ?? []).length, result.questions.length);
    for (let index = 0; index < result.questions.length; index++) {
      const start = combined.html.indexOf(`Private question ${index + 1} &lt;script&gt;`);
      const end = combined.html.indexOf("</li>", start);
      assert.ok(start > 0);
      assert.ok(combined.html.slice(start, end).includes(`${index % 5 + 1} / 5`));
    }
    assert.ok(!combined.html.includes("<script>"));
    assert.ok(!combined.html.includes("<link "));
    if (kind === "riasec") assert.ok(report.html.includes("Your Holland code: IAS"));
    if (kind === "ipip") {
      assert.ok(combined.html.includes("before reverse-keying"));
      assert.ok(combined.html.includes("Somewhat inaccurate"));
    }
  });
}

test("saved result stays unchanged; QA and missing-answer status are explicit", () => {
  const result = fixture("ipip");
  result.verificationRun = true;
  result.answers = [];
  const before = JSON.stringify(result);
  const output = buildAssessmentDownload(result, true);
  assert.ok(output.html.includes("QA sample:"));
  assert.ok(output.html.includes("Not recorded"));
  assert.equal(JSON.stringify(result), before);
  assert.equal(hollandCode(fixture("riasec").scores), "IAS");
});
