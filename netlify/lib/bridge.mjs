/**
 * Adapts PAUSE's existing Node-style API handlers to Netlify Functions' Web
 * Request/Response interface. API secrets remain server-side in Netlify env vars.
 */
export async function invokeNodeHandler(request, context, handler) {
  const headers = Object.fromEntries(request.headers.entries());
  let body = {};

  if (!['GET', 'HEAD'].includes(request.method.toUpperCase())) {
    let raw = '';
    try {
      raw = await request.text();
    } catch {
      return json({ error: 'Could not read the request body.' }, 400);
    }
    if (Buffer.byteLength(raw, 'utf8') > 2_500_000) {
      return json({ error: 'Request is too large.' }, 413);
    }
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: 'Invalid JSON request.' }, 400);
      }
    }
  }

  const forwardedFor = headers['x-forwarded-for'] || headers['x-nf-client-connection-ip'] || '';
  const req = {
    method: request.method,
    url: new URL(request.url).pathname,
    headers,
    body,
    socket: { remoteAddress: String(forwardedFor).split(',')[0].trim() || context?.ip || 'unknown' }
  };

  const state = { statusCode: 200, headers: {}, body: undefined };
  const res = {
    setHeader(name, value) {
      state.headers[String(name).toLowerCase()] = String(value);
    },
    status(code) {
      state.statusCode = Number(code) || 200;
      return {
        json(value) {
          state.body = value;
        }
      };
    }
  };

  try {
    await handler(req, res);
  } catch (error) {
    // Keep runtime exception details out of public responses.
    console.error('PAUSE Netlify function failed:', error?.message || error);
    return json({ error: 'PAUSE could not complete this request.' }, 500);
  }

  const responseHeaders = {
    ...state.headers,
    'content-type': state.headers['content-type'] || 'application/json; charset=utf-8'
  };
  return new Response(JSON.stringify(state.body ?? {}), {
    status: state.statusCode,
    headers: responseHeaders
  });
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff'
    }
  });
}
