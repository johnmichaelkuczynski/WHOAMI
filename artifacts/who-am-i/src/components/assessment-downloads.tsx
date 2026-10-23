import { useState } from "react";
import type { AssessmentResult } from "@workspace/api-client-react";
import { downloadAssessment } from "../lib/assessment-download";

export function AssessmentDownloads({ result }: { result: AssessmentResult }) {
  const [error, setError] = useState("");
  const download = (includeTest: boolean) => {
    try {
      downloadAssessment(result, includeTest);
      setError("");
    } catch {
      setError("The download could not start. Please try again.");
    }
  };
  return (
    <div className="mt-4" data-testid={`assessment-downloads-${result.id}`}>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => download(false)} data-testid="button-download-report" className="rounded-lg bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground">
          Download report only
        </button>
        <button type="button" onClick={() => download(true)} data-testid="button-download-test-report" className="rounded-lg border border-primary/30 bg-card px-3 py-2 text-[11px] font-semibold text-primary">
          Download test, answers & report
        </button>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">HTML file · Read offline or open and print to save as PDF.</p>
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
