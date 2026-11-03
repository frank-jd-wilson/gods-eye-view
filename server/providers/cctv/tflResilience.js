/** Fixed codes only: never expose upstream HTML, URLs or credential-bearing errors. */
export function tflFailure(code, httpStatus = null) {
  const rows = [];
  rows.sourceStatus = { pack: 'tfl', state: 'unavailable', code, httpStatus };
  return rows;
}

export async function readTflResponse(response, readText) {
  if (!response.ok) {
    await response.body?.cancel?.().catch(() => {});
    return {
      error: tflFailure(
        `http-${response.status >= 500 ? '5xx' : response.status}`,
        response.status,
      ),
    };
  }
  const type = response.headers.get('content-type') || '';
  if (!/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(type)) {
    await response.body?.cancel?.().catch(() => {});
    return {
      error: tflFailure(
        /html/i.test(type) ? 'html-response' : 'content-type',
        response.status,
      ),
    };
  }
  const text = await readText(response, 8 * 1024 * 1024);
  if (/^\s*</.test(text))
    return { error: tflFailure('html-response', response.status) };
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    return { error: tflFailure('invalid-json', response.status) };
  }
  if (
    !Array.isArray(rows) ||
    rows.some(
      (row) =>
        !row ||
        typeof row !== 'object' ||
        typeof row.id !== 'string' ||
        !Object.hasOwn(row, 'lat') ||
        !Object.hasOwn(row, 'lon') ||
        !Array.isArray(row.additionalProperties),
    )
  ) {
    return { error: tflFailure('invalid-schema', response.status) };
  }
  return { rows };
}

/** Memory only; default denies stale retention until operator confirms permitted TTL. */
export function createTflPositionCache({
  now = Date.now,
  retentionMs = 0,
} = {}) {
  let last = null;
  return (rows, { disabled = false } = {}) => {
    if (disabled)
      return {
        rows: [],
        status: { pack: 'tfl', state: 'disabled', code: 'disabled' },
      };
    const status = rows.sourceStatus || {
      pack: 'tfl',
      state: rows.length ? 'ok' : 'empty',
      code: rows.length ? 'ok' : 'empty',
    };
    if (status.state !== 'unavailable') {
      last = { rows: rows.map((row) => ({ ...row })), at: now() };
      return {
        rows,
        status: { ...status, updatedAt: new Date(last.at).toISOString() },
      };
    }
    const usable = retentionMs > 0 && last && now() - last.at <= retentionMs;
    return {
      rows: usable
        ? last.rows.map((row) => ({
            ...row,
            url: '',
            snapshotUrl: '',
            feedType: 'image',
            stalePositionOnly: true,
          }))
        : [],
      status: {
        ...status,
        state: usable && last.rows.length ? 'stale' : 'unavailable',
        updatedAt: last ? new Date(last.at).toISOString() : null,
      },
    };
  };
}
