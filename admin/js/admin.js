// Applies the admin's chosen backend color theme (set on the Dashboard) as
// CSS custom property overrides — admin.css's :root values are just the
// built-in default until this runs. Kept separate from the session check
// below so a slow/failed theme fetch never blocks or breaks page access.
(async () => {
  try {
    const res = await fetch('/api/admin-theme');
    if (!res.ok) return;
    const theme = await res.json();
    const root = document.documentElement.style;
    if (theme.primary) root.setProperty('--color-primary', theme.primary);
    if (theme.secondary) root.setProperty('--color-panel', theme.secondary);
    if (theme.background) root.setProperty('--color-bg', theme.background);
    if (theme.textPrimary) root.setProperty('--color-text', theme.textPrimary);
    if (theme.textSecondary) root.setProperty('--color-text-muted', theme.textSecondary);
    if (theme.accent) root.setProperty('--color-accent', theme.accent);
  } catch (e) {
    // Leave the built-in default theme in place.
  }
})();

// Every admin page except login.html loads this script, so the session
// check here is what actually gates access to the panel.
(async () => {
  const res = await fetch('/api/admin/session');
  if (!res.ok) {
    const next = encodeURIComponent(location.pathname.split('/').pop());
    window.location.href = `login.html?next=${next}`;
    return;
  }
  const { username } = await res.json();
  document.querySelectorAll('[data-admin-username]').forEach((el) => (el.textContent = username));
})();

async function adminLogout() {
  await fetch('/api/admin/logout', { method: 'POST' });
  window.location.href = 'login.html';
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    // The session check at the top of this file redirects too, but it races
    // with each page's own data-loading calls — this is the fallback so a
    // 401 here always ends in a clean redirect instead of a thrown error
    // that breaks whatever screen was mid-render.
    const next = encodeURIComponent(location.pathname.split('/').pop());
    window.location.href = `login.html?next=${next}`;
    return new Promise(() => {});
  }
  if (!res.ok) {
    let message = `请求失败（${res.status}）`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch (e) {}
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
