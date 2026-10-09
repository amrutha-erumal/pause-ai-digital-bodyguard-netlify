# PAUSE — Evaluation Evidence Matrix

PAUSE is designed for the **AI-Powered Cybersecurity & Digital Safety** track and is engineered so the repository contains explicit, auditable evidence for each automated assessment dimension. The exact scoring weights are determined by the competition platform; this matrix does not claim a private formula.

| Evaluation dimension | Evidence the evaluator can inspect | Why it matters for PAUSE |
| --- | --- | --- |
| Code Quality | `risk-engine.mjs`, `api/*.mjs`, shared `api/security.mjs`, bounded model contracts, ESM Node 24 configuration | Core risk logic is isolated and testable; server guards are reused instead of duplicated. |
| Security | Same-origin checks, request limits, MIME allow-listing, rate limiting, secret redaction, no client secrets, CSP/security headers, prompt-injection boundary, no server-side URL fetching | PAUSE analyzes hostile input without turning the analyzer into a URL-fetching/credential-handling surface. |
| Efficiency | Browser image resize/compression, evidence-call parallelism, short timeouts, URL/review caching, bounded JSON, framework-free frontend | Expensive AI/evidence calls are kept bounded and repeated calls are avoided where possible. |
| Testing | 88 automated Node tests + syntax gate; risk, privacy, API contract, Google integration, accessibility and static-quality checks | The safety-critical path is verified without requiring a browser during CI. |
| Accessibility | Semantic landmarks, explicit button types, labels, live regions, keyboard modal handling, focus-visible styles, reduced-motion support, drag/drop + paste alternative | Core analysis and judge-demo controls remain usable by keyboard and assistive technologies. |
| Google Services | Google Gen AI SDK / Gemini multimodal analysis, Gemini Search grounding, Google Safe Browsing v5, Google Fact Check Tools, optional Vertex AI execution path, Cloud Run deployment files | Google services are directly tied to threat analysis rather than decorative badges. |
| Problem Statement Alignment | Exact challenge track, problem statement, expected outcome, requirement-to-feature mapping in UI and docs | Makes the mapping explicit for an automated evaluator as well as a human reviewer. |

## Judge-visible workflow

`Message / URL / Screenshot` → `Privacy Shield` → `local behavioral signals` → `Google Safe Browsing (URL)` + `Google Fact Check (claim)` → `Gemini multimodal synthesis` + optional `Google Search grounding` → `Threat Report` → `Earliest Safe Breakpoint` → `Threat Vaccine` → `Decision Arena`.

## Differentiator

**Threat Vaccine Lab — “Same tactic. New skin.”** The system turns an analyzed manipulation tactic into a safe fictional mutation, tests whether the user recognizes the tactic in a new surface form, and reinforces a defensive memory rule. This is a training/resilience loop rather than a one-shot classifier.
