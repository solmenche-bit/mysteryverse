// Thin fetch wrapper for the MysteryVerse API.
export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(method, url, body, { raw = false } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: raw ? { 'Content-Type': 'application/octet-stream' } : body ? { 'Content-Type': 'application/json' } : {},
      body: raw ? body : body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the MysteryVerse server. Is it still running?');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body || {}),
  put: (url, body) => request('PUT', url, body || {}),
  del: (url) => request('DELETE', url),
  upload: (url, file) => request('POST', url, file, { raw: true }),

  status: () => request('GET', '/api/status'),
  daily: () => request('GET', '/api/daily'),
  start: (body) => request('POST', '/api/play/start', body),
  action: (roundId, action, payload) => request('POST', '/api/play/action', { roundId, action, payload }),
  report: (body) => request('POST', '/api/play/report', body),
};
