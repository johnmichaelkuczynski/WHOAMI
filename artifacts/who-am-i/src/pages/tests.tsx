import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Sparkles } from "lucide-react";
import {
  getGetCareerProfileQueryKey,
  getGetDiscoveryDashboardQueryKey,
  getListAssessmentResultsQueryKey,
  useListAssessmentResults,
  useStartAssessment,
  useSubmitAssessment,
} from "@workspace/api-client-react";
import type { AssessmentQuestion, AssessmentResult, AssessmentSession } from "@workspace/api-client-react";
import { AssessmentDownloads } from "@/components/assessment-downloads";
import { BIG_FIVE_DESCRIPTIONS, hollandCode } from "@/lib/assessment-download";
import {
  ONET_INTEREST_SOURCE,
  ONET_INTEREST_SOURCE_URL,
  occupationsForHollandCode,
  occupationsForHollandPrefix,
} from "@/data/onet";

const RIASEC_RATINGS = ["Strongly dislike", "Dislike", "Neutral", "Like", "Strongly like"];
const IPIP_RATINGS = ["Very inaccurate", "Somewhat inaccurate", "Neither", "Somewhat accurate", "Very accurate"];

function labelForKind(kind: string) {
  if (kind === "riasec") return "O*NET Interest Profiler style";
  if (kind === "ipip") return "IPIP Big Five style";
  if (kind === "interests") return "Career interests check-in";
  return "Work style check-in";
}

function dateLabel(value: string | Date) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function QueryError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-5">
      <p className="text-sm font-medium">This part didn’t load.</p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      <button onClick={retry} className="mt-3 text-xs font-semibold text-primary underline underline-offset-4">
        Try again
      </button>
    </div>
  );
}

function ScoreRows({ result }: { result: AssessmentResult }) {
  return (
    <div className="space-y-3">
      {result.scores.map((score) => (
        <div key={score.trait}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-xs font-medium">{score.trait}</span>
            <span className="font-mono text-[11px]">{score.score} / 50</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(100, score.score * 2))}%` }}
            />
          </div>
          {result.kind === "ipip" && (
            <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
              {BIG_FIVE_DESCRIPTIONS[score.trait] ?? ""}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function ResultSummary({ result }: { result: AssessmentResult }) {
  const code = result.kind === "riasec" ? hollandCode(result.scores) : "";
  const exactMatches = code ? occupationsForHollandCode(code) : [];
  const matches = exactMatches.length ? exactMatches : code ? occupationsForHollandPrefix(code.slice(0, 2)) : [];

  return (
    <section
      className="rounded-2xl border border-primary/20 bg-[hsl(152_24%_91%)] p-5 md:p-7"
      data-testid="test-result"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mono-label text-[9px] text-primary">YOUR RESULT · EXPLORATORY</p>
          <h2 className="serif-display mt-2 text-[28px]">{labelForKind(result.kind)}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Completed {dateLabel(result.completedAt)}
            {result.verificationRun ? " · QA sample answers, not a personal result" : ""}
          </p>
        </div>
        <span className="grid size-10 place-items-center rounded-full bg-card text-primary">
          <CheckCircle2 size={20} />
        </span>
      </div>
      <AssessmentDownloads result={result} />
      {result.profileUpdated && !result.verificationRun && (
        <p role="status" className="mt-4 rounded-lg border border-primary/15 bg-card/70 px-3 py-2 text-[11px]">
          Your profile now includes this test alongside saved conversation summaries.
        </p>
      )}
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.8fr)]">
        <ScoreRows result={result} />
        {result.kind === "riasec" && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mono-label text-[9px] text-muted-foreground">YOUR HOLLAND CODE</p>
            <p className="serif-display mt-1 text-4xl tracking-[.12em]" data-testid="text-holland-code">
              {code}
            </p>
            <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
              Your three highest interest scales, ranked by score. These are interests, not aptitude ratings.
            </p>
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-[11px] font-semibold">O*NET occupations with this interest pattern</p>
              {!exactMatches.length && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  No exact three-letter match is listed, so these examples share the first two letters.
                </p>
              )}
              {matches.length ? (
                <ul className="mt-2 space-y-1.5">
                  {matches.slice(0, 6).map((occupation) => (
                    <li key={occupation.code} className="text-[11px]">
                      <a
                        className="font-medium text-primary underline underline-offset-2"
                        href={`https://www.onetonline.org/link/summary/${occupation.code}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {occupation.title}
                      </a>
                      <span className="ml-2 font-mono text-[9px] text-muted-foreground">
                        {occupation.interestCode}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  No close occupation matches are available in this data release.
                </p>
              )}
              <a
                className="mt-3 inline-block text-[9px] text-muted-foreground underline underline-offset-2"
                href={ONET_INTEREST_SOURCE_URL}
                target="_blank"
                rel="noreferrer"
              >
                {ONET_INTEREST_SOURCE}
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ScoreHistory({ results }: { results: AssessmentResult[] }) {
  const testKinds = ["riasec", "ipip"] as const;
  return (
    <div className="mt-8">
      <div className="mb-4">
        <p className="mono-label text-[9px] text-muted-foreground">YOUR SCORES OVER TIME</p>
        <h2 className="serif-display mt-1 text-[27px]">Past results</h2>
      </div>
      {testKinds.map((kind) => {
        const runs = results
          .filter((result) => result.kind === kind)
          .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
        if (!runs.length) return null;
        const displayedRuns = runs.slice(0, 6);
        const traitNames = [...new Set(displayedRuns.flatMap((run) => run.scores.map((score) => score.trait)))];
        return (
          <section key={kind} className="mb-5 overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h3 className="serif-display text-[22px]">{labelForKind(kind)}</h3>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {runs.length} saved {runs.length === 1 ? "administration" : "administrations"} · each score is out of 50
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[10px]">
                <thead className="bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Scale</th>
                    {displayedRuns.map((run) => (
                      <th key={run.id} className="px-3 py-3 font-medium">
                        <span className="block">{dateLabel(run.completedAt)}</span>
                        {run.verificationRun && <span className="text-[8px] text-primary">QA sample</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {traitNames.map((trait) => (
                    <tr key={trait} className="border-t border-border">
                      <th className="px-5 py-3 font-medium">{trait}</th>
                      {displayedRuns.map((run) => (
                        <td key={run.id} className="px-3 py-3 font-mono">
                          {run.scores.find((score) => score.trait === trait)?.score ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {results.every((result) => result.kind !== "riasec" && result.kind !== "ipip") && (
        <p className="rounded-xl border border-dashed border-border px-5 py-6 text-center text-xs text-muted-foreground">
          Your completed test scores will be saved here so you can compare each scale over time.
        </p>
      )}
      <div className="space-y-3">
        {results
          .filter((result) => result.kind === "riasec" || result.kind === "ipip")
          .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
          .map((result) => (
            <details key={result.id} className="rounded-xl border border-border bg-card p-4" data-testid={`test-history-${result.id}`}>
              <summary className="cursor-pointer text-[11px] font-semibold">
                {labelForKind(result.kind)} · {dateLabel(result.completedAt)}
                {result.verificationRun ? " · QA sample" : ""}
                <span className="ml-2 font-normal text-muted-foreground">
                  Show all {result.questions.length} generated items and answers
                </span>
              </summary>
              <AssessmentDownloads result={result} />
              <div className="mt-4 space-y-3 border-t border-border pt-4">
                <ScoreRows result={result} />
                {result.questions.map((question, index) => {
                  const answer = result.answers.find((entry) => entry.questionId === question.id);
                  return (
                    <div key={question.id} className="rounded-lg bg-background p-3" data-testid={`history-question-${question.id}`}>
                      <p className="text-[10px] leading-5">
                        <span className="mr-2 font-mono text-primary">{String(index + 1).padStart(2, "0")}</span>
                        {question.prompt}
                      </p>
                      <p className="mt-1 text-[9px] text-muted-foreground">
                        {question.trait}
                        {question.keying ? ` · ${question.keying}-keyed` : ""}
                        {" · "}
                        Answer: {answer?.score ?? "not recorded"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
      </div>
    </div>
  );
}

export default function TestsPage() {
  const queryClient = useQueryClient();
  const history = useListAssessmentResults();
  const start = useStartAssessment();
  const submit = useSubmitAssessment();
  const [session, setSession] = useState<AssessmentSession | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState("");
  const [verificationRun, setVerificationRun] = useState(false);

  const ratings = session?.kind === "riasec" ? RIASEC_RATINGS : IPIP_RATINGS;
  const pageSize = 10;
  const questions = session?.questions ?? [];
  const pageCount = Math.ceil(questions.length / pageSize);
  const pageQuestions = questions.slice(page * pageSize, (page + 1) * pageSize);
  const unansweredQuestions = questions.filter((question) => answers[question.id] == null);
  const answeredCount = questions.length - unansweredQuestions.length;
  const pageUnanswered = pageQuestions.filter((question) => answers[question.id] == null);

  const navigateToPage = (nextPage: number, questionId?: string) => {
    setPage(nextPage);
    requestAnimationFrame(() => {
      const target = document.getElementById(questionId ? `assessment-question-${questionId}` : "assessment-page-top");
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
      target?.focus({ preventScroll: true });
    });
  };

  const begin = (kind: "riasec" | "ipip") => {
    setError("");
    setResult(null);
    start.mutate(
      { data: { kind, ...(import.meta.env.DEV && verificationRun ? { verificationRun: true } : {}) } },
      {
        onSuccess: (value) => {
          setSession(value);
          setAnswers({});
          setPage(0);
        },
        onError: (cause) => setError(cause instanceof Error ? cause.message : "The questions could not be created."),
      },
    );
  };

  const finish = () => {
    if (!session) return;
    if (unansweredQuestions.length > 0) {
      const firstMissing = unansweredQuestions[0];
      setError(`Please answer the ${unansweredQuestions.length} remaining question${unansweredQuestions.length === 1 ? "" : "s"} before saving. You have been taken to the first unanswered question.`);
      navigateToPage(Math.floor(questions.findIndex((question) => question.id === firstMissing.id) / pageSize), firstMissing.id);
      return;
    }
    setError("");
    submit.mutate(
      {
        id: session.id,
        data: {
          answers: session.questions.map((question) => ({
            questionId: question.id,
            score: answers[question.id],
          })),
        },
      },
      {
        onSuccess: async (value) => {
          setResult(value);
          setSession(null);
          setAnswers({});
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: getListAssessmentResultsQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetDiscoveryDashboardQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetCareerProfileQueryKey() }),
          ]);
        },
        onError: (cause) => setError(cause instanceof Error ? cause.message : "The results could not be saved."),
      },
    );
  };

  return (
    <div className="fade-up">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono-label mb-2 text-[9px] text-primary">CAREER INTERESTS AND PERSONALITY</p>
          <h1 className="serif-display text-[36px] leading-none tracking-[-.02em] md:text-[44px]">Diagnostic tests</h1>
          <p className="mt-3 max-w-2xl text-xs leading-5 text-muted-foreground">
            Fresh, original questions are generated for every run. These are exploratory reflections inspired by RIASEC and Big Five structures—not the official validated O*NET or IPIP instruments.
          </p>
        </div>
        {import.meta.env.DEV && (
          <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={verificationRun}
              onChange={(event) => setVerificationRun(event.target.checked)}
              data-testid="checkbox-verification-run"
            />
            Mark next run as QA sample; keep it out of my profile
          </label>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-5 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-xs text-destructive" data-testid="status-test-error">
          {error}
        </div>
      )}
      {history.isError && !session && (
        <div className="mb-5">
          <QueryError
            message={history.error instanceof Error ? history.error.message : "Could not load test history."}
            retry={() => void history.refetch()}
          />
        </div>
      )}
      {start.isPending && (
        <div role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
          <LoaderCircle size={15} className="animate-spin" /> Creating a new set of original questions…
        </div>
      )}

      {session ? (
        <section className="rounded-2xl border border-border bg-card p-5 md:p-7" data-testid="test-session">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <p className="mono-label text-[9px] text-primary">
                {session.kind === "riasec" ? "RIASEC INTERESTS" : "IPIP BIG FIVE STYLE"} · {session.questions.length} NEW ITEMS
              </p>
              <h2 className="serif-display mt-2 text-[27px]">
                {session.kind === "riasec" ? "How much would you enjoy each activity?" : "How accurately does each statement describe you?"}
              </h2>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {session.verificationRun
                  ? "QA sample run. These responses will be saved as a test entry and excluded from your profile."
                  : "Answer for your usual experience. Your items and responses will be saved with this result."}
              </p>
            </div>
            <button
              onClick={() => { setSession(null); setAnswers({}); setPage(0); }}
              data-testid="button-exit-test"
              className="rounded-lg border border-border px-3 py-2 text-[10px] text-muted-foreground hover:bg-secondary"
            >
              Leave test
            </button>
          </div>

          <div id="assessment-page-top" tabIndex={-1} className="mb-5 scroll-mt-6">
            <div className="mb-2 flex justify-between text-[10px] text-muted-foreground">
              <span>Page {page + 1} of {pageCount}</span>
              <span>{answeredCount} of {session.questions.length} answered</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(answeredCount / session.questions.length) * 100}%` }} />
            </div>
          </div>

          <div className="space-y-4">
            {pageQuestions.map((question: AssessmentQuestion, index) => (
              <article key={question.id} id={`assessment-question-${question.id}`} tabIndex={-1} className="scroll-mt-6 rounded-xl border border-border p-4 md:p-5" data-testid={`test-item-${question.id}`}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <p className="max-w-3xl text-[12px] font-medium leading-5">
                    <span className="mr-2 font-mono text-[10px] text-primary">{String(page * pageSize + index + 1).padStart(2, "0")}</span>
                    {question.prompt}
                  </p>
                  <span className="rounded-full bg-secondary px-2 py-1 text-[8px] text-muted-foreground">
                    {question.trait}{question.keying ? ` · ${question.keying}-keyed` : ""}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                  {ratings.map((label, ratingIndex) => {
                    const value = ratingIndex + 1;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={answers[question.id] === value}
                        title={label}
                         onClick={() => {
                           setAnswers((current) => ({ ...current, [question.id]: value }));
                           setError("");
                         }}
                        data-testid={`test-answer-${question.id}-${value}`}
                        className={`min-h-12 rounded-lg border px-1 py-2 text-center transition-colors ${answers[question.id] === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"}`}
                      >
                        <span className="block text-[11px] font-semibold">{value}</span>
                        <span className="mt-0.5 block text-[7px] leading-3 sm:text-[9px]">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>

          {pageUnanswered.length > 0 && (
            <div className="mt-5 rounded-lg border border-border bg-secondary/40 p-3 text-xs" data-testid="test-unanswered-notice" aria-live="polite">
              <p>You can move to the next page now. Before saving, answer these questions:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {pageUnanswered.map((question) => (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => navigateToPage(page, question.id)}
                    className="rounded-md border border-border bg-background px-2 py-1 font-medium text-primary underline underline-offset-2"
                  >
                    Question {questions.indexOf(question) + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => navigateToPage(Math.max(0, page - 1))}
              disabled={page === 0}
              data-testid="button-test-previous"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-[10px] disabled:opacity-40"
            >
              <ArrowLeft size={13} /> Previous
            </button>
            {page < pageCount - 1 ? (
              <button
                 onClick={() => navigateToPage(page + 1)}
                data-testid="button-test-next"
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2.5 text-[10px] font-semibold text-primary-foreground disabled:opacity-40"
              >
                Next page <ArrowRight size={13} />
              </button>
            ) : (
              <button
                onClick={finish}
                 disabled={submit.isPending}
                data-testid="button-test-submit"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[10px] font-semibold text-primary-foreground disabled:opacity-40"
              >
                {submit.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Save my results
              </button>
            )}
          </div>
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-border bg-[hsl(36_40%_94%)] p-5 md:p-7">
            <p className="mono-label text-[9px] text-primary">60 WORK ACTIVITIES · 10 PER SCALE</p>
            <h2 className="serif-display mt-3 text-[28px]">Career interests test (RIASEC)</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Explore Realistic, Investigative, Artistic, Social, Enterprising, and Conventional interests. Scores are summed from 10 ratings per scale.
            </p>
            <p className="mt-3 text-[10px] text-muted-foreground">Strongly Dislike · Dislike · Neutral · Like · Strongly Like</p>
            <button
              onClick={() => begin("riasec")}
              disabled={start.isPending}
              data-testid="button-start-riasec"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              Start career interests test — 60 questions
            </button>
          </section>
          <section className="rounded-2xl border border-border bg-[hsl(152_24%_91%)] p-5 md:p-7">
            <p className="mono-label text-[9px] text-primary">50 PERSONALITY STATEMENTS · 10 PER TRAIT</p>
            <h2 className="serif-display mt-3 text-[28px]">Personality test (IPIP Big Five)</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Reflect on Extraversion, Agreeableness, Conscientiousness, Emotional Stability, and Intellect/Imagination. Each scale balances five positive and five reverse-keyed items.
            </p>
            <p className="mt-3 text-[10px] text-muted-foreground">Very Inaccurate · Somewhat Inaccurate · Neither · Somewhat Accurate · Very Accurate</p>
            <button
              onClick={() => begin("ipip")}
              disabled={start.isPending}
              data-testid="button-start-ipip"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              Start personality test — 50 questions
            </button>
          </section>
        </div>
      )}

      {result && <div className="mt-5"><ResultSummary result={result} /></div>}
      {history.isLoading && <div className="mt-8 animate-pulse rounded-xl border border-border bg-card p-5 text-xs text-muted-foreground">Loading saved scores…</div>}
      {!history.isLoading && !history.isError && <ScoreHistory results={history.data ?? []} />}
    </div>
  );
}
