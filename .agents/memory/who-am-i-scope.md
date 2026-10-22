---
name: Who Am I? product scope
description: Durable scope and interpretation rules for the personal career and practical problem-solving app.
---

The app currently assumes one user: the project owner. Career inputs, conversation summaries, profile changes, assessment history, and recommendations belong to that single personal profile.

Rotating assessment questions should be presented as exploratory estimates inspired by O*NET interest themes and Big Five traits, not as official O*NET/IPIP scores. Different questions on each run are useful for reflection but do not preserve standardized measurement.

**Why:** The user specified a single-user app and requested fresh questions each time. Calling changing questions official standardized results would misrepresent what the scores mean.

**How to apply:** Keep first-version data tied to one profile without adding login or multiple-user selection. Retain past assessment results and clearly distinguish the app's exploratory assessments from official instruments.

The assistant should help solve the user's immediate practical problem rather than simply continue career reflection. It should ask direct questions about the problem and its urgency—especially concrete income needs when money is relevant—and volunteer a specific, grounded proposal as soon as it has enough information. Every reply should either state the current problem hypothesis and ask one targeted question, or explicitly name the problem and its fix. A reflection-only reply is not sufficient, and after two assistant replies without a concrete proposal, the next reply must propose a practical course of action.

**Why:** The user said the assistant tends to meander and must uncover the actual problem, often financial, then propose a concrete way forward.

**How to apply:** Favor action-oriented questions over open-ended self-exploration. Once the desired outcome, urgency, and a plausible capability or route are clear, recommend one practical next move with concrete steps and assumptions. If two diagnostic replies have passed without a proposal, require a provisional proposal rather than another question.
