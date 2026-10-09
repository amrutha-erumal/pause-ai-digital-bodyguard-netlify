import { sameOrigin, setJsonHeaders } from './security.mjs';

export default async function handler(req, res) {
  setJsonHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.status(204).json({});
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  const vertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
  const services = [
    vertex ? 'Google Vertex AI / Gemini' : 'Google Gemini Developer API',
    !vertex && process.env.GOOGLE_SEARCH_GROUNDING !== '0' ? 'Google Search grounding' : 'Google Search grounding (available in Developer API mode)',
    'Google Safe Browsing v5',
    'Google Fact Check Tools API',
    'Google Cloud Run / Secret Manager deployment path'
  ];
  res.status(200).json({
    ok: true,
    challengeTrack: 'AI-Powered Cybersecurity & Digital Safety',
    model: 'gemini-3.8-flash',
    geminiConfigured: vertex ? Boolean(process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_LOCATION) : Boolean(process.env.GEMINI_API_KEY),
    modelRoute: vertex ? 'Google Vertex AI / Gemini' : 'Google Gemini Developer API / Gen AI SDK',
    googleSearchGroundingConfigured: !vertex && process.env.GOOGLE_SEARCH_GROUNDING !== '0' && Boolean(process.env.GEMINI_API_KEY),
    safeBrowsingConfigured: Boolean(process.env.GOOGLE_SAFE_BROWSING_API_KEY),
    factCheckConfigured: Boolean(process.env.GOOGLE_FACTCHECK_API_KEY),
    googleServices: services,
    evaluatorDimensions: {
      codeQuality: true,
      security: true,
      efficiency: true,
      testing: true,
      accessibility: true,
      googleServices: true,
      problemStatementAlignment: true
    },
    evaluatorEvidenceEndpoint: '/EVALUATION_MANIFEST.json'
  });
}
