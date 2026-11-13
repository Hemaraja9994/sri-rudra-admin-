// Talking to the clinical API (same sign-in cookie as the admin portal).
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/clinical/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function navigate(path) {
  if (path === window.location.pathname) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

// For <a> elements that stay inside the clinical pages: keeps new-tab clicks working.
export function linkTo(path) {
  return {
    href: path,
    onClick: (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(path);
    },
  };
}

// Upload a file (the body is the file itself, not JSON). name and an optional AI summary go in the query.
export async function uploadFile(patientId, file, { name, summary } = {}) {
  const params = new URLSearchParams({ name: name || file.name || 'file' });
  if (summary) params.set('summary', summary);
  const res = await fetch(`/clinical/api/patients/${patientId}/files?${params}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Upload failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function fileUrl(id, { download } = {}) {
  return `/clinical/api/files/${id}${download ? '?download=1' : ''}`;
}

// The admin portal's own API (same origin, same sign-in): used by master control for staff and centres.
export async function portalApi(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data?.error?.message || data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function downloadText(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
