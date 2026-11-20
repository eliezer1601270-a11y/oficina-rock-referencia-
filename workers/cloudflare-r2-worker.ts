/**
 * Cloudflare Worker — Oficina do Rock Motoclube (Media CDN + Authenticated Backup Vault on R2)
 *
 * Deploy with: npx wrangler deploy
 * Configure R2 bindings (`BACKUPS_BUCKET`, `MEDIA_BUCKET`) and env vars (`FIREBASE_PROJECT_ID`,
 * `ADMIN_EMAILS`, `ALLOWED_ORIGIN`) in wrangler.toml.
 */

export interface R2ObjectSummary {
  key: string;
  size: number;
  uploaded: Date;
  customMetadata?: Record<string, string>;
  httpMetadata?: { contentType?: string };
}

export interface R2ObjectBody extends R2ObjectSummary {
  body: ReadableStream | null;
}

export interface R2Bucket {
  list(options?: { prefix?: string; limit?: number }): Promise<{ objects: R2ObjectSummary[] }>;
  head(key: string): Promise<R2ObjectSummary | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | string | null,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }
  ): Promise<R2ObjectSummary | null>;
}

export interface Env {
  BACKUPS_BUCKET: R2Bucket;
  MEDIA_BUCKET: R2Bucket;
  FIREBASE_PROJECT_ID: string;
  ADMIN_EMAILS?: string;
  ALLOWED_ORIGIN?: string;
}

interface JwkKey {
  kid: string;
  n: string;
  e: string;
  kty: string;
  alg: string;
}

interface DecodedJwt {
  header: { kid?: string; alg?: string };
  payload: {
    iss?: string;
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    exp?: number;
  };
  signingInput: string;
  signatureBytes: Uint8Array;
}

let cachedJwks: { keys: JwkKey[]; fetchedAt: number } | null = null;
const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

function base64UrlToUint8Array(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(parts[1])));
    return {
      header,
      payload,
      signingInput: `${parts[0]}.${parts[1]}`,
      signatureBytes: base64UrlToUint8Array(parts[2]),
    };
  } catch {
    return null;
  }
}

async function getFirebaseJwks(): Promise<JwkKey[]> {
  const now = Date.now();
  if (cachedJwks && now - cachedJwks.fetchedAt < 60 * 60 * 1000) {
    return cachedJwks.keys;
  }
  const resp = await fetch(JWKS_URL);
  if (!resp.ok) throw new Error('Failed to fetch Firebase JWKS');
  const body = (await resp.json()) as { keys?: JwkKey[] };
  const keys = body.keys || [];
  cachedJwks = { keys, fetchedAt: now };
  return keys;
}

async function verifyFirebaseIdToken(
  authHeader: string | null,
  env: Env
): Promise<{ uid: string; email: string } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const decoded = decodeJwt(token);
  if (!decoded || !decoded.header.kid) return null;

  const { payload } = decoded;
  const expectedIss = `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`;
  if (payload.iss !== expectedIss || payload.aud !== env.FIREBASE_PROJECT_ID) return null;
  if (!payload.sub || !payload.exp || payload.exp * 1000 <= Date.now()) return null;

  const keys = await getFirebaseJwks();
  const jwk = keys.find((k) => k.kid === decoded.header.kid);
  if (!jwk) return null;

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new Uint8Array(decoded.signatureBytes),
    new TextEncoder().encode(decoded.signingInput)
  );
  if (!valid) return null;

  return {
    uid: payload.sub,
    email: (payload.email || '').toLowerCase().trim(),
  };
}

function isAuthorizedAdmin(email: string, env: Env): boolean {
  const allowed = (env.ADMIN_EMAILS || 'eliezerrmartins@gmail.com')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const allowOrigin =
    env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== '*'
      ? origin === env.ALLOWED_ORIGIN
        ? origin
        : env.ALLOWED_ORIGIN
      : origin || '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key, X-Checksum-SHA256',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const headers = corsHeaders(env, origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, service: 'oficina-do-rock-r2-worker' }, { headers });
    }

    // All backup endpoints require verified Firebase Admin ID token
    if (url.pathname.startsWith('/api/backups')) {
      const user = await verifyFirebaseIdToken(request.headers.get('Authorization'), env);
      if (!user || !isAuthorizedAdmin(user.email, env)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
      }

      if (request.method === 'GET' && url.pathname === '/api/backups') {
        const listed = await env.BACKUPS_BUCKET.list({ prefix: 'backups/', limit: 100 });
        return Response.json(
          {
            objects: listed.objects.map((o) => ({
              key: o.key,
              size: o.size,
              uploaded: o.uploaded.toISOString(),
              sha256: o.customMetadata?.sha256 || null,
              kind: o.customMetadata?.kind || null,
            })),
          },
          { headers }
        );
      }

      if (request.method === 'POST' && url.pathname === '/api/backups') {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText) as {
          id?: string;
          kind?: string;
          sha256?: string;
          createdAt?: string;
        };
        if (!body?.id || !body?.sha256) {
          return Response.json({ error: 'Missing id or sha256' }, { status: 400, headers });
        }
        const safeId = body.id.replace(/[^a-zA-Z0-9_-]/g, '');
        const key = `backups/${safeId}.json`;

        // Idempotency guard: if backup already stored with same SHA-256, return success
        const existing = await env.BACKUPS_BUCKET.head(key);
        if (existing && existing.customMetadata?.sha256 === body.sha256) {
          return Response.json({ ok: true, idempotent: true, remoteKey: key }, { headers });
        }

        await env.BACKUPS_BUCKET.put(key, bodyText, {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: {
            sha256: body.sha256,
            kind: body.kind || 'full',
            uploadedByEmail: user.email,
            createdAt: body.createdAt || new Date().toISOString(),
          },
        });
        return Response.json({ ok: true, remoteKey: key }, { status: 201, headers });
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/backups/')) {
        const keyId = url.pathname.replace('/api/backups/', '').replace(/[^a-zA-Z0-9._-]/g, '');
        const key = keyId.startsWith('backups/') ? keyId : `backups/${keyId}`;
        const obj = await env.BACKUPS_BUCKET.get(key);
        if (!obj) {
          return Response.json({ error: 'Not found' }, { status: 404, headers });
        }
        return new Response(obj.body, {
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            'X-Checksum-SHA256': obj.customMetadata?.sha256 || '',
          },
        });
      }
    }

    // Media CDN route (immutable cache for event posters, gallery, covers)
    if (url.pathname.startsWith('/api/media/')) {
      const mediaKey = url.pathname.replace('/api/media/', '').replace(/^\/+/, '');
      if (request.method === 'GET') {
        const obj = await env.MEDIA_BUCKET.get(mediaKey);
        if (!obj) return new Response('Not found', { status: 404, headers });
        return new Response(obj.body, {
          headers: {
            ...headers,
            'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }
      if (request.method === 'PUT') {
        const user = await verifyFirebaseIdToken(request.headers.get('Authorization'), env);
        if (!user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
        }
        const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
        await env.MEDIA_BUCKET.put(mediaKey, request.body, {
          httpMetadata: { contentType },
          customMetadata: { uploadedByUid: user.uid },
        });
        return Response.json({ ok: true, key: mediaKey }, { status: 201, headers });
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers });
  },
};
