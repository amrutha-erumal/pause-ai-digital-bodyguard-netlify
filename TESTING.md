# PAUSE Testing Strategy

PAUSE uses a fast, deterministic test suite so the critical security and analysis paths can be verified before deployment.

## Commands

```bash
npm run check
npm test
npm run quality
npm run test:coverage
```

## Test groups

- **Risk engine:** deterministic signal extraction, scoring, URL parsing and bounded output.
- **Security:** same-origin checks, request limits, rate limiting, secret redaction, MIME rules, no client secrets and prompt-injection boundaries.
- **API contracts:** Gemini and Threat Vaccine response schemas, Google evidence providers, Vertex AI route and health endpoint.
- **Frontend quality:** semantic landmarks, labels, ARIA/status regions, dialogs, keyboard behavior, reduced motion, safe rendering and challenge alignment.
- **Deployment:** Vercel Node 24 configuration, Cloud Run adapter, environment template and security headers.
- **Evaluator evidence:** all seven PromptWars code-assessment dimensions are represented in `EVALUATION_MANIFEST.json` and the deployed HTML metadata.

## Reliability principle

External Google services are evidence providers, not a single point of failure. PAUSE keeps a deterministic local analysis/fallback path so the interface remains usable when a remote service times out or is not configured.

## Current local quality gate

The repository contains **88 automated checks** plus JavaScript syntax validation. The canonical verification commands are `npm run check` and `npm run quality`.
