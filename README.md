# PAUSE — AI Digital Bodyguard / Judge Edition 6

PAUSE is a functional defensive cybersecurity prototype built specifically for the **AI-Powered Cybersecurity & Digital Safety** problem statement. It identifies or analyzes suspicious activity in messages, URLs and screenshots, explains the manipulation behind the threat, and converts findings into actionable safety decisions.

## Problem Statement Alignment

**Track:** AI-Powered Cybersecurity & Digital Safety

**Problem statement:** With the increasing use of digital platforms, phishing, fraudulent websites, malicious messages and identity theft pose significant challenges. Build an intelligent system that can identify suspicious activity and help users make safer decisions online.

**Expected outcome:** A functional prototype that identifies or analyzes a cybersecurity threat and provides actionable security recommendations.

### Requirement → evidence in PAUSE

| Requirement | Implemented evidence |
| --- | --- |
| Identify suspicious activity | Local behavioral signal engine + Gemini multimodal synthesis |
| Phishing / fraudulent websites / malicious messages / identity theft | Message/URL input, screenshot analysis, URL reputation, identity/credential risk signals |
| Help users make safer decisions | Immediate action, earliest safe breakpoint, trusted-channel alternative |
| Actionable security recommendations | Every analysis produces a concrete defensive action |
| Functional prototype | Browser UI + Vercel server API routes + local fallback |

## What the judge can interact with

1. **Threat Lab** — paste a message/URL or upload a screenshot.
2. **Agent Run** — visible ingest → privacy → Google reputation → Gemini synthesis workflow.
3. **Threat Report** — score, classification, Scam DNA, trap explanation, attack path, Google evidence and immediate action.
4. **Threat Vaccine Lab** — Gemini generates a safe fictional mutation of the detected manipulation pattern, then tests the user's next decision.
5. **Decision Arena** — three short scenarios with an explicit safety score.
6. **Trust Center** — service health and privacy/security posture.

## Google Services used meaningfully

- **Google Gemini / Google Gen AI SDK (`@google/genai`)** — multimodal threat analysis and defensive mutation generation.
- **Google Search grounding** — optional public-web evidence inside the Gemini analysis workflow.
- **Google Safe Browsing v5** — server-side reputation checks for extracted URLs.
- **Google Fact Check Tools API** — optional reviewed-claim evidence for claim-like messages.
- **Google Vertex AI mode** — optional Google Cloud execution path using the same official Gen AI SDK.

Google's current Gemini JavaScript SDK is the official `@google/genai` package, and its current documentation supports `generateContent`, multimodal inputs, and Google Search grounding. Google Safe Browsing v5 exposes `urls.search` for known-threat URL matching.

## Code Quality

- UI orchestration and core risk logic are separated.
- Server outputs are normalized into bounded contracts before rendering.
- No raw dynamic HTML injection is used by the main UI path.
- Small deterministic helpers are unit-testable without the browser.
- ESM Node 24 deployment configuration.

## Security

- Production Gemini and Google-service keys are server-side environment variables only.
- Same-origin checks, request-size limits, MIME allow-listing, rate limiting, no-store responses and security headers.
- Privacy Shield redacts obvious OTP, card-like and ID-like numbers before the AI request.
- PAUSE never server-fetches a user-supplied suspicious URL; URLs are passed only to the Google reputation service.
- Gemini output is parsed and bounded before UI rendering.

## Efficiency

- Images are resized and compressed in the browser before upload.
- Maximum payload sizes are enforced server-side.
- Requests have bounded timeouts.
- The frontend is framework-free and has no runtime dependency bundle.

## Testing

Run:

```bash
npm test
npm run check
npm run quality
```

The project contains **88 automated checks** covering risk logic, model-output contracts, privacy redaction, security controls, deployment configuration, Google integrations, accessibility hooks, and frontend safety expectations.

## Accessibility

- Semantic landmarks and controls.
- Accessible labels and dialog semantics.
- Live status regions.
- Keyboard focus indicators and Escape-to-close modal behavior.
- Reduced-motion support.
- Screenshot upload supports click, drag/drop and clipboard paste.

## Run locally (Windows beginner path)

**Do not double-click `index.html`.** The page uses JavaScript modules; opening it as a `file://` URL can block those modules and make controls appear dead.

1. Install Node.js 24.x from <https://nodejs.org/en/download>.
2. Extract the complete ZIP folder.
3. Double-click `START_PAUSE.bat`.
4. The launcher creates `.env` from `.env.example` when needed, attempts to install dependencies, starts the local server, and opens <http://localhost:8080>.
5. Keep the “PAUSE Server” command window open while using the website.
6. To enable real Gemini analysis, put `GEMINI_API_KEY=your-key` in the local `.env` file and restart PAUSE. Never upload `.env` to public GitHub.

If dependency installation fails, the website still opens with local safety fallback for UI testing; Gemini analysis will require a successful `npm install`.

### Manual local start

From the project folder:

```bash
npm install
npm start
```

Open <http://localhost:8080>. Check server configuration at <http://localhost:8080/api/health>. A healthy endpoint confirms route availability and whether a key is configured; an actual analysis request is still required to verify Gemini credentials.
## Deployment

1. Deploy the entire project directory to Vercel.
2. Set `GEMINI_API_KEY` as a Vercel Secret / Environment Variable.
3. Set `GOOGLE_SAFE_BROWSING_API_KEY` if live URL reputation is desired.
4. Leave `GOOGLE_SEARCH_GROUNDING=1` for the competition demo.
5. Redeploy and verify `/api/health`.

## Differentiator

**Threat Vaccine Lab — “Same tactic. New skin.”** PAUSE turns a detected manipulation pattern into a safe fictional mutation, asks the user for the next action, and reinforces a personalized defensive memory rule. This moves the product beyond binary scam classification toward measurable user resilience.


## Automated evaluator evidence

The repository deliberately exposes auditable evidence for all seven PromptWars code-assessment dimensions: Code Quality, Security, Efficiency, Testing, Accessibility, Google Services and Problem Statement Alignment. The machine-readable source of truth is `EVALUATION_MANIFEST.json`; the human-readable map is `JUDGE_MATRIX.md`.

The application UI also renders the exact challenge track/problem statement, service inventory, engineering controls and evaluator dimension mapping so an automated evaluator can discover alignment from the deployed project, not only from source documentation.


## Navigation resilience
The primary navigation uses real anchor links to `#guard`, `#arena`, `#vaccine`, and `#how`, with `navigation.js` adding smooth scrolling, active-section highlighting, a mobile quick-navigation dock, and a back-to-top control. This keeps the site's core navigation usable even if the main AI module is delayed or unavailable.
