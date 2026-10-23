<div align="center">

# 🌈 Who Am I?

### Understand yourself. Identify the real problem. Find a practical next step.

An AI-guided space for career discovery, personal insight, and concrete decisions at a crossroads.

![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Persistent_Memory-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Google OAuth](https://img.shields.io/badge/Google-OAuth-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Voice](https://img.shields.io/badge/ElevenLabs-Voice_Dictation-A855F7?style=for-the-badge)

**Conversation · Diagnostic tests · Personal profile · Books & activities**

</div>

---

## 🧩 Overview

Who Am I? helps people work out what fits them—and what to do when their current situation does not.

Start with a conversation about work, interests, strengths, uncertainty, or a pressing practical problem. The assistant is instructed to move beyond repeating what you said: ask focused questions, identify the obstacle, and offer a concrete proposal once enough information is available.

Full-length career-interest and personality tests add another perspective. Conversations, assessment results, and profile information are stored in PostgreSQL so the experience can build on previous sessions rather than start from zero.

---

## 👥 Who It’s For

- **People at a career crossroads** — considering a change but unsure which direction makes sense.
- **People whose work no longer fits** — trying to distinguish a bad role, a bad environment, and a deeper mismatch.
- **People facing practical pressure** — needing a plan that takes income, urgency, and constraints seriously.
- **People exploring their strengths** — looking for patterns across interests, personality, experience, and preferences.
- **People who prefer speaking to typing** — using microphone dictation to get their thoughts into the conversation.

---

## ⚙️ Core Capabilities

### 💬 Action-Oriented Conversation

Discuss your situation in ordinary language. The assistant is directed to investigate the actual problem, ask relatively direct questions when needed, and propose a practical course of action—not keep the conversation in an endless cycle of summaries.

### 🧭 Career Interests Test — 60 Questions

A full-length, RIASEC-style assessment explores six interest areas:

| Interest area | What it explores |
| :--- | :--- |
| 🔧 **Realistic** | Hands-on work, tools, making, and practical activity |
| 🔬 **Investigative** | Analysis, research, ideas, and problem-solving |
| 🎨 **Artistic** | Creativity, expression, and original work |
| 🤝 **Social** | Helping, teaching, supporting, and working with people |
| 🚀 **Enterprising** | Persuasion, leadership, initiative, and influence |
| 📋 **Conventional** | Organization, detail, structure, and orderly systems |

Results include trait scores, a three-letter Holland code, and related occupation suggestions.

### 🧠 Personality Test — 50 Questions

An IPIP Big Five–style assessment explores **Extraversion, Agreeableness, Conscientiousness, Emotional Stability, and Intellect/Imagination**, with reverse-keyed items included in scoring.

> **Assessment limits:** These tests use freshly generated questions and provide exploratory estimates. They are not official standardized O*NET or IPIP results, clinical diagnoses, or guarantees of career suitability.

### 🌱 Short Check-Ins

Separate, shorter interest and work-style check-ins provide a lighter way to reflect. They are distinct from the full diagnostic tests and remain available through their own navigation entry.

### 🎙️ Microphone Dictation

Record your thoughts and have ElevenLabs transcribe them into the conversation draft. Review or edit the text before sending it.

Microphone use requires browser permission and a supported recording environment. Recorded audio is sent to ElevenLabs for transcription; this is not an offline-only feature.

### 🗂️ A Profile That Develops Over Time

Keep a persistent picture of your interests, strengths, work preferences, and assessment history. Saved information gives later conversations useful context.

### 📚 Books & Activities

Explore personalized book and activity recommendations alongside your conversations and assessment results.

### 🔐 Google Sign-In & Account-Based Storage

The published app requires direct Google OAuth sign-in. Conversations, profiles, assessment history, and recommendations are associated with the signed-in account.

The development preview uses a separate, automatically authenticated development identity so building the app does not require repeatedly completing Google sign-in. That shortcut is restricted to development.

---

## ✨ What Makes It Different

- **Practical proposals, not reflection alone.** The intended outcome is a useful next move, grounded in the person’s actual circumstances.
- **Real constraints matter.** Income needs, time pressure, and available options belong in the conversation when relevant.
- **Conversation and assessments work together.** Test results offer additional evidence rather than replace judgment.
- **Continuity across sessions.** PostgreSQL stores the material needed to resume and develop the discussion.
- **Clearly labeled navigation.** “Diagnostic tests” means the full tests; “Short check-ins” means the shorter exercises.
- **Room to explain yourself.** A large writing area and voice input support more than one-line answers.
- **Honest limits.** AI suggestions and generated assessments are tools for exploration, not professional or clinical determinations.

---

## 🛤️ A Typical Session

1. **Sign in with Google** in the published app.
2. **Describe the situation** by typing or dictating.
3. **Clarify the obstacle** through focused questions about your goal, constraints, and urgency.
4. **Take a diagnostic test** if career interests or personality patterns would help.
5. **Consider a concrete proposal** and refine it against your circumstances.
6. **Return later** to your saved conversations, profile, and assessment history.

---

## 🛠️ Technology

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React, TypeScript, Vite, Tailwind CSS |
| **API** | Express, TypeScript |
| **Database** | PostgreSQL / Neon, Drizzle ORM |
| **AI conversation** | OpenAI-compatible access through Replit AI Integrations |
| **Dictation** | ElevenLabs speech-to-text |
| **Authentication** | Direct Google OAuth with PKCE and server-side sessions |
| **API contracts** | OpenAPI, Orval-generated client hooks, Zod validation |
| **Workspace** | pnpm workspaces |

### Repository Guide

```text
artifacts/
  who-am-i/       React web application
  api-server/     Express API, authentication, AI, and transcription
lib/
  db/             Database schema and connection
  api-spec/       OpenAPI contract and generation tools
  api-client-react/
                  Generated React API client
scripts/          API smoke tests and post-merge setup
```

---

## 🚀 Development

### Install Dependencies

```bash
pnpm install
```

### Configure the Server

Store credentials in environment secrets. Never commit secret values to the repository.

| Variable | Purpose |
| :--- | :--- |
| `NEON_DATABASE_URL` | PostgreSQL connection; preferred when present |
| `DATABASE_URL` | PostgreSQL fallback when `NEON_DATABASE_URL` is not set |
| `GOOGLE_CLIENT_ID` | Google OAuth application client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `SESSION_SECRET` | Signs OAuth state |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Server-side AI integration credential |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | AI integration endpoint |
| `ELEVENLABS_API_KEY` | Server-side speech-to-text credential |

For Google OAuth, register the exact callback URL ending in `/api/auth/google/callback` for the origin serving the app. The origin must match the environment where sign-in is used.

### Apply the Development Schema

```bash
pnpm --filter @workspace/db run push
```

Review database changes before applying them. Do not force destructive schema changes.

### Run the App

Start the API and web frontend in separate terminals, or use their existing managed workflows:

```bash
pnpm --filter @workspace/api-server run dev
```

```bash
pnpm --filter @workspace/who-am-i run dev
```

The API development command explicitly enables development mode. Production must run with `NODE_ENV=production`; never use the development authentication shortcut in a published environment.

### Quality Checks

```bash
pnpm run typecheck
pnpm test:api
pnpm run build
```

The API smoke suite covers health/authentication behavior, the Google OAuth authorization redirect, and cross-account data isolation. It does not replace a complete Google consent-flow test or testing microphone permissions on a real device.

Regenerate API clients after changing the OpenAPI contract:

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## 🛡️ Privacy & Responsible Use

- Google sign-in identifies the account that owns saved material in the published app.
- Server-side ownership checks restrict access to account-associated records.
- AI conversation content is processed through the configured AI provider; recorded dictation is processed by ElevenLabs.
- Keep sensitive credentials on the server and out of browser code, logs, and source control.
- AI advice may be incomplete or mistaken. Check important financial, career, legal, or health decisions against reliable information and qualified advice where appropriate.
- The diagnostic tests support personal exploration. They do not diagnose mental-health conditions.

---

<div align="center">

### 🌿 Who Am I?

**A clearer understanding of yourself—and a more concrete idea of what to do next.**

</div>
