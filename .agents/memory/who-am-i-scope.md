---
name: Who Am I? product scope
description: Durable scope and interpretation rules for the personal career and practical problem-solving app.
---

The published app must require direct Google OAuth and keep each Google account's career inputs, conversations, profile, assessment history, and recommendations separate.

**Why:** The user explicitly changed the original single-user scope: their material belongs to their Gmail account and other users' material belongs to their own Gmail accounts.

**How to apply:** Preserve account isolation throughout all data reads, writes, and AI context. Do not reintroduce anonymous production use or substitute Clerk for the requested direct Google OAuth.

A user must be able to start completely fresh, as though they just arrived, while past chats remain stored under their Google account. Starting fresh must separate readable chat history from the assistant's active memory; opening an archived chat must not quietly restore its old evidence into a fresh profile.

**Why:** The user requested “EVERYTHING FRESH. AS THOUGH HE JUST SHOWED UP TO THE SITE” and storage of past chats for Gmail-signed-in users, after an old QA conversation repeatedly reopened and made the repaired chat look broken.

**How to apply:** Preserve account-owned past chats without reusing pre-reset summaries, scores, or chat content in fresh recommendations or replies. Keep “New conversation” (retains current account knowledge) distinct from “Start fresh” (resets current knowledge). Never reset the real user's workspace merely to verify this behavior.

Clicking the “Conversation” navigation button must open a blank chat, including when the user is already on that page. Old conversations should appear only when deliberately selected from Past chats.

**Why:** The user repeatedly clicked Conversation expecting a fresh chat but kept seeing the same old conversation.

**How to apply:** Apply the same behavior to desktop and mobile navigation, without deleting saved chats or resetting test scores. Do not interrupt an active reply or voice recording.

The development preview must always be authenticated and usable without an OAuth entry wall. Keep development-only access separate from production account access.

**Why:** The user repeatedly stated, “In the development area, I have to be logged in at all times,” because blocking the preview prevents them from building the app.

**How to apply:** Preserve automatic development access across preview reloads and server restarts. Never enable development authentication shortcuts in the published app.

Navigation must use visible, direct text labels, including “Diagnostic tests”; do not hide destinations behind icon-only controls.

**Why:** The user repeatedly could not find the tests and explicitly rejected the unlabeled navigation icons and vague “check-ins” wording for the full tests.

**How to apply:** Keep navigation labels readable even in the compact menu. Clearly distinguish the full career-interest/personality tests from the separate short check-ins.

Rotating assessment questions should be presented as exploratory estimates inspired by O*NET interest themes and Big Five traits, not as official O*NET/IPIP scores. Different questions on each run are useful for reflection but do not preserve standardized measurement.

**Why:** The user requested fresh questions each time. Calling changing questions official standardized results would misrepresent what the scores mean.

**How to apply:** Retain past assessment results for each account and clearly distinguish the app's exploratory assessments from official instruments.

The assistant should help solve the user's immediate practical problem rather than simply continue career reflection. It should ask direct questions about the problem and its urgency—especially concrete income needs when money is relevant—and volunteer a specific, grounded proposal as soon as it has enough information. For practical problem-solving, replies should either state the current problem hypothesis and ask one targeted question, or explicitly name the problem and its fix. A reflection-only reply is not sufficient, and after two diagnostic replies without a concrete proposal, the next practical-problem-solving reply must propose a practical course of action. Direct requests to interpret test scores are an exception: answer them immediately using actual saved numeric values, rather than requiring another goal or imposing the diagnosis/action template.

**Why:** The user said the assistant tends to meander and must uncover the actual problem, often financial, then propose a concrete way forward. The user also repeatedly insisted that main-chat responses meaningfully use test results; unconditional diagnosis/action instructions caused the chat to evade a direct score-interpretation request.

**How to apply:** Favor action-oriented questions over open-ended self-exploration. Once the desired outcome, urgency, and a plausible capability or route are clear, recommend one practical next move with concrete steps and assumptions. If two diagnostic replies have passed without a proposal, require a provisional proposal rather than another question.
