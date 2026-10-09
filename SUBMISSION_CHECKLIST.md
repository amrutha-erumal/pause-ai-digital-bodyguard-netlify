# PAUSE — Final Submission Checklist

## Repository

- Public repository; keep the repository lightweight and keep only one submission branch.
- No `.env`, API keys, service-account JSON, private certificates or local credentials.
- `npm run quality` passes before the final push.
- `README.md`, `JUDGE_MATRIX.md`, `GOOGLE_SERVICES.md`, `PROBLEM_STATEMENT.md`, `SECURITY.md`, `ACCESSIBILITY.md` are present.

## Deployment

- Prefer the Google Cloud Run route when the event accepts it: Gemini can run through Vertex AI with Google Cloud authentication, and Google service evidence is visible in the architecture.
- Alternatively deploy to Vercel with `GEMINI_API_KEY`, plus optional Safe Browsing and Fact Check keys.
- Verify the public URL in an incognito browser.
- Verify `/api/health` returns `ok: true`.
- Test message mode and screenshot mode from the public URL.
- Test the Threat Vaccine from the public URL.

## Judge walkthrough

1. Start with a suspicious bank/college/delivery message.
2. Run PAUSE and let the agent workflow visibly complete.
3. Show the threat score, Scam DNA, Google evidence cards and earliest safe breakpoint.
4. Open **Show Me the Trap**.
5. Click **Turn this threat into a vaccine**.
6. Let the judge choose an action in the mutated scenario.
7. Show resilience improvement and the personalized memory rule.

## Reliability

Always keep the local signal engine and deterministic vaccine mutation as a fallback. The UI should remain usable even if a Google service is temporarily unavailable.
