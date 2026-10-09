# Google Services in PAUSE

PAUSE uses Google services as part of the product's security workflow, not merely as branding.

## 1. Google Gemini / Google Gen AI SDK

**Purpose:** multimodal threat analysis and safe Threat Vaccine generation.

- Package: `@google/genai`
- Model: `gemini-3.8-flash`
- Routes: `api/analyze.mjs`, `api/vaccine.mjs`
- Inputs: structured text plus compressed screenshots
- Output: bounded JSON contracts rendered into the threat report

The official JavaScript SDK supports the Gemini Developer API and Vertex AI through the same `GoogleGenAI` client. PAUSE supports both paths through environment configuration.

## 2. Google Search grounding

**Purpose:** add public-web evidence when a threat contains a claim, official-policy cue, URL, or screenshot that benefits from current evidence.

The tool is enabled through the Gemini generation configuration as `googleSearch`. Search is gated by a small relevance heuristic rather than being invoked for every input.

## 3. Google Safe Browsing v5

**Purpose:** check extracted URLs against Google's known-threat lists.

PAUSE never opens the suspicious URL itself. It sends the extracted URL only to the Google Safe Browsing v5 reputation endpoint from the server and treats the response as one evidence signal rather than proof of safety.

## 4. Google Fact Check Tools API

**Purpose:** when a message contains a claim-like statement, PAUSE can query Google's Fact Check claim corpus and surface closely matched reviewed claims for the user to inspect.

The endpoint is optional and requires `GOOGLE_FACTCHECK_API_KEY`.

## 5. Google Vertex AI mode

For Google Cloud deployments, set:

```text
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=<project-id>
GOOGLE_CLOUD_LOCATION=global
```

The same `@google/genai` client then executes Gemini through Vertex AI using Google Cloud authentication rather than a browser-exposed key.

## 6. Google Cloud Run / Secret Manager deployment posture

The repository includes Cloud Run support so the app can be deployed into Google Cloud. The deployment pattern is intended to use Secret Manager-backed environment variables for Gemini and optional Google evidence keys. This keeps credentials outside the source tree.

## Service-to-feature map

| Service | Feature | Server-side? |
| --- | --- | --- |
| Gemini / Gen AI SDK | Threat analysis + Threat Vaccine | Yes |
| Google Search grounding | Public evidence for claims/context | Yes, through Gemini |
| Safe Browsing v5 | Known-threat URL reputation | Yes |
| Fact Check Tools | Reviewed-claim evidence | Yes |
| Vertex AI | Optional Google Cloud model route | Yes |
| Cloud Run | Production container execution option | Yes |
