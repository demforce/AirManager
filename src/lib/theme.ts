export const THEME_COOKIE = 'am-theme';
export const THEME_CHOSEN_EVENT = 'airmanager:theme-chosen';

// Parser-blocking in <head>, before the body or the React chunks. If the
// current CSP drops 'unsafe-inline', authorize this fixed script by hash or nonce.
export const SYSTEM_THEME_SCRIPT = `(() => {
  const root = document.documentElement;
  if (root.hasAttribute('data-theme') || !window.matchMedia) return;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const stop = () => media.removeEventListener('change', follow);
  const follow = () => {
    // A manual choice in another tab also takes precedence.
    const manual = document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=(dark|light)(?:;|$)/);
    root.dataset.theme = manual ? manual[1] : media.matches ? 'dark' : 'light';
    if (manual) stop();
  };
  root.dataset.theme = media.matches ? 'dark' : 'light';
  media.addEventListener('change', follow);
  document.addEventListener('${THEME_CHOSEN_EVENT}', stop, { once: true });
})();`;
