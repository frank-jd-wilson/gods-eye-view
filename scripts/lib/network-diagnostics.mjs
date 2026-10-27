import fs from 'node:fs';
import path from 'node:path';

/** Log hostnames only: URL paths, queries, userinfo and messages may hold keys. */
export function networkEvent({ event, url, status = null, type, error }) {
  let domain = null;
  try {
    domain = new URL(url).hostname || null;
  } catch {
    /* Non-network URL. */
  }
  const code = /^(?:net::ERR_[A-Z0-9_]+|[A-Z][A-Z0-9_]+)$/.test(error || '')
    ? error
    : undefined;
  return {
    event,
    domain,
    status,
    ...(type ? { type } : {}),
    ...(code ? { error: code } : {}),
  };
}

/** Never overwrite a previous run. Generated logs stay private on disk. */
export function createNetworkLog(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const fd = fs.openSync(filename, 'wx', 0o600);
  return {
    write(entry) {
      fs.writeSync(
        fd,
        JSON.stringify({ time: new Date().toISOString(), ...entry }) + '\n',
      );
    },
    close() {
      fs.closeSync(fd);
    },
  };
}

export function observePageNetwork(page, write) {
  const response = (r) =>
    write(
      networkEvent({
        event: 'response',
        url: r.url(),
        status: r.status(),
        type: r.request().resourceType(),
      }),
    );
  const failed = (r) =>
    write(
      networkEvent({
        event: 'requestfailed',
        url: r.url(),
        type: r.resourceType(),
        error: r.failure()?.errorText,
      }),
    );
  const pageError = () =>
    write({ event: 'pageerror', domain: null, status: null });
  page.on('response', response);
  page.on('requestfailed', failed);
  page.on('pageerror', pageError);
  return () => {
    page.off('response', response);
    page.off('requestfailed', failed);
    page.off('pageerror', pageError);
  };
}

/** Group only sanitized metadata; canceled requests remain visible as failures. */
export function summarizeNetwork(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const safe = networkEvent({
      ...entry,
      url: entry.domain ? `https://${entry.domain}` : '',
    });
    const key = JSON.stringify(safe);
    const group = groups.get(key) || { ...safe, count: 0 };
    group.count++;
    groups.set(key, group);
  }
  const counts = [...groups.values()];
  return {
    events: entries.length,
    counts,
    failures: counts.filter(
      (r) =>
        r.event === 'requestfailed' ||
        r.event === 'pageerror' ||
        r.status >= 400,
    ),
  };
}
