# Deploy PAUSE to Netlify

This project includes Netlify Function adapters for `/api/analyze`, `/api/vaccine`, and `/api/health`. Do not deploy only the `public` folder when you need the AI endpoints; the complete source project must be built so Netlify can bundle the functions.

## Deploy from GitHub
1. Commit the Netlify deployment files in this project to the root of the existing public GitHub repository, on `main`.
2. Sign in at <https://app.netlify.com/> using GitHub.
3. Select **Add new project** → **Import an existing project** → **GitHub**.
4. Select `pause-ai-digital-bodyguard` and choose the `main` branch.
5. Use the settings from `netlify.toml`: build command `npm run build`; publish directory `public`; functions directory `netlify/functions`.
6. Start the deployment and wait for the deploy status to say Published.
7. Open **Project configuration** → **Environment variables** and add `GEMINI_API_KEY` with your own key. Do not put the key in GitHub or in this file. If you have them, add `GOOGLE_SAFE_BROWSING_API_KEY` and `GOOGLE_FACTCHECK_API_KEY` too.
8. Ensure the environment variables are available to Functions, then trigger a new deploy so the functions receive the values.
9. Open `https://YOUR-SITE.netlify.app/api/health`. It should return JSON with `"ok": true`. The `geminiConfigured` field is expected to be `false` until `GEMINI_API_KEY` is correctly set and the site redeployed.
10. Test a sample in the main PAUSE page. Confirm analysis works, then check the Netlify function logs if it does not.

## Local checks
- `npm run build` prepares the `public` folder.
- `npm run check` checks JavaScript syntax.
- `npm test` runs the project's automated tests.

Never commit a real `.env` file or an API key. Keep secrets in Netlify Environment Variables.
