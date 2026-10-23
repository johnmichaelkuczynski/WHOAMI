---
name: Safe chat retries
description: Why message retry identities must be durable and scoped to the authenticated conversation.
---

Automatic retries of chat mutations require a stable request identity and durable duplicate protection. Keep the same identity on network retries and manual retries of the same unresolved message. Authenticate and check conversation ownership before replaying a stored response.

**Why:** A browser may lose the response after the server has already saved the exchange. Retrying blindly creates duplicate messages; an in-memory-only replay cache loses protection when the server restarts.

**How to apply:** Preserve persistent duplicate protection when changing chat transport or storage. Test both a request that never reaches the server and a successful server response that never reaches the browser. Do not substitute generic automatic mutation retries without the same request identity.
