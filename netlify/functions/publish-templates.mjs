/**
 * Netlify Function: publish-templates
 *
 * Receives the templates JSON + the admin password from the browser.
 * Verifies the password server-side, then commits the file to GitHub
 * using a token that never leaves this server.
 *
 * Required Netlify environment variables:
 *   GITHUB_TOKEN          - Fine-grained PAT with contents:write on this repo
 *   ADMIN_PASSWORD_HASH   - SHA-256 hex hash of the admin password
 *   ALLOWED_ORIGIN        - The frontend origin (e.g. https://bt-ctd-echo.bt-tb.ca)
 *
 * Optional:
 *   REPO_OWNER            - GitHub owner (default: stackbaritone)
 *   REPO_NAME             - GitHub repo  (default: bt-ctd-echo)
 */

import { createHash } from 'node:crypto';

const GITHUB_TOKEN       = process.env.GITHUB_TOKEN;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const ALLOWED_ORIGIN     = process.env.ALLOWED_ORIGIN || 'https://bt-ctd-echo.bt-tb.ca';
const REPO_OWNER         = process.env.REPO_OWNER    || 'stackbaritone';
const REPO_NAME          = process.env.REPO_NAME     || 'bt-ctd-echo';

function corsHeaders(origin) {
  // Only reflect the origin if it matches the allowed origin
  const allowedOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  };
}

export async function handler(event) {
  const origin = event.headers?.origin || '';
  const cors = corsHeaders(origin);

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // --- Parse body ---
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { password, data } = body;

  if (!password || !data) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing password or data' }) };
  }

  // --- Verify password (SHA-256, same algo as the frontend login) ---
  if (!ADMIN_PASSWORD_HASH) {
    console.error('[publish-templates] ADMIN_PASSWORD_HASH env var is not set');
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const receivedHash = createHash('sha256').update(password, 'utf8').digest('hex');
  if (receivedHash !== ADMIN_PASSWORD_HASH) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // --- Commit to GitHub ---
  if (!GITHUB_TOKEN) {
    console.error('[publish-templates] GITHUB_TOKEN env var is not set');
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const fileUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/complete_email_templates.json`;
  const ghHeaders = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept':        'application/vnd.github+json',
  };

  // Get current SHA of the file on main (required for updates)
  let sha;
  try {
    const getResp = await fetch(`${fileUrl}?ref=main`, { headers: ghHeaders });
    if (getResp.ok) {
      sha = (await getResp.json()).sha;
    }
  } catch (e) {
    console.warn('[publish-templates] Could not fetch current SHA:', e);
  }

  const content = Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64');
  const putBody = {
    message: 'feat(admin): update complete_email_templates.json via admin-simple',
    content,
    branch: 'main',
    ...(sha ? { sha } : {}),
  };

  let putResp;
  try {
    putResp = await fetch(fileUrl, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody),
    });
  } catch (e) {
    console.error('[publish-templates] Network error calling GitHub API:', e);
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Network error' }) };
  }

  if (!putResp.ok) {
    const txt = await putResp.text();
    console.error('[publish-templates] GitHub API error:', putResp.status, txt);
    // Include the GitHub response text in the returned body to help debugging
    // (This is safe because it does not expose the GITHUB_TOKEN itself).
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'GitHub API error', status: putResp.status, detail: txt }) };
  }

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ ok: true }),
  };
}
