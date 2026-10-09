export const MODEL = 'gemini-3.8-flash';

export const samples = Object.freeze({
  bank: 'URGENT! Your bank account will be blocked today. Verify KYC immediately at https://secure-bank-alert.example/verify',
  reward: 'Congratulations! You have won ₹50,000. Claim your reward now by confirming your card details here: https://reward-check.example/claim',
  college: 'Hi, this is HR. We need your Aadhaar and OTP to process your internship joining today. Reply with the code immediately.',
  delivery: 'Your package is on hold due to an unpaid customs fee. Pay ₹49 within 30 minutes or it will be returned: https://delivery-fee.example/pay'
});

const RISK_LEVELS = new Set(['HIGH RISK', 'SUSPICIOUS', 'LOWER RISK', 'VISUAL REVIEW']);
const CONFIDENCE_LEVELS = new Set(['High', 'Medium', 'Low', 'Pending']);
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}

export function extractUrl(text) {
  const match = String(text ?? '').match(/https?:\/\/[^\s)]+|www\.[^\s)]+/i);
  return match ? match[0].replace(/[.,!?]+$/, '') : '';
}

/**
 * Data minimisation for AI analysis. Only masks values that look like secrets/identifiers;
 * URLs are intentionally preserved because URL reputation and redirect cues are part of the analysis.
 */
export function redactSensitive(text) {
  let value = String(text ?? '');
  let changed = false;
  const rules = [
    { re: /\b\d{16}\b/g, replacement: '[CARD-LIKE-NUMBER REDACTED]' },
    { re: /\b\d{12}\b/g, replacement: '[ID-LIKE-NUMBER REDACTED]' },
    { re: /\b(?:OTP|code|verification code)\s*[:#-]?\s*\d{4,8}\b/gi, replacement: '[OTP REDACTED]' }
  ];
  for (const rule of rules) {
    const next = value.replace(rule.re, () => {
      changed = true;
      return rule.replacement;
    });
    value = next;
  }
  return { text: value, changed };
}

function urlRiskSignals(text, url) {
  const input = String(text ?? '');
  const s = input.toLowerCase();
  const lowerUrl = String(url ?? '').toLowerCase();
  const hasUrl = Boolean(url);
  return {
    hasUrl,
    urgency: /(urgent|immediately|within\s+\d+|today|now|suspended|blocked|expire|last chance|act fast|limited time|10 minutes|30 minutes)/i.test(input),
    credential: /(otp|password|pin|kyc|aadhaar|pan|card details|cvv|verify your identity|login|credential|bank details)/i.test(input),
    reward: /(won|reward|cash|₹|prize|gift|claim|bonus|refund|lottery)/i.test(input),
    impersonation: /(bank|support|hr|college|government|income tax|delivery|courier|police|it department|admin|helpdesk|customer care)/i.test(input),
    shortened: /(bit\.ly|tinyurl|t\.co|goo\.gl|is\.gd|cutt\.ly)/i.test(lowerUrl),
    secrecy: /(do not tell|keep this secret|confidential|don't tell anyone)/i.test(input),
    payment: /(pay|payment|fee|transfer|upi|wallet|deposit|refund fee)/i.test(input),
    fear: /(blocked|suspended|penalty|legal action|police|arrest|account will be)/i.test(input)
  };
}

export function localSignals(text) {
  const input = String(text || '');
  const url = extractUrl(input);
  const flags = urlRiskSignals(input, url);

  let score = 18;
  score += flags.hasUrl ? 15 : 0;
  score += flags.urgency ? 21 : 0;
  score += flags.credential ? 23 : 0;
  score += flags.reward ? 10 : 0;
  score += flags.impersonation ? 7 : 0;
  score += flags.shortened ? 7 : 0;
  score += flags.secrecy ? 5 : 0;
  score += flags.payment ? 5 : 0;
  score = clamp(score, 8, 99);

  const risk = score >= 80 ? 'HIGH RISK' : score >= 55 ? 'SUSPICIOUS' : 'LOWER RISK';
  const classification = flags.credential && flags.hasUrl
    ? 'PHISHING / SOCIAL ENGINEERING'
    : flags.reward
      ? 'FRAUD / SOCIAL ENGINEERING'
      : flags.payment && flags.hasUrl
        ? 'PAYMENT SCAM / SOCIAL ENGINEERING'
        : flags.hasUrl
          ? 'SUSPICIOUS LINK'
          : 'SOCIAL ENGINEERING';
  const domain = url
    ? url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
    : '';

  const dna = [
    ['Artificial urgency', flags.urgency ? clamp(74 + (score % 22), 75, 98) : 15],
    ['Identity pressure', flags.credential ? 93 : 21],
    ['Impersonation', flags.impersonation ? 84 : 18],
    ['Financial bait', flags.reward || flags.payment ? 88 : 12],
    ['Link risk', flags.hasUrl ? (flags.shortened ? 97 : 82) : 10],
    ['Fear / pressure', flags.fear ? 91 : 18]
  ];

  const traps = [];
  if (flags.urgency) traps.push(['⏱', 'Artificial urgency', 'The sender compresses your decision window so verification feels harder than compliance.']);
  if (flags.credential) traps.push(['⌁', 'Credential targeting', 'The request points toward sensitive account or identity information.']);
  if (flags.impersonation) traps.push(['◈', 'Trust borrowing', 'A bank, HR team, courier or authority is used to make the message feel legitimate.']);
  if (flags.hasUrl) traps.push(['↗', 'Channel diversion', 'The message tries to move you to a link rather than a known official channel.']);
  if (flags.reward) traps.push(['$', 'Reward bait', 'A tempting prize or refund can reduce skepticism and increase impulsive action.']);
  if (flags.secrecy) traps.push(['◉', 'Isolation cue', 'The sender tries to stop independent verification or discussion.']);
  if (flags.payment) traps.push(['₹', 'Payment pressure', 'The request adds a money movement step before trust is established.']);
  if (!traps.length) traps.push(['✓', 'No strong trap found', 'The demo engine found no major social-engineering signal. Verify context before acting anyway.']);

  const action = score >= 80
    ? 'Do not click, reply, pay or share sensitive information.'
    : score >= 55
      ? 'Pause and verify the sender and destination through a known official channel.'
      : 'No major danger pattern detected, but verify the context before sharing sensitive data.';
  const detail = score >= 80
    ? 'Open the official app/site yourself or contact the organization using a number you already trust.'
    : 'Avoid using contact details or links supplied by the message itself.';
  const target = flags.credential
    ? 'Credentials / identity data'
    : flags.payment || flags.reward
      ? 'Money / payment details'
      : flags.hasUrl
        ? 'Click-through / device access'
        : 'Trust / information';
  const manipulation = flags.fear || flags.urgency
    ? 'Urgency + fear'
    : flags.reward
      ? 'Reward + curiosity'
      : flags.impersonation
        ? 'Trust borrowing'
        : 'Pressure / persuasion';

  return {
    score, risk, classification, dna, traps, action, detail, target, manipulation,
    confidence: score >= 80 ? 'High' : score >= 55 ? 'Medium' : 'Low',
    url, domain, ...flags,
    source: 'LOCAL SIGNAL ENGINE'
  };
}

function boundedText(value, max = 320) {
  return String(value ?? '').trim().slice(0, max);
}

function safeString(value, fallback, max = 320) {
  const s = boundedText(value, max);
  return s || fallback;
}

export function normalizeAI(raw, fallback) {
  let parsed = raw;
  if (typeof raw === 'string') {
    const cleaned = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
      }
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;

  const out = { ...fallback };
  const score = Number(parsed.score);
  out.score = Number.isFinite(score) ? clamp(score, 0, 100) : fallback.score;

  const risk = String(parsed.risk ?? '').trim();
  out.risk = RISK_LEVELS.has(risk) ? risk : (out.score >= 80 ? 'HIGH RISK' : out.score >= 55 ? 'SUSPICIOUS' : 'LOWER RISK');
  out.classification = safeString(parsed.classification, fallback.classification, 96);
  out.summary = safeString(parsed.summary, fallback.summary || 'The signal was assessed using behavioral risk indicators.', 520);
  out.action = safeString(parsed.action, fallback.action, 240);
  out.detail = safeString(parsed.detail, fallback.detail, 360);
  out.target = safeString(parsed.target, fallback.target, 100);
  out.manipulation = safeString(parsed.manipulation, fallback.manipulation, 140);

  const confidence = String(parsed.confidence ?? '').trim();
  out.confidence = CONFIDENCE_LEVELS.has(confidence) ? confidence : fallback.confidence;

  if (Array.isArray(parsed.dna) && parsed.dna.length) {
    out.dna = parsed.dna.slice(0, 6).map(item => [
      safeString(item?.label ?? item?.name, 'Signal', 42),
      clamp(item?.value ?? item?.score ?? 0, 0, 100)
    ]);
  }
  if (Array.isArray(parsed.traps) && parsed.traps.length) {
    out.traps = parsed.traps.slice(0, 7).map(item => [
      safeString(item?.icon, '!', 4),
      safeString(item?.title, 'Signal', 72),
      safeString(item?.description ?? item?.desc, 'Review this signal independently.', 260)
    ]);
  }
  if (Array.isArray(parsed.attackerPath) && parsed.attackerPath.length) {
    out.attackerPath = parsed.attackerPath.slice(0, 5).map(item => [
      safeString(item?.step, '', 12),
      safeString(item?.title, 'Stage', 72),
      safeString(item?.detail, '', 180)
    ]);
  } else {
    out.attackerPath = null;
  }

  out.breakpoint = safeString(parsed.breakpoint, fallback.breakpoint || 'Before the requested action.', 180);
  out.memoryRule = safeString(parsed.memoryRule, fallback.memoryRule || 'Pause and independently verify.', 260);
  out.tactic = safeString(parsed.tactic, fallback.tactic || fallback.manipulation, 140);
  return out;
}

export function validateImageData(image) {
  if (!image || typeof image !== 'object') return { ok: false, error: 'No image provided.' };
  const mimeType = String(image.mimeType || '').toLowerCase();
  if (!ALLOWED_IMAGE_MIME.has(mimeType)) return { ok: false, error: 'Only PNG, JPG and WebP images are supported.' };
  const base64 = String(image.base64 || '');
  if (!base64) return { ok: false, error: 'Image payload is empty.' };
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > 2_000_000) return { ok: false, error: 'Compressed image payload exceeds 2 MB.' };
  return { ok: true, mimeType, base64, size: approxBytes };
}
