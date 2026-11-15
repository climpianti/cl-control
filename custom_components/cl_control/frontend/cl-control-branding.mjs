const params = new URL(import.meta.url).searchParams;
const brand = params.get('brand') || 'CL Control';
const title = params.get('title') || brand;
const sidebarTitle = params.get('sidebar_title') || brand;
const logo = params.get('logo') || '';
const icon = params.get('icon') || logo;
const theme = params.get('theme') || '#19BAFF';
const sidebar = params.get('sidebar') !== '0';
const browser = params.get('browser') !== '0';
const faviconEnabled = params.get('favicon') !== '0';
const faviconIco = new URL('./favicon.ico', import.meta.url).href;
const favicon32 = new URL('./favicon-32.png', import.meta.url).href;
const appleTouchIcon = new URL('./apple-touch-icon.png', import.meta.url).href;

function deep(root, selector) {
  if (!root?.querySelector) return null;
  const direct = root.querySelector(selector);
  if (direct) return direct;
  for (const element of root.querySelectorAll('*')) {
    if (element.shadowRoot) {
      const match = deep(element.shadowRoot, selector);
      if (match) return match;
    }
  }
  return null;
}

function meta(name, content) {
  let element = document.head.querySelector(`meta[name="${name}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.name = name;
    document.head.append(element);
  }
  if (element.content !== content) element.content = content;
}

function rememberOriginal(element) {
  if (!element.dataset.clControlOriginalHref) {
    element.dataset.clControlOriginalHref = element.getAttribute('href') || '';
  }
}

function ensureIconLink(rel, href, {sizes = '', type = 'image/png'} = {}) {
  if (!href) return;
  const selector = `link[rel="${rel}"][data-cl-control-branding="1"]`;
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('link');
    element.rel = rel;
    element.dataset.clControlBranding = '1';
    document.head.append(element);
  }
  if (type) element.type = type;
  if (sizes) element.sizes = sizes;
  else element.removeAttribute('sizes');
  if (element.getAttribute('href') !== href) element.href = href;
}

function applyFavicon() {
  if (!faviconEnabled) return;

  // Remove only competing favicon nodes owned by Home Assistant or other
  // frontend modules. Managed CL Control links must remain stable: removing
  // and recreating them would retrigger the head MutationObserver forever
  // and some browsers would temporarily fall back to the generic globe icon.
  for (const element of document.head.querySelectorAll(
    'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
  )) {
    if (element.dataset.clControlBranding !== '1') element.remove();
  }

  // Keep the managed nodes idempotent. Modern browsers use the explicit
  // 32x32 PNG for the tab; shortcut icon provides an ICO fallback.
  ensureIconLink('icon', favicon32, {sizes: '32x32', type: 'image/png'});
  ensureIconLink('shortcut icon', faviconIco, {type: 'image/x-icon'});
  ensureIconLink('apple-touch-icon', appleTouchIcon, {sizes: '180x180', type: 'image/png'});
}
function apply() {
  try {
    if (browser && document.title !== title) document.title = title;
    meta('application-name', brand);
    meta('apple-mobile-web-app-title', brand);
    meta('theme-color', theme);
    applyFavicon();
    if (sidebar) {
      const element = deep(document, 'ha-sidebar');
      if (element && element.sidebarTitle !== sidebarTitle) {
        element.sidebarTitle = sidebarTitle;
        element.requestUpdate?.();
      }
    }
  } catch (error) {
    console.debug('CL Control branding skipped a presentation tweak', error);
  }
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    apply();
  });
}

customElements.whenDefined('ha-sidebar').then(schedule).catch(() => {});
[0, 100, 250, 1000, 3000].forEach(delay => setTimeout(schedule, delay));
['popstate', 'hashchange', 'location-changed'].forEach(eventName =>
  window.addEventListener(eventName, schedule)
);
window.addEventListener('resize', schedule, {passive: true});

// HA or the browser shell can recreate favicon nodes during startup/navigation.
// Re-apply only when head structure/icon hrefs change; schedule() is debounced.
const headObserver = new MutationObserver(mutations => {
  if (!faviconEnabled) return;
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      schedule();
      return;
    }
    if (
      mutation.type === 'attributes' &&
      mutation.target instanceof HTMLLinkElement &&
      ['href', 'rel'].includes(mutation.attributeName)
    ) {
      schedule();
      return;
    }
  }
});
headObserver.observe(document.head, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['href', 'rel'],
});

if (browser) {
  const titleNode = document.head.querySelector('title');
  if (titleNode) {
    new MutationObserver(schedule).observe(titleNode, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
}
