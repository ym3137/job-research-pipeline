import { spawn } from 'node:child_process';

let cached = null;
let cachedAt = 0;
let pending = null;

function windowView(window) {
  if (!window || !Number.isFinite(window.usedPercent)) return null;
  return {
    remainingPercent: Math.max(0, Math.min(100, 100 - window.usedPercent)),
    windowDurationMins: window.windowDurationMins ?? null,
    resetsAt: window.resetsAt ?? null,
  };
}

export function normalizeQuota(result) {
  const limits = result?.rateLimitsByLimitId?.codex || result?.rateLimits;
  if (!limits) return { status: 'unavailable' };
  return {
    status: 'available',
    planType: limits.planType || null,
    primary: windowView(limits.primary),
    secondary: windowView(limits.secondary),
    fetchedAt: new Date().toISOString(),
  };
}

function fetchQuota(codex) {
  return new Promise((resolve) => {
    const child = spawn(codex, ['app-server', '--stdio'], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let settled = false;
    let buffer = '';
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill('SIGTERM');
      resolve(value);
    };
    const timeout = setTimeout(() => finish({ status: 'unavailable' }), 12000);
    timeout.unref();
    child.on('error', () => finish({ status: 'unavailable' }));
    child.on('close', () => finish({ status: 'unavailable' }));
    child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 250000) return finish({ status: 'unavailable' });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1) {
          if (message.error) return finish({ status: 'unavailable' });
          child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
          child.stdin.write(JSON.stringify({ method: 'account/rateLimits/read', id: 2 }) + '\n');
        } else if (message.id === 2) {
          return finish(message.error ? { status: 'unavailable' } : normalizeQuota(message.result));
        }
      }
    });
    child.stdin.write(JSON.stringify({
      method: 'initialize', id: 1,
      params: { clientInfo: { name: 'career_desk', title: 'Career Desk', version: '0.1.0' } },
    }) + '\n');
  });
}

export async function readQuota(codex) {
  if (cached && Date.now() - cachedAt < (cached.status === 'available' ? 60000 : 30000)) return cached;
  if (!pending) pending = fetchQuota(codex).then((value) => {
    cached = value;
    cachedAt = Date.now();
    pending = null;
    return value;
  });
  return pending;
}
