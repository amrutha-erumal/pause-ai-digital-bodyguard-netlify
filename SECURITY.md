# PAUSE Security Notes — Judge Edition 6

PAUSE is a defensive safety aid, not a guarantee that content is malicious or safe.

## Secrets

- `GEMINI_API_KEY` is read only on the server through `process.env.GEMINI_API_KEY`.
- `GOOGLE_SAFE_BROWSING_API_KEY` and `GOOGLE_FACTCHECK_API_KEY` are read only on the server.
- Vertex AI mode uses Google Cloud project/location configuration and platform credentials; no service-account JSON is committed.
- No API key is required in the browser UI.
- `.gitignore` excludes local environment files.

## Input controls

- Text is capped before processing.
- JSON request size is measured and rejected over the server limit.
- Images are limited to PNG/JPEG/WebP and a compressed 2 MB API payload.
- The client resizes screenshots to a bounded dimension before upload.
- The server never fetches a suspicious user URL directly.

## Google service posture

- Gemini receives only the minimized signal and optional screenshot needed for the task.
- Google Search grounding is used only as an optional public evidence tool in the Gemini request.
- Google Safe Browsing v5 receives extracted URLs for reputation matching.
- Google Fact Check receives a bounded, redacted claim query when configured.
- Reputation and fact-check results are treated as evidence, not proof of safety or truth.

## Output safety

- Gemini must return structured JSON.
- Server validation bounds strings, scores and array sizes before returning data to the client.
- Browser rendering uses text nodes / escaped content rather than raw model HTML.
- The Threat Vaccine is explicitly fictional and defensive.

## Headers

Vercel configuration provides CSP, frame isolation, no-sniffing, referrer policy, permissions policy, same-origin resource policy and no-indexing for API responses.
