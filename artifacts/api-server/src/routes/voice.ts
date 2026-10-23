import express, { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post(
  "/discovery/transcribe",
  express.raw({ type: ["audio/*", "application/octet-stream"], limit: "25mb" }),
  async (req, res): Promise<void> => {
    if (!Buffer.isBuffer(req.body) || req.body.length < 12) {
      res.status(400).json({ error: "No usable audio was received. Record a short message and try again." });
      return;
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "Voice transcription is not configured on the server." });
      return;
    }

    const mediaType = (req.get("content-type") ?? "application/octet-stream")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!mediaType.startsWith("audio/") && mediaType !== "application/octet-stream") {
      res.status(415).json({ error: "This audio format is not supported. Try recording again." });
      return;
    }

    try {
      const extension = mediaType === "application/octet-stream"
        ? "audio"
        : mediaType.split("/")[1].replace(/[^a-z0-9]/g, "") || "audio";
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(req.body)], { type: mediaType }), `recording.${extension}`);
      form.append("model_id", "scribe_v2");
      form.append("tag_audio_events", "false");
      form.append("diarize", "false");
      form.append("timestamps_granularity", "none");

      const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
      });
      if (!response.ok) {
        const providerError = await response.json().catch(() => null) as {
          detail?: { status?: unknown };
        } | null;
        const providerCode = typeof providerError?.detail?.status === "string"
          ? providerError.detail.status.slice(0, 80)
          : undefined;
        req.log.error(
          { statusCode: response.status, providerCode },
          "ElevenLabs transcription request failed",
        );
        const error = response.status === 401
          ? "ElevenLabs rejected the configured API key (401). Replace it with an active key that has Speech-to-Text access."
          : providerCode
            ? `ElevenLabs could not transcribe this recording (${providerCode}).`
            : `ElevenLabs could not transcribe this recording (HTTP ${response.status}).`;
        res.status(502).json({ error });
        return;
      }
      const result = await response.json() as { text?: unknown };
      const text = typeof result.text === "string" ? result.text : "";
      res.json({ text });
    } catch (error) {
      req.log.error({ err: error }, "ElevenLabs transcription request failed");
      res.status(502).json({ error: "Transcription failed. Check your connection and try again." });
    }
  },
);

export default router;
