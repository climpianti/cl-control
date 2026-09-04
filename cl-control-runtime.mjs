export const EXPERIENCE_RANK = Object.freeze({
  essential: 0,
  standard: 1,
  pro: 2,
  installer: 3,
});

export const CL_CONTROL_ASSET_VERSION = "3.3.0-dev";

export const LAYOUT_SCHEMA_VERSION = 1;
export const LAYOUT_CONTEXTS = Object.freeze(["base", "mobile", "tablet", "wall"]);
export const LAYOUT_VIEWS = Object.freeze(["home", "lights", "covers", "climate", "energy", "security", "cameras", "support"]);

export function emptyLayout() {
  return { layout_schema_version: LAYOUT_SCHEMA_VERSION, base: {}, mobile: {}, tablet: {}, wall: {} };
}

export function layoutDeviceContext(width, requested = "auto") {
  if (["mobile", "tablet", "wall"].includes(requested)) return requested;
  const value = Number(width) || 0;
  if (value && value < 768) return "mobile";
  if (value && value < 1200) return "tablet";
  return "base";
}

const LAYOUT_DEFAULT_CARD = Object.freeze({
  type: "module", order: 0, size: "m", span: 1, shape: "rectangle",
  icon_size: "m", icon_container: "soft", show_icon: true, show_title: true,
  show_state: true, show_secondary: true, visible: true, favorite: false,
});
export const LAYOUT_CARD_CAPABILITIES = Object.freeze({
  module: { sizes: ["s", "m", "l"], shapes: ["compact", "rectangle", "square"] },
  status: { sizes: ["m", "l"], shapes: ["compact", "rectangle"] },
  favorites: { sizes: ["m", "l", "xl"], shapes: ["compact", "rectangle"] },
  light: { sizes: ["s", "m"], shapes: ["compact", "rectangle", "square"] },
  switch: { sizes: ["s", "m"], shapes: ["compact", "rectangle", "square"] },
  thermostat: { sizes: ["m", "l"], shapes: ["rectangle", "square"] },
  camera: { sizes: ["m", "l", "xl"], shapes: ["rectangle", "wide"] },
  energy: { sizes: ["l", "xl"], shapes: ["rectangle", "wide"] },
  security: { sizes: ["m", "l"], shapes: ["compact", "rectangle"] },
  assistance: { sizes: ["m", "l"], shapes: ["compact", "rectangle"] },
});

export function layoutCardCapabilities(type) {
  return LAYOUT_CARD_CAPABILITIES[type] || LAYOUT_CARD_CAPABILITIES.module;
}

export function normalizeLayoutCard(value = {}, type = "module") {
  const next = { ...LAYOUT_DEFAULT_CARD, ...(value && typeof value === "object" ? value : {}), type };
  const capabilities = layoutCardCapabilities(type);
  next.order = Math.max(-10000, Math.min(10000, Number.parseInt(next.order, 10) || 0));
  next.span = Math.max(1, Math.min(4, Number.parseInt(next.span, 10) || 1));
  if (!capabilities.sizes.includes(next.size)) next.size = capabilities.sizes[0];
  if (!capabilities.shapes.includes(next.shape)) next.shape = capabilities.shapes[0];
  if (!["s", "m", "l"].includes(next.icon_size)) next.icon_size = "m";
  if (!["none", "soft", "solid"].includes(next.icon_container)) next.icon_container = "soft";
  for (const key of ["show_icon", "show_title", "show_state", "show_secondary", "visible"]) next[key] = next[key] !== false;
  next.favorite = next.favorite === true;
  if (next.visible && !next.show_icon && !next.show_title) next.show_title = true;
  return next;
}

export function effectiveLayout(layout, context, view, generatedCards = []) {
  const safe = layout && typeof layout === "object" ? layout : emptyLayout();
  const base = safe.base?.[view] || {};
  const override = context !== "base" ? safe[context]?.[view] || {} : {};
  return generatedCards.map((card, generatedOrder) => {
    const type = card.type || "module";
    const value = normalizeLayoutCard({ order: generatedOrder, ...card, ...(base[card.id] || {}), ...(override[card.id] || {}) }, type);
    return { ...value, id: card.id };
  }).filter(card => card.visible).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function reorderLayoutCards(cards, movedId, targetId) {
  const result = cards.map(card => ({ ...card }));
  const from = result.findIndex(card => card.id === movedId), to = result.findIndex(card => card.id === targetId);
  if (from < 0 || to < 0 || from === to) return result;
  const [moved] = result.splice(from, 1); result.splice(to, 0, moved);
  return result.map((card, order) => ({ ...card, order }));
}

export function layoutOverrides(cards, inheritedCards) {
  const inherited = new Map((inheritedCards || []).map(card => [card.id, card]));
  return (cards || []).map(card => {
    const base = inherited.get(card.id) || {};
    const override = { id: card.id, type: card.type };
    for (const key of ["order", "size", "span", "shape", "icon", "icon_size", "icon_container", "show_icon", "show_title", "show_state", "show_secondary", "visible", "favorite"]) {
      if (card[key] !== base[key]) override[key] = card[key];
    }
    return override;
  }).filter(card => Object.keys(card).length > 2);
}

export function colorWheelSelection(clientX, clientY, rect, options = {}) {
  const width = Number(rect?.width) || 0;
  const height = Number(rect?.height) || 0;
  const radius = Math.min(width, height) / 2;
  if (!radius) return null;
  const centerX = Number(rect.left) + width / 2;
  const centerY = Number(rect.top) + height / 2;
  const dx = Number(clientX) - centerX;
  const dy = Number(clientY) - centerY;
  const distance = Math.hypot(dx, dy);
  const innerRatio = Number(options.innerRatio) || 0.36;
  if (distance < 0.001) return null;
  if (!options.allowOutside && (distance < radius * innerRatio || distance > radius)) return null;
  const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
  return { hue: Math.round(hue) % 360, distance: Math.min(1, distance / radius) };
}

export function createSliderGesture(options = {}) {
  const threshold = Math.max(1, Number(options.threshold) || 10);
  let gesture = null;
  return {
    start(pointerId, x, y, value) { gesture = { pointerId, x: Number(x), y: Number(y), value: Number(value), mode: "pending", preview: Number(value) }; return { mode: "pending", value: gesture.value }; },
    move(pointerId, x, y, value) { if (!gesture || gesture.pointerId !== pointerId) return { mode: "ignored" }; const dx = Number(x) - gesture.x, dy = Number(y) - gesture.y; if (gesture.mode === "pending" && Math.max(Math.abs(dx), Math.abs(dy)) >= threshold) gesture.mode = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical"; if (gesture.mode === "horizontal") gesture.preview = Number(value); return { mode: gesture.mode, value: gesture.mode === "horizontal" ? gesture.preview : gesture.value }; },
    end(pointerId) { if (!gesture || gesture.pointerId !== pointerId) return { mode: "ignored", commit: false }; const result = { mode: gesture.mode, value: gesture.mode === "horizontal" ? gesture.preview : gesture.value, commit: gesture.mode === "horizontal" }; gesture = null; return result; },
    cancel(pointerId) { if (!gesture || gesture.pointerId !== pointerId) return { mode: "ignored", commit: false }; const value = gesture.value; gesture = null; return { mode: "cancelled", value, commit: false }; },
  };
}

export function bindIntentionalSlider(input, options = {}) {
  if (!input) return () => {};
  input.classList.add("intentionalSlider"); const machine = createSliderGesture({ threshold: options.threshold }); let active = null, suppressNative = false;
  const valueAt = event => { const rect = input.getBoundingClientRect(), min = Number(input.min) || 0, max = Number(input.max) || 100, ratio = Math.max(0, Math.min(1, (Number(event.clientX) - rect.left) / Math.max(1, rect.width))), step = Number(input.step) || 1; return Math.round((min + ratio * (max - min)) / step) * step; };
  const restore = value => { input.value = String(value); options.onPreview?.(Number(value)); };
  const down = event => { if (options.disabled?.() || (event.button != null && event.button !== 0)) return; active = { pointerId: event.pointerId, initial: Number(input.value) }; machine.start(event.pointerId, event.clientX, event.clientY, active.initial); };
  const move = event => { if (!active || active.pointerId !== event.pointerId) return; const result = machine.move(event.pointerId, event.clientX, event.clientY, valueAt(event)); if (result.mode === "horizontal") { event.preventDefault(); if (!active.captured) { input.setPointerCapture?.(event.pointerId); active.captured = true; } restore(result.value); } else restore(active.initial); };
  const finish = (event, cancelled = false) => { if (!active || active.pointerId !== event.pointerId) return; const initial = active.initial, result = cancelled ? machine.cancel(event.pointerId) : machine.end(event.pointerId); if (active.captured) input.releasePointerCapture?.(event.pointerId); active = null; suppressNative = true; restore(result.commit ? result.value : initial); if (result.commit && !options.disabled?.()) options.onCommit?.(Number(result.value)); queueMicrotask(() => { suppressNative = false; if (!result.commit) restore(initial); }); };
  const inputEvent = event => { if (active && (suppressNative || !active.captured)) { event.preventDefault(); restore(active.initial); } }; const change = event => { if (active || suppressNative) { event.preventDefault(); return; } if (event.detail === 0 && !options.disabled?.()) options.onCommit?.(Number(input.value)); };
  input.addEventListener("pointerdown", down); input.addEventListener("pointermove", move); input.addEventListener("pointerup", event => finish(event)); input.addEventListener("pointercancel", event => finish(event, true)); input.addEventListener("input", inputEvent); input.addEventListener("change", change); return () => {};
}

export const FALLBACK_BOOTSTRAP = Object.freeze({
  schema_version: 1,
  version: "3.3.0-dev",
  branding: {
    brand_name: "Control",
    company_name: "",
    product_name: "Control",
    assets: { logo: "" },
    colors: {
      primary: "#1976D2",
      secondary: "#0D47A1",
      accent: "#2E7D32",
      background: "#101418",
      surface: "#182028",
      surface_alt: "#111820",
      text: "#F5F7FA",
      muted: "#9AA7B4",
      warning: "#F9A825",
      danger: "#D32F2F",
      line: "rgba(150, 170, 190, 0.20)",
      light_default_rgb: "249, 168, 37",
    },
    typography: {
      font_family: "system-ui, sans-serif",
      font_url: "",
    },
    design_tokens: {
      spacing: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", xxl: "32px" },
      radius: { sm: "8px", md: "12px", lg: "18px", xl: "24px", pill: "999px" },
      shadow: {
        low: "0 4px 14px rgba(0,0,0,.12)",
        medium: "0 12px 30px rgba(0,0,0,.18)",
        high: "0 20px 48px rgba(0,0,0,.24)",
      },
      icon_size: { sm: "18px", md: "22px", lg: "28px" },
      typography_scale: { micro: "10px", caption: "12px", label: "13px", body_small: "14px", body: "15px", section: "17px", heading: "20px", page: "26px", title: "24px", display: "32px" },
      font_weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
      component_size: { content_max_width: "1280px", logo: "72px", logo_compact: "52px", logo_desktop: "58px", camera_height: "200px", navigation_max_width: "960px", navigation_item_width: "82px", panel_bottom_space: "96px", flow_node_min_height: "96px", header: "58px", bottom_nav: "64px", nav_rail: "80px", sidebar: "224px", nav_item: "52px", tile_icon: "42px", status_icon: "42px", status: "68px", quick_tile: "88px", toggle_dot: "18px", installer_max_width: "1120px", dialog_max_width: "520px", toast_max_width: "520px", bottom_sheet_max_width: "620px", thermostat_min_height: "190px", color_picker_max: "220px", choice_list_max_height: "240px", layout_min_column: "168px", layout_editor_bar: "64px", layout_preview_mobile: "390px", layout_preview_tablet: "820px", layout_preview_wall: "1200px" },
      touch_target: "44px",
      breakpoints: { phone: 480, tablet: 768, desktop: 1200 },
      motion: {
        fast: "120ms",
        normal: "180ms",
        slow: "280ms",
        flow: "1.4s",
        skeleton: "1.2s",
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      },
      state: {
        active: "#2E7D32",
        disabled: "#71859A",
        warning: "#F9A825",
        error: "#D32F2F",
      },
      opacity: { subtle: 0.08, soft: 0.14, medium: 0.35, strong: 0.70, disabled: 0.48 },
      effect: { blur_nav: "18px", blur_dialog: "8px", focus_ring: "2px solid var(--cl-primary)" },
      color_picker: {
        default_hue: 38,
        saturation: "86%",
        lightness: "56%",
        wheel: "conic-gradient(hsl(0 90% 55%), hsl(60 90% 55%), hsl(120 80% 45%), hsl(180 85% 45%), hsl(240 90% 60%), hsl(300 85% 55%), hsl(360 90% 55%))",
        mask: "radial-gradient(circle, transparent 0 34%, black 36%)",
      },
    },
    themes: [{ id: "default", name: "Default", description: "", mode: "dark", colors: {} }],
  },
  frontend: { show_version: true, gestures: { slider_threshold_px: 10 } },
  discovery: { experience_rules: {} },
  customer_ui: {
    default_theme: "default",
    default_page: "home",
    experience: {
      default_level: "standard",
      levels: ["essential", "standard", "pro"],
      allow_user_override: false,
    },
    labels: {},
  },
  site: { site_name: "Casa", customer: "", support: {} },
  runtime: {},
});

export function deepMerge(base, override) {
  const result = structuredCloneSafe(base);
  if (!override || typeof override !== "object" || Array.isArray(override)) return result;
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = structuredCloneSafe(value);
    }
  }
  return result;
}

export function structuredCloneSafe(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function activeTheme(bootstrap, themeId) {
  const themes = bootstrap?.branding?.themes || [];
  return themes.find((theme) => theme.id === themeId) || themes[0] || { colors: {} };
}

export function buildDesignTokens(bootstrap, themeId) {
  const brand = bootstrap.branding;
  const theme = activeTheme(bootstrap, themeId);
  const colors = { ...brand.colors, ...(theme.colors || {}) };
  const tokens = brand.design_tokens || {};
  return {
    "--cl-font-family": brand.typography?.font_family,
    "--cl-primary": colors.primary,
    "--cl-secondary": colors.secondary,
    "--cl-success": colors.accent,
    "--cl-background": colors.background,
    "--cl-surface": colors.surface,
    "--cl-surface-alt": colors.surface_alt,
    "--cl-text": colors.text,
    "--cl-muted": colors.muted,
    "--cl-warning": colors.warning,
    "--cl-danger": colors.danger,
    "--cl-line": colors.line,
    "--cl-light-default-rgb": colors.light_default_rgb,
    "--cl-space-xs": tokens.spacing?.xs,
    "--cl-space-sm": tokens.spacing?.sm,
    "--cl-space-md": tokens.spacing?.md,
    "--cl-space-lg": tokens.spacing?.lg,
    "--cl-space-xl": tokens.spacing?.xl,
    "--cl-space-xxl": tokens.spacing?.xxl,
    "--cl-radius-sm": tokens.radius?.sm,
    "--cl-radius-md": tokens.radius?.md,
    "--cl-radius-lg": tokens.radius?.lg,
    "--cl-radius-xl": tokens.radius?.xl,
    "--cl-radius-pill": tokens.radius?.pill,
    "--cl-shadow-low": tokens.shadow?.low,
    "--cl-shadow-medium": tokens.shadow?.medium,
    "--cl-shadow-high": tokens.shadow?.high,
    "--cl-icon-sm": tokens.icon_size?.sm,
    "--cl-icon-md": tokens.icon_size?.md,
    "--cl-icon-lg": tokens.icon_size?.lg,
    "--cl-font-micro": tokens.typography_scale?.micro,
    "--cl-font-caption": tokens.typography_scale?.caption,
    "--cl-font-label": tokens.typography_scale?.label,
    "--cl-font-body-small": tokens.typography_scale?.body_small,
    "--cl-font-body": tokens.typography_scale?.body,
    "--cl-font-heading": tokens.typography_scale?.heading,
    "--cl-font-section": tokens.typography_scale?.section,
    "--cl-font-page": tokens.typography_scale?.page,
    "--cl-font-title": tokens.typography_scale?.title,
    "--cl-font-display": tokens.typography_scale?.display,
    "--cl-weight-regular": tokens.font_weight?.regular,
    "--cl-weight-medium": tokens.font_weight?.medium,
    "--cl-weight-semibold": tokens.font_weight?.semibold,
    "--cl-weight-bold": tokens.font_weight?.bold,
    "--cl-content-max-width": tokens.component_size?.content_max_width,
    "--cl-logo-size": tokens.component_size?.logo,
    "--cl-camera-height": tokens.component_size?.camera_height,
    "--cl-navigation-max-width": tokens.component_size?.navigation_max_width,
    "--cl-navigation-item-width": tokens.component_size?.navigation_item_width,
    "--cl-panel-bottom-space": tokens.component_size?.panel_bottom_space,
    "--cl-flow-node-min-height": tokens.component_size?.flow_node_min_height,
    "--cl-size-logo-compact": tokens.component_size?.logo_compact,
    "--cl-size-logo-desktop": tokens.component_size?.logo_desktop || tokens.component_size?.logo_compact,
    "--cl-size-header": tokens.component_size?.header,
    "--cl-size-bottom-nav": tokens.component_size?.bottom_nav,
    "--cl-size-nav-rail": tokens.component_size?.nav_rail,
    "--cl-size-sidebar": tokens.component_size?.sidebar,
    "--cl-size-nav-item": tokens.component_size?.nav_item,
    "--cl-size-tile-icon": tokens.component_size?.tile_icon,
    "--cl-size-status-icon": tokens.component_size?.status_icon,
    "--cl-size-status": tokens.component_size?.status,
    "--cl-size-quick-tile": tokens.component_size?.quick_tile,
    "--cl-size-toggle-dot": tokens.component_size?.toggle_dot,
    "--cl-installer-max-width": tokens.component_size?.installer_max_width,
    "--cl-dialog-max-width": tokens.component_size?.dialog_max_width,
    "--cl-toast-max-width": tokens.component_size?.toast_max_width,
    "--cl-bottom-sheet-max-width": tokens.component_size?.bottom_sheet_max_width || tokens.component_size?.dialog_max_width,
    "--cl-thermostat-min-height": tokens.component_size?.thermostat_min_height,
    "--cl-color-picker-max": tokens.component_size?.color_picker_max,
    "--cl-choice-list-max-height": tokens.component_size?.choice_list_max_height,
    "--cl-layout-min-column": tokens.component_size?.layout_min_column,
    "--cl-layout-editor-bar": tokens.component_size?.layout_editor_bar,
    "--cl-layout-preview-mobile": tokens.component_size?.layout_preview_mobile,
    "--cl-layout-preview-tablet": tokens.component_size?.layout_preview_tablet,
    "--cl-layout-preview-wall": tokens.component_size?.layout_preview_wall,
    "--cl-touch-target": tokens.touch_target,
    "--cl-motion-fast": tokens.motion?.fast,
    "--cl-motion-normal": tokens.motion?.normal,
    "--cl-motion-slow": tokens.motion?.slow,
    "--cl-motion-flow": tokens.motion?.flow,
    "--cl-motion-skeleton": tokens.motion?.skeleton,
    "--cl-easing": tokens.motion?.easing,
    "--cl-state-disabled": tokens.state?.disabled,
    "--cl-opacity-disabled": tokens.opacity?.disabled,
    "--cl-opacity-soft": tokens.opacity?.soft,
    "--cl-opacity-strong": tokens.opacity?.strong,
    "--cl-blur-nav": tokens.effect?.blur_nav,
    "--cl-blur-dialog": tokens.effect?.blur_dialog,
    "--cl-focus-ring": tokens.effect?.focus_ring,
    "--cl-color-picker-default-hue": tokens.color_picker?.default_hue,
    "--cl-color-picker-saturation": tokens.color_picker?.saturation,
    "--cl-color-picker-lightness": tokens.color_picker?.lightness,
    "--cl-color-picker-mask": tokens.color_picker?.mask,
    "--cl-on-primary": colors.text,
    "--cl-overlay-soft": "color-mix(in srgb, var(--cl-text) 8%, transparent)",
    "--cl-overlay-medium": "color-mix(in srgb, var(--cl-text) 15%, transparent)",
    "--cl-primary-soft": "color-mix(in srgb, var(--cl-primary) 14%, transparent)",
    "--cl-primary-medium": "color-mix(in srgb, var(--cl-primary) 35%, transparent)",
    "--cl-success-soft": "color-mix(in srgb, var(--cl-success) 15%, transparent)",
    "--cl-warning-soft": "color-mix(in srgb, var(--cl-warning) 14%, transparent)",
    "--cl-danger-soft": "color-mix(in srgb, var(--cl-danger) 13%, transparent)",
    "--cl-surface-translucent": "color-mix(in srgb, var(--cl-surface-alt) 72%, transparent)",
    "--cl-app-background": "var(--cl-background)",
    "--cl-top-background": "color-mix(in srgb, var(--cl-background) 94%, transparent)",
    "--cl-header-background": "color-mix(in srgb, var(--cl-background) 92%, transparent)",
    "--cl-card-background": "color-mix(in srgb, var(--cl-surface) 92%, var(--cl-background))",
    "--cl-hero-background": "linear-gradient(145deg, var(--cl-surface), var(--cl-surface-alt))",
    "--cl-nav-background": "color-mix(in srgb, var(--cl-background) 94%, transparent)",
    "--cl-color-wheel": tokens.color_picker?.wheel,
  };
}

export function applyDesignTokens(element, bootstrap, themeId) {
  for (const [name, value] of Object.entries(buildDesignTokens(bootstrap, themeId))) {
    if (value !== undefined && value !== null && value !== "") {
      element.style.setProperty(name, String(value));
    }
  }
}

export function classifyEntity(entityId, attributes = {}, discovery = {}) {
  const rules = discovery.experience_rules || {};
  const text = `${entityId} ${attributes.friendly_name || ""}`.toLowerCase();
  for (const pattern of rules.installer_patterns || []) {
    try {
      if (new RegExp(pattern, "i").test(text)) {
        return classification("installer", 0.98, "installer_pattern", discovery);
      }
    } catch (_err) {
      // Invalid administrator-supplied patterns are ignored client-side.
    }
  }
  const domain = String(entityId).split(".", 1)[0];
  if ((rules.essential_domains || []).includes(domain)) {
    return classification("essential", 0.92, "essential_domain", discovery);
  }
  if ((rules.standard_domains || []).includes(domain)) {
    return classification("standard", 0.88, "standard_domain", discovery);
  }
  if ((rules.pro_domains || []).includes(domain)) {
    return classification("pro", 0.65, "broad_technical_domain", discovery);
  }
  return classification("standard", 0.40, "fallback", discovery);
}

function classification(level, confidence, reason, discovery) {
  const threshold = Number(discovery.classification_confidence_threshold ?? 0.75);
  return {
    recommended_level: level,
    classification_confidence: confidence,
    classification_reason: reason,
    needs_review: confidence < threshold,
  };
}

export function recommendedExperienceLevel(entityId, attributes = {}, discovery = {}) {
  return classifyEntity(entityId, attributes, discovery).recommended_level;
}

export function visibleAtExperience(itemLevel, activeLevel, isInstaller = false) {
  if (isInstaller) return true;
  const itemRank = EXPERIENCE_RANK[itemLevel] ?? EXPERIENCE_RANK.standard;
  const activeRank = EXPERIENCE_RANK[activeLevel] ?? EXPERIENCE_RANK.standard;
  return itemRank <= activeRank && itemLevel !== "installer";
}

export function looksTechnicalName(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  const compact = text.toLowerCase().replaceAll(" ", "_");
  return (
    /(?:shelly|sonoff|esphome|tasmota|zigbee|zwave)[-_]?[a-f0-9]{6,}/i.test(compact) ||
    /(?:^|[-_])[a-f0-9]{10,}(?:$|[-_])/i.test(compact) ||
    /\b(?:channel|canale|relay|switch)[-_ ]?\d+\b/i.test(compact) ||
    /^[a-z0-9]+(?:[-_][a-z0-9]+){3,}$/i.test(compact)
  );
}

export function classifySwitchModule(entityId, attributes = {}, metadata = {}, manualModule = "") {
  if (manualModule) {
    return { module: manualModule, classification_confidence: 1, classification_reason: "installer_override", needs_review: false, customer_facing: manualModule === "lights" };
  }
  const domain = String(entityId || "").split(".", 1)[0];
  if (domain === "light") return { module: "lights", classification_confidence: 1, classification_reason: "light_domain", needs_review: false, customer_facing: true };
  if (!["switch", "valve"].includes(domain)) return { module: "unassigned", classification_confidence: 0, classification_reason: "unsupported_domain", needs_review: true, customer_facing: false };
  const category = String(metadata.entity_category || attributes.entity_category || "").toLowerCase();
  if (["config", "diagnostic"].includes(category)) return { module: "installer", classification_confidence: 0.98, classification_reason: "entity_category", needs_review: false, customer_facing: false };
  if (String(metadata.switch_type || "").toLowerCase() === "luce") return { module: "lights", classification_confidence: 1, classification_reason: "installer_type_override", needs_review: false, customer_facing: true };
  const deviceClass = String(attributes.device_class || metadata.device_class || "").toLowerCase();
  const text = [attributes.friendly_name, metadata.name, metadata.original_name, metadata.device_name, metadata.area_name].filter(Boolean).join(" ").toLowerCase();
  const lightWords = /\b(luce|luci|lampada|lampadario|applique|illuminazione|faretti?|led)\b/i;
  if (deviceClass === "light") return { module: "lights", classification_confidence: 0.96, classification_reason: "light_device_class", needs_review: false, customer_facing: true };
  if (lightWords.test(text)) return { module: "lights", classification_confidence: 0.84, classification_reason: "light_semantics", needs_review: false, customer_facing: true };
  return { module: "unassigned", classification_confidence: 0.38, classification_reason: "generic_switch", needs_review: true, customer_facing: false };
}

export function selectMobileNavigation(items, { isAdmin = false, maxItems = 5 } = {}) {
  const ids = items.map(item => Array.isArray(item) ? item[0] : item).filter(Boolean);
  const available = new Set(ids);
  const destination = isAdmin && available.has("more") ? "more" : available.has("support") ? "support" : null;
  const priority = ["home", "lights", "climate", "security", "covers", "energy", "cameras", "favorites"];
  const selected = priority.filter(id => available.has(id));
  for (const id of ids) if (!selected.includes(id) && id !== destination && id !== "more" && selected.length < maxItems) selected.push(id);
  if (destination) {
    const limit = Math.max(0, maxItems - 1);
    selected.splice(limit);
    selected.push(destination);
  } else selected.splice(maxItems);
  return selected.slice(0, maxItems);
}

export function buildResponsiveNavigation(items, { maxItems = 5 } = {}) {
  const ids = items.map(item => Array.isArray(item) ? item[0] : item).filter(Boolean);
  const home = ids.includes("home") ? ["home"] : [];
  const candidates = ids.filter(id => id !== "home" && id !== "more");
  const priority = ["lights", "covers", "climate", "security", "energy", "cameras", "favorites", "support"];
  const ordered = [...priority.filter(id => candidates.includes(id)), ...candidates.filter(id => !priority.includes(id))];
  const directSlots = Math.max(0, Math.min(3, maxItems - home.length - 1));
  const direct = ordered.slice(0, directSlots);
  const overflow = ids.filter(id => !home.includes(id) && !direct.includes(id));
  if (!overflow.length) return { primary: [...home, ...ordered].slice(0, maxItems), overflow: [] };
  return { primary: [...home, ...direct, "overflow"].slice(0, maxItems), overflow };
}

export function unreachableNavigationItems(items, model = buildResponsiveNavigation(items)) {
  const ids = items.map(item => Array.isArray(item) ? item[0] : item).filter(Boolean);
  const reachable = new Set(model.primary.filter(id => id !== "overflow"));
  if (model.primary.includes("overflow")) {
    for (const id of model.overflow || []) reachable.add(id);
  }
  return ids.filter(id => !reachable.has(id));
}

export function classifySecurityZone(entityId, attributes = {}, metadata = {}, override = {}) {
  const domain = String(entityId || "").split(".", 1)[0];
  if (domain !== "binary_sensor") {
    return { module: "unassigned", type: "generic", classification_confidence: 0, classification_reason: "unsupported_domain", needs_review: false, customer_facing: false, security_candidate: false };
  }
  const manualModule = String(override.module || "").toLowerCase();
  const manualSubtype = String(override.subtype || "").toLowerCase();
  const threshold = Number(override.threshold ?? 0.75);
  const rawClass = String(manualSubtype || attributes.device_class || metadata.device_class || metadata.original_device_class || "").toLowerCase();
  const typeMap = { motion: "motion", occupancy: "occupancy", presence: "occupancy", opening: "opening", door: "door", window: "window", garage_door: "garage", vibration: "vibration", smoke: "smoke", gas: "gas", moisture: "moisture", tamper: "tamper", safety: "generic" };
  const type = typeMap[rawClass] || (manualSubtype && manualSubtype !== "auto" ? manualSubtype : "generic");
  if (manualModule && manualModule !== "auto") {
    return { module: manualModule, type, classification_confidence: 1, classification_reason: "installer_override", needs_review: false, customer_facing: manualModule === "security", security_candidate: manualModule === "security" };
  }
  const integrationText = [metadata.platform, metadata.integration, metadata.config_entry_domain, metadata.manufacturer, ...(metadata.identifiers || [])].filter(Boolean).join(" ").toLowerCase();
  const semanticText = [entityId, attributes.friendly_name, metadata.name, metadata.original_name, metadata.device_name, metadata.config_entry_title].filter(Boolean).join(" ").toLowerCase();
  const securityIntegration = /(?:^|[^a-z0-9])(?:risco|irisco|inim|alarmo|paradox|dsc|texecom|jablotron)(?:$|[^a-z0-9])/i.test(integrationText);
  const linkedToAlarm = metadata.linked_to_alarm_panel === true;
  const securitySemantics = /(?:^|[^a-z0-9])(?:allarme|antifurto|alarm|security|sicurezza|zona|zone|serranda|tamper|sabotaggio)(?:$|[^a-z0-9])/i.test(semanticText);
  const knownType = Boolean(typeMap[rawClass]);
  let confidence = 0.15;
  let reason = "not_security_related";
  let candidate = false;
  if (securityIntegration) {
    confidence = 0.98; reason = "security_integration"; candidate = true;
  } else if (linkedToAlarm) {
    confidence = 0.95; reason = "linked_to_alarm_panel"; candidate = true;
  } else if (knownType && securitySemantics) {
    confidence = 0.88; reason = "device_class_and_security_semantics"; candidate = true;
  } else if (securitySemantics) {
    confidence = 0.82; reason = "security_semantics"; candidate = true;
  } else if (knownType) {
    confidence = 0.64; reason = "security_capable_device_class"; candidate = true;
  }
  const needsReview = candidate && confidence < threshold;
  return {
    module: candidate ? "security" : "unassigned",
    proposed_module: candidate ? "security" : "unassigned",
    type,
    classification_confidence: confidence,
    classification_reason: reason,
    needs_review: needsReview,
    customer_facing: candidate && !needsReview,
    security_candidate: candidate,
  };
}

export function classifyCover(entityId, attributes = {}, metadata = {}, override = "") {
  const raw = String(override || attributes.device_class || metadata.device_class || "generic").toLowerCase();
  const map = { window: ["window", "Finestra"], shutter: ["shutter", "Tapparella"], blind: ["blind", "Tenda/Veneziana"], shade: ["blind", "Tenda/Veneziana"], curtain: ["curtain", "Tenda"], door: ["door", "Porta"], garage: ["garage", "Garage/Basculante"], gate: ["gate", "Cancello"], awning: ["curtain", "Tenda"] };
  const [type, label] = map[raw] || ["generic", "Apertura"];
  return { type, label, confidence: override ? 1 : raw === "generic" ? 0.45 : 0.96, entity_id: entityId };
}

const ENVIRONMENT_CLASSES = Object.freeze({ temperature: "temperature", humidity: "humidity", carbon_dioxide: "co2", volatile_organic_compounds: "voc", volatile_organic_compounds_parts: "voc", pm1: "pm1", pm25: "pm25", pm10: "pm10", aqi: "aqi", air_quality: "air_quality_generic", atmospheric_pressure: "pressure", pressure: "pressure", radon: "radon", formaldehyde: "formaldehyde", carbon_monoxide: "co" });

export function classifyEnvironmentSensor(entityId, attributes = {}, metadata = {}, override = {}) {
  const domain = String(entityId || "").split(".", 1)[0], manualModule = String(override.module || "").toLowerCase(), manualType = String(override.subtype || "").toLowerCase(), threshold = Number(override.threshold ?? 0.75);
  if (manualModule && manualModule !== "auto") return { module: manualModule, type: manualType && manualType !== "auto" ? manualType : "air_quality_generic", classification_confidence: 1, classification_reason: "installer_override", needs_review: false, customer_facing: manualModule === "environment", environment_candidate: manualModule === "environment" };
  if (domain !== "sensor") return { module: "unassigned", type: "generic", classification_confidence: 0, classification_reason: "unsupported_domain", needs_review: false, customer_facing: false, environment_candidate: false };
  const rawClass = String(manualType || attributes.device_class || metadata.original_device_class || metadata.device_class || "").toLowerCase(); let type = ENVIRONMENT_CLASSES[rawClass] || "";
  const text = [entityId, attributes.friendly_name, metadata.name, metadata.original_name, metadata.device_name].filter(Boolean).join(" ").toLowerCase(), unit = String(attributes.unit_of_measurement || "").toLowerCase();
  const patterns = [["co2", /\b(?:co2|carbon dioxide|anidride carbonica)\b/i], ["voc", /\b(?:voc|tvoc|volatile)\b/i], ["pm25", /\bpm\s*2[._,]?5\b/i], ["pm10", /\bpm\s*10\b/i], ["pm1", /\bpm\s*1\b/i], ["aqi", /\b(?:aqi|air quality|qualit[aà] aria)\b/i], ["radon", /\bradon\b/i], ["formaldehyde", /\b(?:formaldehyde|formaldeide|hcho)\b/i], ["humidity", /\b(?:humidity|umidit[aà])\b/i], ["pressure", /\b(?:pressure|pressione)\b/i], ["temperature", /\b(?:temperature|temperatura)\b/i]];
  if (!type) type = patterns.find(([, pattern]) => pattern.test(text))?.[0] || "";
  const strongUnit = /(?:ppm|ppb|µg\/m³|ug\/m3|bq\/m³|bq\/m3)/i.test(unit), candidate = Boolean(type), confidence = ENVIRONMENT_CLASSES[rawClass] ? 0.96 : candidate && strongUnit ? 0.88 : candidate ? 0.68 : 0.12, needsReview = candidate && confidence < threshold;
  return { module: candidate ? "environment" : "unassigned", type: type || "generic", classification_confidence: confidence, classification_reason: ENVIRONMENT_CLASSES[rawClass] ? "device_class" : candidate ? "semantics_and_unit" : "not_environmental", needs_review: needsReview, customer_facing: candidate && !needsReview, environment_candidate: candidate };
}

export function environmentStatus(type, rawValue, thresholds = {}) {
  const value = Number(rawValue); if (!Number.isFinite(value)) return { key: "unavailable", label: "Non disponibile" }; const rule = thresholds?.[type] || {};
  if (Number.isFinite(Number(rule.high)) && value >= Number(rule.high)) return { key: "high", label: "Elevata" };
  if ((Number.isFinite(Number(rule.warning_high)) && value >= Number(rule.warning_high)) || (Number.isFinite(Number(rule.warning_low)) && value <= Number(rule.warning_low))) return { key: "warning", label: "Da controllare" };
  return { key: "good", label: "Buona" };
}
