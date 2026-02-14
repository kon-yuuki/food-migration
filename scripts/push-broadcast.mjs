import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const envLocal = parseDotEnv(path.join(cwd, '.env.local'));
const args = parseArgs(process.argv.slice(2));

const apiBase =
  args.base ??
  process.env.PUSH_API_BASE_URL ??
  process.env.VITE_PUSH_API_BASE_URL ??
  envLocal.PUSH_API_BASE_URL ??
  envLocal.VITE_PUSH_API_BASE_URL;

const adminToken = args.token ?? process.env.PUSH_ADMIN_TOKEN ?? envLocal.PUSH_ADMIN_TOKEN;

if (!apiBase) {
  fail('PUSH_API_BASE_URL (または VITE_PUSH_API_BASE_URL) が未設定です。');
}

if (!adminToken) {
  fail('PUSH_ADMIN_TOKEN が未設定です。');
}

const payload = {
  title: args.title ?? 'Food Migration 通知',
  body: args.body ?? '給餌リマインダーです。',
  url: args.url ?? '/'
};

const endpoint = `${stripTrailingSlash(apiBase)}/api/push/broadcast`;

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-admin-token': adminToken
  },
  body: JSON.stringify(payload)
});

const raw = await response.text();
let data;
try {
  data = JSON.parse(raw);
} catch {
  data = { raw };
}

if (!response.ok || !data?.ok) {
  console.error('Push broadcast failed');
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log('Push broadcast success');
console.log(`sent=${data.sent ?? '-'} failed=${data.failed ?? '-'} deleted=${data.deleted ?? '-'}`);
console.log(JSON.stringify(data, null, 2));

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const index = trimmed.indexOf('=');
    if (index <= 0) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, '');
    result[key] = value;
  }

  return result;
}

function parseArgs(argv) {
  const output = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      output[key] = 'true';
      continue;
    }

    output[key] = next;
    i += 1;
  }

  return output;
}

function stripTrailingSlash(value) {
  return value.replace(/\/$/, '');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
