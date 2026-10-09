# PAUSE Architecture — Judge Edition 6

## Product boundary

PAUSE is a defensive **AI-Powered Cybersecurity & Digital Safety** prototype. It accepts a suspicious message/URL or screenshot, combines deterministic local signals with Google AI analysis and Google evidence services, and turns the result into an actionable next decision.

## Request flow

```text
Browser
  │
  ├── Message / URL ────────────────┐
  └── Screenshot (compressed) ─────┤
                                   ▼
                             /api/analyze
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
             Privacy Shield   Google Safe     Local context
             / redaction      Browsing v5     (no URL fetch)
                    │              │              │
                    └──────────────┼──────────────┘
                                   ▼
                          Google Gen AI SDK
                          Gemini 3.8 Flash
                                   │
                          optional Search
                            grounding tool
                                   ▼
                         bounded JSON contract
                                   ▼
                 Threat Report + Threat Vaccine
```

## Google integrations

1. `@google/genai` — official JavaScript SDK for Gemini. Used for multimodal threat synthesis and safe fictional threat-vaccine mutation generation.
2. Gemini Google Search grounding — gated public-web evidence retrieval inside the model workflow.
3. Google Safe Browsing v5 — extracted URLs are checked against Google's known-threat URL service; PAUSE never opens those URLs itself.
4. Google Fact Check Tools API — optional reviewed-claim lookup for claim-like messages.
5. Google Vertex AI — optional Google Cloud execution route using the same official Gen AI SDK.
6. Cloud Run / Secret Manager deployment artifacts — production Google Cloud path for server execution and secret injection.

## Components

- `index.html` — semantic application shell, challenge-alignment evidence, input modes and result views.
- `style.css` — responsive visual system, focus styles and reduced-motion behavior.
- `app.js` — UI orchestration, screenshot preprocessing, rendering, Decision Arena and Threat Vaccine interaction.
- `risk-engine.mjs` — deterministic risk signals, privacy redaction, URL extraction and model-output normalization.
- `api/analyze.mjs` — server-side Gemini + Google evidence orchestration and safety controls.
- `api/vaccine.mjs` — server-side Gemini defensive mutation generator with strict schema validation.
- `api/health.mjs` — non-secret service configuration status endpoint.
- `tests/*.mjs` — unit, contract, security, Google integration and accessibility expectation tests.

## Engineering principles

**Code Quality:** deterministic core logic is isolated from browser concerns; external model output is normalized into a bounded contract.

**Security:** server-only secrets, same-origin checks, request and image limits, MIME allow-listing, best-effort rate limiting, no-store responses, CSP/security headers, and secret redaction.

**Efficiency:** images are resized/compressed before upload, payloads are bounded, calls have timeouts, and the browser ships no framework runtime.

**Testing:** 88 automated checks currently cover high-risk logic, contracts, Google integrations and static quality expectations. `npm run quality` is the required gate.

**Accessibility:** semantic controls, labels, live status announcements, modal semantics, keyboard focus behavior, Escape handling and reduced-motion support.

**Problem Statement Alignment:** the UI and documentation explicitly map every requested challenge requirement to a working feature.
