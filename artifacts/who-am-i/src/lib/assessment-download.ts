import type { AssessmentResult } from "@workspace/api-client-react";
import {
  ONET_INTEREST_SOURCE,
  ONET_INTEREST_SOURCE_URL,
  occupationsForHollandCode,
  occupationsForHollandPrefix,
} from "../data/onet";

const LETTERS: Record<string, string> = {
  Realistic: "R", Investigative: "I", Artistic: "A", Social: "S", Enterprising: "E", Conventional: "C",
};

export const BIG_FIVE_DESCRIPTIONS: Record<string, string> = {
  Extraversion: "How much you tend to seek social interaction, visible activity, and outward engagement at work.",
  Agreeableness: "How much you tend to prioritize cooperation, tact, and consideration in working with others.",
  Conscientiousness: "How much you tend to prefer planning, organization, and steady follow-through.",
  "Emotional Stability": "How steady and composed you tend to feel under pressure; this is not a measure of resilience or worth.",
  "Intellect/Imagination": "How much you tend to enjoy ideas, learning, novelty, and imaginative problem-solving.",
};

const TITLES = {
  riasec: "Career interests test (RIASEC)",
  ipip: "Personality test (IPIP Big Five)",
  interests: "Career interests check-in",
  personality: "Work style & personality check-in",
};

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function hollandCode(scores: AssessmentResult["scores"]): string {
  return [...scores].sort((a, b) => b.score - a.score).slice(0, 3).map((score) => LETTERS[score.trait] ?? "").join("");
}

export function buildAssessmentDownload(result: AssessmentResult, includeTest: boolean) {
  const fullTest = result.kind === "riasec" || result.kind === "ipip";
  const maximum = fullTest ? 50 : 100;
  const title = TITLES[result.kind];
  const date = new Date(result.completedAt);
  const completed = Number.isNaN(date.getTime()) ? result.completedAt : date.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  const datePart = Number.isNaN(date.getTime()) ? "saved" : date.toISOString().slice(0, 10);
  const code = result.kind === "riasec" ? hollandCode(result.scores) : "";
  const exact = code ? occupationsForHollandCode(code) : [];
  const matches = exact.length ? exact : code ? occupationsForHollandPrefix(code.slice(0, 2)) : [];
  const ratings = result.kind === "riasec"
    ? ["Strongly dislike", "Dislike", "Neutral", "Like", "Strongly like"]
    : result.kind === "ipip"
      ? ["Very inaccurate", "Somewhat inaccurate", "Neither", "Somewhat accurate", "Very accurate"]
      : ["Not at all", "A little", "Somewhat", "Mostly", "Very much"];
  const scores = result.scores.map((score) => `<tr><th scope="row">${escapeHtml(score.trait)}</th><td>${escapeHtml(score.score)} / ${maximum}</td><td>${result.kind === "ipip" ? escapeHtml(BIG_FIVE_DESCRIPTIONS[score.trait] ?? "") : ""}</td></tr>`).join("");
  const occupations = code ? `<section><h2>Your Holland code: ${escapeHtml(code)}</h2>
    <p>Your three highest interest scales, ranked by score. These are interests, not aptitude ratings.</p>
    <h3>O*NET occupations with this interest pattern</h3>
    ${!exact.length && matches.length ? "<p>No exact three-letter match is listed; these examples share the first two letters.</p>" : ""}
    ${matches.length ? `<ul>${matches.slice(0, 6).map((match) => `<li><a href="https://www.onetonline.org/link/summary/${encodeURIComponent(match.code)}">${escapeHtml(match.title)}</a> (${escapeHtml(match.interestCode)})</li>`).join("")}</ul>` : "<p>No close occupation matches are available in this data release.</p>"}
    <p class="muted"><a href="${ONET_INTEREST_SOURCE_URL}">${escapeHtml(ONET_INTEREST_SOURCE)}</a></p></section>` : "";
  const answers = new Map(result.answers.map((answer) => [answer.questionId, answer.score]));
  const questionnaire = includeTest ? `<section><h2>Test questions & your answers</h2>
    <p>Response scale: ${ratings.map((label, index) => `${index + 1} = ${escapeHtml(label)}`).join(" · ")}</p>
    <p>Answers below are your original selections${result.kind === "ipip" ? ", before reverse-keying is applied to scoring" : ""}.</p>
    <ol class="questions">${result.questions.map((question) => {
      const answer = answers.get(question.id);
      const label = answer == null ? "Not recorded" : `${answer} / 5 — ${ratings[answer - 1] ?? "Unknown rating"}`;
      return `<li><p class="prompt">${escapeHtml(question.prompt)}</p><p class="muted">${escapeHtml(question.trait)}${question.keying ? ` · ${escapeHtml(question.keying)}-keyed` : ""}</p><p><strong>Your answer:</strong> ${escapeHtml(label)}</p></li>`;
    }).join("")}</ol></section>` : "";
  return {
    filename: `who-am-i-${result.kind}-${result.id}-${datePart}-${includeTest ? "test-answers-and-report" : "report"}.html`,
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${escapeHtml(title)} — ${includeTest ? "Test, answers & report" : "Report"}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f7f5f0;color:#27352f;font:16px/1.6 system-ui,sans-serif}main{max-width:950px;margin:36px auto;padding:36px;background:#fff;border:1px solid #ddd9cf;border-radius:16px}header{border-bottom:3px solid #39735b;padding-bottom:20px}h1,h2,h3{line-height:1.25}h1{font-size:30px}h2{margin-top:30px;color:#2e6550}.brand{color:#39735b;font-weight:700;letter-spacing:.08em}.muted{font-size:14px;color:#5c6862}a{color:#24694e}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:12px;border-bottom:1px solid #e1e6e1;vertical-align:top}thead{background:#e3f0e8}td:nth-child(2){white-space:nowrap}.notice{padding:14px;border-radius:8px;background:#f5eee0}.questions{padding-left:25px}.questions li{padding:10px 0;border-bottom:1px solid #e1e6e1;break-inside:avoid}.questions p{margin:5px 0}.prompt{font-weight:600}footer{margin-top:32px;border-top:1px solid #ddd;padding-top:16px;font-size:13px;color:#5c6862}@media(max-width:600px){main{margin:0;padding:20px;border:0;border-radius:0}th,td{padding:8px;font-size:12px}}@media print{body{background:white}main{border:0;margin:0;max-width:none;padding:0}a{color:inherit}thead{display:table-header-group}h2,h3{break-after:avoid}}
</style></head><body><main>
<header><p class="brand">WHO AM I?</p><h1>${escapeHtml(title)}</h1>
<p>${includeTest ? "Test, answers & report" : "Report only"} · Completed ${escapeHtml(completed)}</p>
<p class="muted">Saved assessment #${escapeHtml(result.id)} · ${result.questions.length} questions</p></header>
${result.verificationRun ? '<p class="notice"><strong>QA sample:</strong> These are sample responses, not a personal result.</p>' : ""}
<section><h2>Your results</h2><table><thead><tr><th>Scale</th><th>Score</th><th>What it explores</th></tr></thead><tbody>${scores}</tbody></table></section>
${occupations}
<p class="notice"><strong>Exploratory results, not a diagnosis.</strong> These freshly generated questions are inspired by RIASEC and Big Five structures, not the official validated O*NET or IPIP instruments. Results are not aptitude ratings, clinical diagnoses, or guarantees of career suitability.</p>
${questionnaire}
<footer>Who Am I? · Personal assessment export. This file contains private results${includeTest ? " and responses" : ""}; share it only with people you choose. Open in a browser to read offline, or use Print → Save as PDF.</footer>
</main></body></html>`,
  };
}

export function downloadAssessment(result: AssessmentResult, includeTest: boolean) {
  const file = buildAssessmentDownload(result, includeTest);
  const url = URL.createObjectURL(new Blob([file.html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start saving before releasing the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
