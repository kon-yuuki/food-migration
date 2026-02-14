interface D1PreparedLike {
  bind: (...values: unknown[]) => D1PreparedLike;
  run: () => Promise<unknown>;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results?: T[] }>;
}

interface D1DatabaseLike {
  prepare: (query: string) => D1PreparedLike;
}

interface Env {
  food_migration_db: D1DatabaseLike;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  PUSH_ADMIN_TOKEN?: string;
}

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface ReminderScheduleInput {
  time: string;
  enabled: boolean;
}

interface ReminderSyncPayload {
  endpoint?: string;
  planId?: string;
  timezone?: string;
  reminders?: ReminderScheduleInput[];
}

interface StoredReminderSchedule {
  id: string;
  endpoint: string;
  planId: string;
  timezone: string;
  time: string;
  enabled: number;
  lastSentLocal: string | null;
}

interface PushSendResult {
  status: number;
  body: string;
}

interface ScheduledEvent {
  scheduledTime?: number;
  cron?: string;
  type?: 'scheduled';
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8'
};

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsResponse = handleCors(request);
    if (corsResponse) {
      return corsResponse;
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return json({ ok: true, service: 'food-migration-push' });
      }

      if (request.method === 'GET' && url.pathname === '/api/vapid/check') {
        assertAdminAuthorized(request, env);
        const check = await checkVapidKeyPair(env);
        return json({ ok: true, ...check });
      }

      if (request.method === 'POST' && url.pathname === '/api/subscriptions') {
        const payload = (await request.json()) as {
          subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        };
        const normalized = normalizeSubscription(payload.subscription);
        if (!normalized) {
          return json({ ok: false, error: 'invalid_subscription_payload' }, 400);
        }

        await upsertSubscription(env.food_migration_db, normalized);
        return json({ ok: true });
      }

      if (request.method === 'DELETE' && url.pathname === '/api/subscriptions') {
        const payload = (await request.json()) as { endpoint?: string };
        if (!payload.endpoint) {
          return json({ ok: false, error: 'endpoint_required' }, 400);
        }

        await deleteSubscription(env.food_migration_db, payload.endpoint);
        return json({ ok: true });
      }

      if (request.method === 'POST' && url.pathname === '/api/reminders/sync') {
        const payload = (await request.json()) as ReminderSyncPayload;
        const normalized = normalizeReminderSyncPayload(payload);
        if (!normalized) {
          return json({ ok: false, error: 'invalid_reminder_payload' }, 400);
        }

        await replaceReminderSchedules(env.food_migration_db, normalized);
        return json({ ok: true, count: normalized.reminders.length });
      }

      if (request.method === 'POST' && url.pathname === '/api/push/test') {
        assertAdminAuthorized(request, env);

        const payload = (await request.json()) as {
          endpoint?: string;
          subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        };

        const target = payload.endpoint
          ? await getSubscriptionByEndpoint(env.food_migration_db, payload.endpoint)
          : normalizeSubscription(payload.subscription);

        if (!target) {
          return json({ ok: false, error: 'subscription_not_found' }, 404);
        }

        try {
          const pushResult = await sendPush(env, target.endpoint);
          return json({ ok: true, push: pushResult });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'push_send_failed';
          const vapidCheck = await checkVapidKeyPair(env);
          if (isExpiredSubscriptionError(error)) {
            await deleteSubscription(env.food_migration_db, target.endpoint);
            return json({ ok: false, error: message, deleted: true, vapidCheck }, 410);
          }
          return json({ ok: false, error: message, vapidCheck }, 502);
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/push/broadcast') {
        assertAdminAuthorized(request, env);

        const subscriptions = await listSubscriptions(env.food_migration_db);
        if (subscriptions.length === 0) {
          return json({ ok: true, sent: 0, failed: 0, deleted: 0 });
        }

        let sent = 0;
        let failed = 0;
        let deleted = 0;

        await Promise.all(
          subscriptions.map(async (subscription) => {
            try {
              await sendPush(env, subscription.endpoint);
              sent += 1;
            } catch (error) {
              failed += 1;
              if (isExpiredSubscriptionError(error)) {
                await deleteSubscription(env.food_migration_db, subscription.endpoint);
                deleted += 1;
              }
            }
          })
        );

        return json({ ok: true, sent, failed, deleted });
      }

      return json({ ok: false, error: 'not_found' }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'internal_error';
      return json({ ok: false, error: message }, 500);
    }
  },
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const now = new Date();
    const schedules = await listEnabledReminderSchedules(env.food_migration_db);

    let sent = 0;
    let failed = 0;
    let deleted = 0;
    let skipped = 0;

    for (const schedule of schedules) {
      const local = formatLocalDateTime(now, schedule.timezone);
      if (!local) {
        skipped += 1;
        continue;
      }

      if (local.time !== schedule.time) {
        continue;
      }

      const localKey = `${local.date} ${local.time}`;
      if (schedule.lastSentLocal === localKey) {
        skipped += 1;
        continue;
      }

      try {
        await sendPush(env, schedule.endpoint);
        await markReminderSent(env.food_migration_db, schedule.id, localKey);
        sent += 1;
      } catch (error) {
        failed += 1;
        if (isExpiredSubscriptionError(error)) {
          await deleteSubscription(env.food_migration_db, schedule.endpoint);
          deleted += 1;
        }
      }
    }

    console.log(JSON.stringify({ ok: true, type: 'cron_reminder', scanned: schedules.length, sent, failed, deleted, skipped }));
  }
};

export default worker;

function handleCors(request: Request): Response | undefined {
  if (request.method !== 'OPTIONS') {
    return undefined;
  }

  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,x-admin-token'
    }
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      'access-control-allow-origin': '*'
    }
  });
}

function assertAdminAuthorized(request: Request, env: Env): void {
  if (!env.PUSH_ADMIN_TOKEN) {
    return;
  }

  const token = request.headers.get('x-admin-token');
  if (token !== env.PUSH_ADMIN_TOKEN) {
    throw new Error('admin_token_invalid');
  }
}

function normalizeSubscription(subscription: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined): StoredSubscription | undefined {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return undefined;
  }

  return { endpoint, p256dh, auth };
}

function normalizeReminderSyncPayload(payload: ReminderSyncPayload): {
  endpoint: string;
  planId: string;
  timezone: string;
  reminders: ReminderScheduleInput[];
} | undefined {
  const endpoint = payload.endpoint?.trim();
  const planId = payload.planId?.trim();
  const timezone = payload.timezone?.trim();
  const reminders = payload.reminders;

  if (!endpoint || !planId || !timezone || !Array.isArray(reminders)) {
    return undefined;
  }

  const normalizedReminders: ReminderScheduleInput[] = [];
  for (const reminder of reminders) {
    if (!isTimeString(reminder.time)) {
      return undefined;
    }
    normalizedReminders.push({
      time: reminder.time,
      enabled: Boolean(reminder.enabled)
    });
  }

  return {
    endpoint,
    planId,
    timezone,
    reminders: normalizedReminders
  };
}

function isTimeString(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

async function upsertSubscription(db: D1DatabaseLike, subscription: StoredSubscription): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at, updated_at)
       VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(endpoint) DO UPDATE SET
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(subscription.endpoint, subscription.p256dh, subscription.auth)
    .run();
}

async function deleteSubscription(db: D1DatabaseLike, endpoint: string): Promise<void> {
  await db.prepare('DELETE FROM reminder_schedules WHERE endpoint = ?1').bind(endpoint).run();
  await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(endpoint).run();
}

async function replaceReminderSchedules(
  db: D1DatabaseLike,
  payload: { endpoint: string; planId: string; timezone: string; reminders: ReminderScheduleInput[] }
): Promise<void> {
  await db.prepare('DELETE FROM reminder_schedules WHERE endpoint = ?1 AND plan_id = ?2').bind(payload.endpoint, payload.planId).run();

  if (payload.reminders.length === 0) {
    return;
  }

  for (const reminder of payload.reminders) {
    await db
      .prepare(
        `INSERT INTO reminder_schedules (id, endpoint, plan_id, timezone, time, enabled, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .bind(crypto.randomUUID(), payload.endpoint, payload.planId, payload.timezone, reminder.time, reminder.enabled ? 1 : 0)
      .run();
  }
}

async function getSubscriptionByEndpoint(db: D1DatabaseLike, endpoint: string): Promise<StoredSubscription | undefined> {
  const row = await db
    .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = ?1')
    .bind(endpoint)
    .first<StoredSubscription>();
  return row ?? undefined;
}

async function listSubscriptions(db: D1DatabaseLike): Promise<StoredSubscription[]> {
  const result = await db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions').all<StoredSubscription>();
  return result.results ?? [];
}

async function listEnabledReminderSchedules(db: D1DatabaseLike): Promise<StoredReminderSchedule[]> {
  const result = await db
    .prepare(
      `SELECT id, endpoint, plan_id AS planId, timezone, time, enabled, last_sent_local AS lastSentLocal
       FROM reminder_schedules
       WHERE enabled = 1`
    )
    .all<StoredReminderSchedule>();
  return result.results ?? [];
}

async function markReminderSent(db: D1DatabaseLike, id: string, localKey: string): Promise<void> {
  await db
    .prepare(
      `UPDATE reminder_schedules
       SET last_sent_local = ?1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?2`
    )
    .bind(localKey, id)
    .run();
}

function formatLocalDateTime(date: Date, timeZone: string): { date: string; time: string } | undefined {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    const hour = parts.find((part) => part.type === 'hour')?.value;
    const minute = parts.find((part) => part.type === 'minute')?.value;

    if (!year || !month || !day || !hour || !minute) {
      return undefined;
    }

    return {
      date: `${year}-${month}-${day}`,
      time: `${hour}:${minute}`
    };
  } catch {
    return undefined;
  }
}

async function sendPush(env: Env, endpoint: string): Promise<PushSendResult> {
  const vapidJwt = await createVapidJwt(env, endpoint);
  const modern = await fetch(endpoint, {
    method: 'POST',
    headers: {
      TTL: '60',
      Urgency: 'high',
      Authorization: `vapid t=${vapidJwt}, k=${env.VAPID_PUBLIC_KEY}`
    }
  });

  const modernBody = await modern.text();
  if (modern.ok) {
    return {
      status: modern.status,
      body: modernBody
    };
  }

  // Some push providers still expect legacy WebPush + Crypto-Key format.
  const legacy = await fetch(endpoint, {
    method: 'POST',
    headers: {
      TTL: '60',
      Urgency: 'high',
      Authorization: `WebPush ${vapidJwt}`,
      'Crypto-Key': `p256ecdsa=${env.VAPID_PUBLIC_KEY}`
    }
  });
  const legacyBody = await legacy.text();
  if (legacy.ok) {
    return {
      status: legacy.status,
      body: legacyBody
    };
  }

  throw new Error(`push_send_failed:modern:${modern.status}:${modernBody};legacy:${legacy.status}:${legacyBody}`);
}

async function createVapidJwt(env: Env, endpoint: string): Promise<string> {
  const header = base64UrlEncodeJson({ typ: 'JWT', alg: 'ES256' });
  const payload = base64UrlEncodeJson({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT
  });

  const data = `${header}.${payload}`;
  const signature = await signVapid(env, data);
  return `${data}.${signature}`;
}

async function checkVapidKeyPair(env: Env): Promise<{ pairValid: boolean; publicKeyLength: number; privateKeyLength: number }> {
  const publicBytes = base64UrlToBytes(env.VAPID_PUBLIC_KEY);
  const privateBytes = base64UrlToBytes(env.VAPID_PRIVATE_KEY);

  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    return {
      pairValid: false,
      publicKeyLength: publicBytes.length,
      privateKeyLength: privateBytes.length
    };
  }

  const x = bytesToBase64Url(publicBytes.slice(1, 33));
  const y = bytesToBase64Url(publicBytes.slice(33, 65));
  const d = bytesToBase64Url(privateBytes);

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      d,
      ext: false,
      key_ops: ['sign']
    },
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    false,
    ['sign']
  );

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      ext: false,
      key_ops: ['verify']
    },
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    false,
    ['verify']
  );

  const sample = new TextEncoder().encode('food-migration-vapid-check');
  const rawSignature = new Uint8Array(
    await crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: 'SHA-256'
      },
      privateKey,
      sample
    )
  );
  const isValid = await crypto.subtle.verify(
    {
      name: 'ECDSA',
      hash: 'SHA-256'
    },
    publicKey,
    rawSignature,
    sample
  );

  return {
    pairValid: isValid,
    publicKeyLength: publicBytes.length,
    privateKeyLength: privateBytes.length
  };
}

async function signVapid(env: Env, data: string): Promise<string> {
  const publicBytes = base64UrlToBytes(env.VAPID_PUBLIC_KEY);
  const privateBytes = base64UrlToBytes(env.VAPID_PRIVATE_KEY);

  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error('vapid_key_invalid');
  }

  const x = bytesToBase64Url(publicBytes.slice(1, 33));
  const y = bytesToBase64Url(publicBytes.slice(33, 65));
  const d = bytesToBase64Url(privateBytes);

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      d,
      ext: false,
      key_ops: ['sign']
    },
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    false,
    ['sign']
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: 'SHA-256'
      },
      privateKey,
      new TextEncoder().encode(data)
    )
  );

  const jose = signature.length === 64 ? signature : derToJose(signature);
  return bytesToBase64Url(jose);
}

function derToJose(der: Uint8Array): Uint8Array {
  // ASN.1 DER: 30 len 02 rLen r 02 sLen s
  let offset = 0;
  if (der[offset++] !== 0x30) {
    throw new Error('ecdsa_signature_invalid');
  }

  const seqLen = der[offset++];
  if (seqLen + 2 !== der.length) {
    throw new Error('ecdsa_signature_invalid');
  }

  if (der[offset++] !== 0x02) {
    throw new Error('ecdsa_signature_invalid');
  }
  const rLen = der[offset++];
  const r = der.slice(offset, offset + rLen);
  offset += rLen;

  if (der[offset++] !== 0x02) {
    throw new Error('ecdsa_signature_invalid');
  }
  const sLen = der[offset++];
  const s = der.slice(offset, offset + sLen);

  const out = new Uint8Array(64);
  out.set(trimAndPad32(r), 0);
  out.set(trimAndPad32(s), 32);
  return out;
}

function trimAndPad32(input: Uint8Array): Uint8Array {
  let value = input;
  while (value.length > 32 && value[0] === 0) {
    value = value.slice(1);
  }
  if (value.length > 32) {
    throw new Error('ecdsa_component_too_long');
  }
  const out = new Uint8Array(32);
  out.set(value, 32 - value.length);
  return out;
}

function base64UrlEncodeJson(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function isExpiredSubscriptionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /push_send_failed:(404|410):/.test(message);
}
