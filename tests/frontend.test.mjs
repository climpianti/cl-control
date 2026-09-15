import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FALLBACK_BOOTSTRAP,
  areaSectionForEntity,
  buildDesignTokens,
  classifyEntity,
  colorWheelSelection,
  createSliderGesture,
  classifyEnvironmentSensor,
  environmentStatus,
  classifyCover,
  classifyCustomerEntity,
  classifySecurityZone,
  classifySwitchModule,
  buildResponsiveNavigation,
  buildEnergyModel,
  deepMerge,
  escapeHtml,
  looksTechnicalName,
  selectMobileNavigation,
  unreachableNavigationItems,
  navigationSnapshot,
  pushNavigation,
  popNavigation,
  visibleAtExperience,
  emptyLayout,
  effectiveLayout,
  layoutDeviceContext,
  layoutCardCapabilities,
  layoutOverrides,
  lightTurnOnPayload,
  normalizeLayoutCard,
  reorderLayoutCards,
  resetLayoutCardDraft,
  responsiveSectionColumns,
  tileTypeForEntity,
} from "../custom_components/cl_control/frontend/cl-control-runtime.mjs";
import { buildUi3Styles, icon } from "../custom_components/cl_control/frontend/cl-control-ui3.mjs";

const merged = deepMerge({ a: { b: 1 }, keep: true }, { a: { c: 2 } });
assert.deepEqual(merged, { a: { b: 1, c: 2 }, keep: true });

const tokens = buildDesignTokens(FALLBACK_BOOTSTRAP, "default");
assert.equal(tokens["--cl-primary"], FALLBACK_BOOTSTRAP.branding.colors.primary);
assert.ok(tokens["--cl-radius-md"]);
assert.ok(tokens["--cl-font-label"]);
assert.ok(tokens["--cl-logo-size"]);
assert.ok(tokens["--cl-motion-flow"]);
assert.ok(tokens["--cl-size-bottom-nav"]);
assert.ok(tokens["--cl-size-dashboard-bottom-nav"]);
assert.ok(tokens["--cl-dashboard-content-max-width"]);
assert.ok(tokens["--cl-font-page"]);
assert.ok(tokens["--cl-focus-ring"]);
assert.ok(tokens["--cl-color-wheel"]);
assert.ok(tokens["--cl-color-picker-max"]);
assert.ok(tokens["--cl-layout-min-column"]);
assert.equal(areaSectionForEntity({ entity_id: "light.living" }), "lights");
assert.equal(areaSectionForEntity({ entity_id: "sensor.co2_living" }, { module: "environment" }), "environment");
assert.equal(areaSectionForEntity({ entity_id: "sensor.grid_power" }, { module: "energy" }), "energy");
assert.equal(tileTypeForEntity({ entity_id: "climate.living" }), "climate");
assert.equal(tileTypeForEntity({ entity_id: "light.living" }, { hasSlider: true }), "slider");
assert.equal(responsiveSectionColumns(390), 2);
assert.equal(responsiveSectionColumns(768), 3);
assert.equal(responsiveSectionColumns(1200), 4);
assert.equal(responsiveSectionColumns(390, "complex"), 1);

const generatedLayout = [
  { id: "home:status", type: "status" },
  { id: "home:module:lights", type: "module" },
  { id: "home:module:climate", type: "module" },
];
const inheritedLayout = emptyLayout();
inheritedLayout.base.home = {
  "home:module:lights": { order: 9, size: "l", show_secondary: false },
};
inheritedLayout.mobile.home = {
  "home:module:lights": { order: 1, size: "s" },
};
const mobileLayout = effectiveLayout(inheritedLayout, "mobile", "home", generatedLayout);
assert.equal(mobileLayout.find(card => card.id === "home:module:lights").size, "m");
assert.equal(mobileLayout.find(card => card.id === "home:module:lights").show_secondary, false);
assert.equal(effectiveLayout(inheritedLayout, "tablet", "home", generatedLayout).find(card => card.id === "home:module:lights").size, "l");
assert.equal(layoutDeviceContext(390), "mobile");
assert.equal(layoutDeviceContext(820), "tablet");
assert.equal(layoutDeviceContext(1200), "base");
assert.equal(layoutDeviceContext(1200, "wall"), "wall");
assert.deepEqual(reorderLayoutCards(generatedLayout, "home:module:climate", "home:status").map(card => card.id), ["home:module:climate", "home:status", "home:module:lights"]);
assert.equal(normalizeLayoutCard({ show_icon: false, show_title: false }).show_title, true);
assert.deepEqual(layoutCardCapabilities("light").sizes, ["s", "m", "l"]);
assert.deepEqual(layoutCardCapabilities("module", { view: "home" }).sizes, ["m", "l"]);
assert.deepEqual(layoutCardCapabilities("status", { view: "home" }).spans, [2]);
const automaticLights = effectiveLayout(emptyLayout(), "mobile", "lights", [
  { id: "lights:entity:light.nuova", type: "light" },
  { id: "lights:entity:switch.lampada", type: "switch" },
]);
for (const card of automaticLights) {
  assert.deepEqual({ size: card.size, span: card.span, shape: card.shape }, { size: "m", span: 1, shape: "compact" });
}
const responsiveLayout = emptyLayout();
responsiveLayout.base.lights = { "lights:entity:light.nuova": { type: "light", size: "l", span: 2, shape: "square", favorite: true } };
responsiveLayout.mobile.lights = { "lights:entity:light.nuova": { type: "light", size: "s", span: 1 } };
const responsiveCards = effectiveLayout(responsiveLayout, "mobile", "lights", [{ id: "lights:entity:light.nuova", type: "light" }], { includeHidden: true });
assert.deepEqual({ size: responsiveCards[0].size, span: responsiveCards[0].span, shape: responsiveCards[0].shape }, { size: "s", span: 1, shape: "square" }, "saved responsive properties remain intact for visual fallback");
const resetResponsive = resetLayoutCardDraft(responsiveCards, responsiveLayout, "mobile", "lights", [{ id: "lights:entity:light.nuova", type: "light", favorite: true }], "lights:entity:light.nuova");
assert.deepEqual({ size: resetResponsive[0].size, span: resetResponsive[0].span, shape: resetResponsive[0].shape, favorite: resetResponsive[0].favorite }, { size: "l", span: 2, shape: "square", favorite: true }, "card reset removes only current-context graphics and inherits Base");
const resetBase = resetLayoutCardDraft([responsiveCards[0]], responsiveLayout, "base", "lights", [{ id: "lights:entity:light.nuova", type: "light", favorite: true }], "lights:entity:light.nuova");
assert.deepEqual({ size: resetBase[0].size, span: resetBase[0].span, shape: resetBase[0].shape, favorite: resetBase[0].favorite }, { size: "m", span: 1, shape: "compact", favorite: true }, "Base reset returns to automatic Lights layout without losing favorite");
const safeHomeStatus = normalizeLayoutCard({ size: "s", span: 4, shape: "square", show_state: false }, "status", { id: "home:status", view: "home" });
assert.deepEqual({ size: safeHomeStatus.size, span: safeHomeStatus.span, shape: safeHomeStatus.shape, show_state: safeHomeStatus.show_state }, { size: "l", span: 2, shape: "rectangle", show_state: true });
const safeHomeModule = normalizeLayoutCard({ size: "s", span: 4, shape: "square", show_state: false }, "module", { id: "home:module:lights", view: "home" });
assert.deepEqual({ size: safeHomeModule.size, span: safeHomeModule.span, shape: safeHomeModule.shape, show_state: safeHomeModule.show_state }, { size: "m", span: 1, shape: "rectangle", show_state: true });
const homeModuleIds = ["lights", "covers", "climate", "energy", "security", "cameras", "environment", "support"];
for (const count of [1, 3, 5, 8]) {
  const cards = [{ id: "home:status", type: "status" }, ...homeModuleIds.slice(0, count).map(id => ({ id: `home:module:${id}`, type: id === "support" ? "assistance" : "module" }))];
  const automatic = effectiveLayout(emptyLayout(), "mobile", "home", cards);
  assert.equal(automatic[0].size, "l");
  assert.equal(automatic[0].span, 2);
  for (const card of automatic.slice(1)) {
    assert.ok(["m", "l"].includes(card.size));
    assert.ok([1, 2].includes(card.span));
    assert.ok(!["square"].includes(card.shape));
    assert.equal(card.show_state, true);
  }
}
const incompatibleHome = emptyLayout();
incompatibleHome.base.home = { "home:module:energy": { size: "s", span: 4, shape: "square", show_state: false } };
const recoveredHome = effectiveLayout(incompatibleHome, "base", "home", [{ id: "home:module:energy", type: "module", order: 0 }])[0];
assert.deepEqual({ size: recoveredHome.size, span: recoveredHome.span, shape: recoveredHome.shape, show_state: recoveredHome.show_state }, { size: "m", span: 1, shape: "rectangle", show_state: true });
assert.deepEqual(layoutOverrides([recoveredHome], effectiveLayout(emptyLayout(), "base", "home", [{ id: "home:module:energy", type: "module", order: 0 }])), [], "safe fallback must not become a permanent override");
assert.equal(normalizeLayoutCard({ size: "xl", shape: "wide" }, "light").size, "s");
assert.equal(normalizeLayoutCard({ size: "l", visible: false }, "light").size, "l");
const hiddenLayout = emptyLayout();
hiddenLayout.base.lights = { "lights:entity:light.cucina": { type: "light", visible: false } };
const hiddenGenerated = [{ id: "lights:entity:light.cucina", type: "light" }];
assert.equal(effectiveLayout(hiddenLayout, "base", "lights", hiddenGenerated).length, 0);
assert.equal(effectiveLayout(hiddenLayout, "base", "lights", hiddenGenerated, { includeHidden: true })[0].visible, false);
const mobileOverrides = layoutOverrides(mobileLayout, effectiveLayout(inheritedLayout, "base", "home", generatedLayout));
assert.deepEqual(mobileOverrides.find(card => card.id === "home:module:lights"), { id: "home:module:lights", type: "module", order: 1, size: "m" });
assert.equal(normalizeLayoutCard({ favorite: true }).favorite, true);

const slider = createSliderGesture({ threshold: 10 });
slider.start(1, 20, 20, 40);
assert.equal(slider.move(1, 24, 36, 60).mode, "vertical");
assert.equal(slider.end(1).commit, false);
slider.start(2, 20, 20, 40);
assert.equal(slider.move(2, 35, 23, 60).mode, "horizontal");
assert.deepEqual(slider.end(2), { mode: "horizontal", value: 60, commit: true });
slider.start(3, 20, 20, 40);
assert.equal(slider.end(3).commit, false, "track tap must not commit");
slider.start(4, 20, 20, 40);
assert.equal(slider.cancel(4).commit, false, "pointercancel must not commit");

const co2 = classifyEnvironmentSensor("sensor.co2_salone", { device_class: "carbon_dioxide", unit_of_measurement: "ppm" });
assert.equal(co2.module, "environment");
assert.equal(co2.customer_facing, true);
assert.equal(classifyEnvironmentSensor("sensor.home_power", { device_class: "power", unit_of_measurement: "W" }).environment_candidate, false);
const uncertainAir = classifyEnvironmentSensor("sensor.qualita_aria", { friendly_name: "Qualità aria" }, {}, { threshold: 0.9 });
assert.equal(uncertainAir.needs_review, true);
assert.equal(uncertainAir.customer_facing, false);
assert.equal(classifyEnvironmentSensor("sensor.generic", {}, {}, { module: "environment", subtype: "radon" }).classification_confidence, 1);
for (const [id,deviceClass,type] of [["sensor.umidita","humidity","humidity"],["sensor.pm25","pm25","pm25"],["sensor.temperatura","temperature","temperature"]]) assert.equal(classifyEnvironmentSensor(id,{device_class:deviceClass}).type,type);
assert.equal(environmentStatus("co2", 800, { co2: { warning_high: 1000, high: 1500 } }).key, "good");
assert.equal(environmentStatus("co2", 1200, { co2: { warning_high: 1000, high: 1500 } }).key, "warning");
assert.equal(environmentStatus("co2", 1600, { co2: { warning_high: 1000, high: 1500 } }).key, "high");

const installerEntity = classifyEntity(
  "sensor.integration_diagnostics",
  {},
  {
    classification_confidence_threshold: 0.75,
    experience_rules: { installer_patterns: ["diagnostic"] },
  },
);
assert.equal(installerEntity.recommended_level, "installer");
assert.equal(installerEntity.needs_review, false);

const uncertain = classifyEntity("sensor.unknown", {}, {
  classification_confidence_threshold: 0.75,
  experience_rules: { pro_domains: ["sensor"] },
});
assert.equal(uncertain.recommended_level, "pro");
assert.equal(uncertain.needs_review, true);

assert.equal(visibleAtExperience("essential", "standard"), true);
assert.equal(visibleAtExperience("pro", "standard"), false);
assert.equal(visibleAtExperience("installer", "pro"), false);
assert.equal(visibleAtExperience("installer", "essential", true), true);
assert.equal(escapeHtml(`<script token="x">`), "&lt;script token=&quot;x&quot;&gt;");

assert.equal(looksTechnicalName("Shelly Plus 1PM 84cca8ff1200"), true);
assert.equal(looksTechnicalName("Lampada ingresso"), false);
const semanticLight = classifySwitchModule("switch.ingresso", { friendly_name: "Lampada ingresso" });
assert.equal(semanticLight.module, "lights");
assert.equal(semanticLight.customer_facing, true);
const genericSwitch = classifySwitchModule("switch.relay_0", { friendly_name: "Shelly relay 0" });
assert.equal(genericSwitch.module, "unassigned");
assert.equal(genericSwitch.needs_review, true);
assert.equal(genericSwitch.customer_facing, false);
const technicalPowerLight = classifyCustomerEntity(
  "light.cl_power_control_status",
  { friendly_name: "CL Power Control" },
  { platform: "cl_power_control", original_name: "Controller status" },
);
assert.equal(technicalPowerLight.customer_facing, false);
assert.equal(technicalPowerLight.classification_reason, "integration_internal_entity");
assert.equal(classifySwitchModule("light.cl_power_control_status", {}, { platform: "cl_power_control" }).customer_facing, false);
const clPowerControlFleet = Array.from({ length: 137 }, (_, index) => classifyCustomerEntity(`light.cl_power_control_${index + 1}`, { friendly_name: `CL Power Control ${index + 1}` }, { platform: "cl_power_control", entity_category: "diagnostic" }));
assert.equal(clPowerControlFleet.filter(result => !result.customer_facing).length, 137, "all CL Power Control technical entities remain excluded from Customer UI");
assert.equal(classifyCustomerEntity("light.cucina", { friendly_name: "Cucina" }, { platform: "hue" }).customer_facing, true);
assert.equal(classifyCustomerEntity("switch.calibrazione", {}, { platform: "shelly", entity_category: "config" }).customer_facing, false);
assert.equal(classifyCustomerEntity("sensor.segnale", {}, { platform: "demo", disabled_by: "integration" }).customer_facing, false);
const navItems = [["home"], ["lights"], ["climate"], ["energy"], ["support"], ["more"]];
assert.deepEqual(selectMobileNavigation(navItems, { isAdmin: true }), ["home", "lights", "climate", "energy", "more"]);
assert.deepEqual(selectMobileNavigation(navItems, { isAdmin: false }), ["home", "lights", "climate", "energy", "support"]);
assert.deepEqual(buildResponsiveNavigation(navItems), { primary: ["home", "lights", "climate", "energy", "overflow"], overflow: ["support", "more"] });
const fullNavigation = [["home"], ["lights"], ["covers"], ["climate"], ["energy"], ["security"], ["cameras"], ["support"], ["more"]];
const responsiveNavigation = buildResponsiveNavigation(fullNavigation);
assert.equal(responsiveNavigation.primary.length, 5);
assert.deepEqual(unreachableNavigationItems(fullNavigation, responsiveNavigation), []);
for (const required of ["energy", "security", "cameras", "support", "more"]) {
  assert.ok(responsiveNavigation.primary.includes(required) || responsiveNavigation.overflow.includes(required));
}
const homeNav = navigationSnapshot();
const areaNav = navigationSnapshot("area", "Cucina");
const lightsInArea = navigationSnapshot("lights", "Cucina", "Cucina");
let navigation = pushNavigation([], homeNav, areaNav);
navigation = pushNavigation(navigation.stack, navigation.current, lightsInArea);
assert.deepEqual(navigation.stack, [homeNav, areaNav]);
navigation = popNavigation(navigation.stack);
assert.deepEqual(navigation.current, areaNav, "back from an Area module must return to that Area");
navigation = popNavigation(navigation.stack);
assert.deepEqual(navigation.current, homeNav, "back from an Area must return Home");

const energyState = (entity_id, state, unit, friendly_name, device_class = unit === "%" ? "battery" : "power") => ({ entity_id, state: String(state), attributes: { unit_of_measurement: unit, friendly_name, device_class } });
const solar = energyState("sensor.pv_power", 3200, "W", "Produzione fotovoltaica");
const solarManual = energyState("sensor.inverter_output", 2800, "W", "Uscita inverter");
const homePower = energyState("sensor.house_load", 1800, "W", "Consumo casa");
const grid = energyState("sensor.grid_power", 400, "W", "Potenza rete");
const batteryPower = energyState("sensor.battery_power", 650, "W", "Potenza batteria");
const batterySoc = energyState("sensor.battery_soc", 78, "%", "SOC batteria");
assert.equal(buildEnergyModel().has_data, false, "no energy sensor produces one compact empty state");
assert.deepEqual(buildEnergyModel({ [solar.entity_id]: solar }, {}, [solar]).nodes.map(node => node.id), ["solar"]);
assert.deepEqual(buildEnergyModel(Object.fromEntries([solar, homePower].map(entity => [entity.entity_id, entity])), {}, [solar, homePower]).nodes.map(node => node.id), ["solar", "home"]);
assert.deepEqual(buildEnergyModel(Object.fromEntries([grid, homePower].map(entity => [entity.entity_id, entity])), {}, [grid, homePower]).nodes.map(node => node.id), ["home", "grid"]);
assert.deepEqual(buildEnergyModel(Object.fromEntries([solar, grid, homePower].map(entity => [entity.entity_id, entity])), {}, [solar, grid, homePower]).nodes.map(node => node.id), ["solar", "home", "grid"]);
const completeEnergy = buildEnergyModel(Object.fromEntries([solar, grid, homePower, batteryPower, batterySoc].map(entity => [entity.entity_id, entity])), {}, [solar, grid, homePower, batteryPower, batterySoc]);
assert.deepEqual(completeEnergy.nodes.map(node => node.id), ["solar", "home", "grid", "battery"]);
assert.equal(completeEnergy.roles.battery.entity_id, batterySoc.entity_id, "SOC remains usable without requiring battery power");
assert.ok(completeEnergy.flows.some(flow => flow.from === "battery" && flow.to === "home"), "positive battery power is represented as discharge to the home");
const chargingBattery = { ...batteryPower, state: "-650" };
const solarCharging = buildEnergyModel(Object.fromEntries([solar, homePower, chargingBattery].map(entity => [entity.entity_id, entity])), {}, [solar, homePower, chargingBattery]);
assert.ok(solarCharging.flows.some(flow => flow.from === "solar" && flow.to === "battery"), "a single valid charging source determines the battery flow");
const socOnly = buildEnergyModel({ [batterySoc.entity_id]: batterySoc }, {}, [batterySoc]);
assert.deepEqual(socOnly.nodes.map(node => node.id), ["battery"]);
const unavailableSolar = { ...solar, state: "unavailable" };
assert.equal(buildEnergyModel({ [solar.entity_id]: unavailableSolar }, {}, [unavailableSolar]).has_data, false);
const manualEnergy = buildEnergyModel({ [solar.entity_id]: solar, [solarManual.entity_id]: solarManual }, { solar: solarManual.entity_id }, [solar]);
assert.equal(manualEnergy.roles.solar.entity_id, solarManual.entity_id, "Installer mapping must override automatic discovery");
assert.equal(manualEnergy.roles.solar.source, "manual");
assert.equal(buildEnergyModel({ [solar.entity_id]: solar }, { solar: "__none__" }, [solar]).roles.solar, undefined, "explicit None disables discovery");
assert.equal(buildEnergyModel({ [solar.entity_id]: solar }, {}, [solar]).roles.solar.source, "auto");
assert.deepEqual(classifyCover("cover.finestra", { device_class: "window" }), { type: "window", label: "Finestra", confidence: 0.96, entity_id: "cover.finestra" });
const riscoZone = classifySecurityZone("binary_sensor.bar_serranda", {}, { platform: "risco", original_device_class: "motion", manufacturer: "Risco", identifiers: ["risco", "zone_32"] });
assert.equal(riscoZone.module, "security");
assert.equal(riscoZone.type, "motion");
assert.equal(riscoZone.customer_facing, true);
assert.equal(riscoZone.classification_confidence, 0.98);
const linkedZone = classifySecurityZone("binary_sensor.contatto_32", {}, { original_device_class: "opening", linked_to_alarm_panel: true });
assert.equal(linkedZone.classification_reason, "linked_to_alarm_panel");
assert.equal(linkedZone.customer_facing, true);
const uncertainZone = classifySecurityZone("binary_sensor.movimento_generico", { device_class: "motion" });
assert.equal(uncertainZone.module, "security");
assert.equal(uncertainZone.customer_facing, false);
assert.equal(uncertainZone.needs_review, true);
const unrelatedBinary = classifySecurityZone("binary_sensor.router_online", { device_class: "connectivity" });
assert.equal(unrelatedBinary.module, "unassigned");
assert.equal(unrelatedBinary.security_candidate, false);

assert.match(icon("home"), /^<svg/);
const ui3Styles = buildUi3Styles(FALLBACK_BOOTSTRAP.branding);
assert.match(ui3Styles, /safe-area-inset-bottom/);
assert.match(ui3Styles, /:host\(\[dashboard-context\]\) \.nav\{display:none!important\}/);
assert.match(ui3Styles, /--cl-size-dashboard-bottom-nav/);
assert.match(ui3Styles, /prefers-reduced-motion/);
assert.match(ui3Styles, /@media\(min-width:768px\)/);
assert.match(ui3Styles, /@media\(min-width:1200px\)/);
assert.match(ui3Styles, /\.clToggle/);
assert.match(ui3Styles, /clToggleLoading/);

const panelSource = readFileSync(new URL("../custom_components/cl_control/frontend/cl-control-panel.js", import.meta.url), "utf8");
const strategySource = readFileSync(new URL("../custom_components/cl_control/frontend/cl-control-dashboard-strategy.mjs", import.meta.url), "utf8");
assert.match(strategySource, /ll-strategy-dashboard-cl-control/);
assert.match(strategySource, /window\.customStrategies/);
assert.match(strategySource, /dashboard-context/);
assert.match(panelSource, /id="page-area"/);
assert.match(panelSource, /data-home-area/);
assert.match(panelSource, /data-area-section/);
assert.match(panelSource, /id="page-media"/);
assert.doesNotMatch(panelSource, /data-reorder-mode/);
assert.match(panelSource, /data-update-summary/);
assert.match(panelSource, /hass-more-info/);
const brandingSource = readFileSync(new URL("../config/branding.yaml", import.meta.url), "utf8");
assert.doesNotMatch(panelSource, /\b(?:prompt|alert|confirm)\s*\(/);
assert.doesNotMatch(panelSource, /Migrazione da|migrateLegacy|_legacyConfig/);
assert.doesNotMatch(panelSource, /Home Control/);
assert.match(panelSource, /data-light-filter="favorites"/);
assert.match(panelSource, /dialogLayer/);
assert.match(panelSource, /role="switch"/);
assert.match(panelSource, /Nome non configurato/);
assert.match(panelSource, /data-review-filter/);
assert.match(panelSource, /Configura dispositivo/);
assert.match(panelSource, /Apri Home Assistant/);
assert.match(panelSource, /class="brand brandHome"/);
assert.match(panelSource, /new URL\('\/',window\.location\.origin\)/);
assert.match(panelSource, /aria-label="Apri Home Assistant"/);
assert.match(panelSource, /id="page-overflow"/);
assert.match(panelSource, /p==='overflow'/);
assert.doesNotMatch(panelSource, /type="color"/);
assert.doesNotMatch(panelSource, /history\.back/);
assert.doesNotMatch(panelSource, /<select[^>]+name="(?:area|module|type|subtype|level)"/);
assert.match(panelSource, /Luci/);
assert.match(panelSource, /Aperture/);
assert.match(panelSource, /Assistenza/);
assert.match(panelSource, /cl_control\/layout\/set/);
assert.match(panelSource, /cl_control\/layout\/reset/);
assert.match(panelSource, /data-layout-drag/);
assert.match(panelSource, /data-layout-reset/);
assert.match(panelSource, /pointerdown/);
assert.match(panelSource, /Modifiche non salvate/);
assert.match(panelSource, /Preview cliente/);
assert.match(panelSource, /Stai modificando il layout/);
assert.match(panelSource, /bindIntentionalSlider/);
assert.match(panelSource, /Ambiente e qualità aria/);
assert.match(ui3Styles, /layoutDragHandle\{touch-action:none/);
assert.match(ui3Styles, /homeLayoutGrid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(ui3Styles, /layout-preview-mobile|layoutPreview/);
assert.match(ui3Styles, /#page-lights \.layoutCard\{grid-column:1\/-1!important;aspect-ratio:auto/);
assert.match(ui3Styles, /\.layoutEditing \.layoutCard\{outline:1px dashed/);
assert.doesNotMatch(ui3Styles, /(?<!layoutEditing )\.layoutCard\{outline:1px dashed/);
assert.match(panelSource, /data-light-card/);
assert.doesNotMatch(panelSource, /data-light-more/);
assert.match(panelSource, /Ripristinare il layout/);
assert.match(panelSource, /Nomi, aree, preferiti e configurazioni dei dispositivi non verranno modificati/);

assert.doesNotMatch(panelSource, /CL Impianti/);
assert.doesNotMatch(panelSource, /CL Control/);
for (const theme of ["auto", "light", "dark", "cl_blue", "night", "contrast"]) {
  assert.match(brandingSource, new RegExp('id: "' + theme + '"'));
}
assert.match(brandingSource, /color_picker:/);

globalThis.HTMLElement = class {};
let PanelClass;
globalThis.customElements = {
  get() { return false; },
  define(_name, constructor) { PanelClass = constructor; },
};
await import("../custom_components/cl_control/frontend/cl-control-panel.js");
const moduleChoice = PanelClass.prototype._choiceField.call(
  { _esc: String },
  "module",
  "Modulo",
  [{ value: "auto", label: "Auto", icon: "more" }, { value: "lights", label: "Luci", icon: "lights" }],
  "auto",
);
assert.match(moduleChoice, /name="module"/);
assert.match(moduleChoice, />Luci</);
assert.doesNotMatch(moduleChoice, /\$\{/);

assert.doesNotMatch(panelSource, /\.mjs\?v=/);
assert.match(panelSource, /this\._bootstrap\?\.version/);

const wheelRect = { left: 0, top: 0, width: 200, height: 200 };
assert.equal(colorWheelSelection(100, 10, wheelRect).hue, 0);
assert.equal(colorWheelSelection(178, 145, wheelRect).hue, 120);
assert.equal(colorWheelSelection(22, 145, wheelRect).hue, 240);
assert.equal(colorWheelSelection(100, 100, wheelRect), null);
assert.equal(colorWheelSelection(100, -40, wheelRect), null);
assert.equal(colorWheelSelection(240, 100, wheelRect, { allowOutside: true }).hue, 90);
assert.deepEqual(lightTurnOnPayload("light.rgb", { supported_color_modes: ["rgb"] }, { mode: "color", rgb: [255, 0, 0], brightness: 128 }), { entity_id: "light.rgb", brightness: 128, rgb_color: [255, 0, 0] });
assert.deepEqual(lightTurnOnPayload("light.rgbw", { supported_color_modes: ["rgbw"] }, { mode: "color", rgb: [0, 255, 0], brightness: 180 }), { entity_id: "light.rgbw", brightness: 180, rgbw_color: [0, 255, 0, 0] });
assert.deepEqual(lightTurnOnPayload("light.rgbww", { supported_color_modes: ["rgbww"] }, { mode: "white", brightness: 200 }), { entity_id: "light.rgbww", brightness: 200, rgbww_color: [0, 0, 0, 255, 255] });
assert.deepEqual(lightTurnOnPayload("light.rgbww", { supported_color_modes: ["rgbww"] }, { mode: "color", rgb: [20, 40, 60] }), { entity_id: "light.rgbww", rgbww_color: [20, 40, 60, 0, 0] });
assert.deepEqual(lightTurnOnPayload("light.white", { supported_color_modes: ["white"] }, { mode: "white" }), { entity_id: "light.white", white: 255 });
assert.deepEqual(lightTurnOnPayload("light.temp", { supported_color_modes: ["color_temp"], min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6000 }, { mode: "temperature", kelvin: 4100 }), { entity_id: "light.temp", color_temp_kelvin: 4100 });

const accordionPanel = Object.create(PanelClass.prototype);
accordionPanel._installerSectionIds = ['site','discovery','interface','experience','security','assistance','diagnostics','about'];
accordionPanel._installerOpenSections = new Set(['site','discovery']);
const makeSections = () => accordionPanel._installerSectionIds.map(() => ({
  open: false,
  dataset: {},
  listeners: {},
  addEventListener(type, listener) { this.listeners[type] = listener; },
}));
const firstSections = makeSections();
accordionPanel._restoreInstallerSections({ querySelectorAll: () => firstSections });
firstSections[5].open = true;
firstSections[5].listeners.toggle();
firstSections[6].open = true;
firstSections[6].listeners.toggle();
const refreshedSections = makeSections();
accordionPanel._captureInstallerSections({ querySelectorAll: () => firstSections });
accordionPanel._bootstrap = { refreshed: true };
accordionPanel._restoreInstallerSections({ querySelectorAll: () => refreshedSections });
assert.equal(refreshedSections[5].open, true, 'Assistenza must remain open after bootstrap refresh');
assert.equal(refreshedSections[6].open, true, 'Diagnostica must remain open after state refresh');
assert.equal(refreshedSections[2].open, false, 'Closed sections must remain closed');

const wheelHandlers = {};
const hueHandlers = {};
const marker = { style: {} };
const wheelAttributes = {};
const wheel = {
  captured: null,
  released: null,
  addEventListener(type, listener) { wheelHandlers[type] = listener; },
  getBoundingClientRect() { return wheelRect; },
  querySelector() { return marker; },
  setAttribute(name, value) { wheelAttributes[name] = value; },
  setPointerCapture(pointerId) { this.captured = pointerId; },
  releasePointerCapture(pointerId) { this.released = pointerId; },
};
const hueInput = { value: '', addEventListener(type, listener) { hueHandlers[type] = listener; } };
const previewValues = {};
const preview = { style: { setProperty(name, value) { previewValues[name] = value; } } };
const presetHandlers = {};
const preset = { dataset: { huePreset: '35' }, addEventListener(type, listener) { presetHandlers[type] = listener; } };
const colorLayer = {
  querySelector(selector) { return selector === '[data-color-wheel]' ? wheel : null; },
  querySelectorAll(selector) { return selector === '[data-hue-preset]' ? [preset] : []; },
};
const colorPanel = Object.create(PanelClass.prototype);
const colorEvents = { previews: [], commits: [], presets: [], cancels: [] };
colorPanel._bindColorWheelControls(colorLayer, hueInput, preview, 38, {
  onPreview: value => colorEvents.previews.push(value),
  onCommit: value => colorEvents.commits.push(value),
  onPreset: value => colorEvents.presets.push(value),
  onCancel: value => colorEvents.cancels.push(value),
});
const pointer = (clientX, clientY, pointerId = 1, pointerType = 'mouse') => ({ clientX, clientY, pointerId, pointerType, button: 0, prevented: false, preventDefault() { this.prevented = true; } });
let event = pointer(100, 10, 1, 'touch');
wheelHandlers.pointerdown(event);
assert.equal(hueInput.value, '0', 'touch tap must select red');
assert.equal(wheel.captured, 1);
event = pointer(178, 145, 1, 'touch');
wheelHandlers.pointermove(event);
assert.equal(hueInput.value, '120', 'touch drag must preview green');
assert.equal(previewValues['--preview-hue'], '120');
wheelHandlers.pointerup(event);
assert.equal(wheel.released, 1);
assert.deepEqual(colorEvents.commits, [120]);
event = pointer(22, 145, 2, 'mouse');
wheelHandlers.pointerdown(event);
assert.equal(hueInput.value, '240', 'mouse click must select blue');
assert.equal(wheelAttributes['aria-valuenow'], '240');
presetHandlers.click();
assert.equal(hueInput.value, '35', 'preset selection must remain functional');
assert.deepEqual(colorEvents.presets, [35]);
event = pointer(100, 10, 3, 'touch');
wheelHandlers.pointerdown(event);
event = pointer(178, 145, 3, 'touch');
wheelHandlers.pointermove(event);
wheelHandlers.pointercancel(event);
assert.equal(hueInput.value, '35', 'pointercancel must restore the pre-gesture hue');
assert.deepEqual(colorEvents.cancels, [35]);
assert.deepEqual(colorPanel._hsvRgb(0), [255, 0, 0]);
assert.deepEqual(colorPanel._hsvRgb(120), [0, 255, 0]);
assert.deepEqual(colorPanel._hsvRgb(240), [0, 0, 255]);
assert.match(panelSource, /lightTurnOnPayload\(id,a,/);
assert.match(panelSource, /setTimeout\(flushColor,180\)/);
assert.match(panelSource, /Modifiche inviate automaticamente/);
assert.doesNotMatch(panelSource, /Il dispositivo viene aggiornato solo con Applica/);
assert.match(panelSource, /data-light-mode-panel="temperature"/);
assert.match(ui3Styles, /touch-action:none/);
assert.match(ui3Styles, /lightControlHero/);
assert.match(ui3Styles, /layoutDragGhost/);
assert.match(ui3Styles, /layoutHiddenSecondary \.lightDetail/);
assert.match(ui3Styles, /max-height:calc\(100dvh/);

const riscoZoneIds = [
  "binary_sensor.bar_serranda",
  ...Array.from({ length: 5 }, (_, index) => `binary_sensor.risco_zona_${index + 2}`),
];
const riscoStates = Object.fromEntries([
  ["alarm_control_panel.casa", "disarmed", { friendly_name: "Allarme casa" }],
  ...riscoZoneIds.map((entityId, index) => [
    entityId,
    index === 0 ? "on" : "off",
    { friendly_name: index === 0 ? "Bar.Serranda" : `Zona Risco ${index + 1}` },
  ]),
  ["switch.bar_serranda_bypassato", "off", { friendly_name: "Bar.Serranda Bypassato" }],
  ["binary_sensor.router_online", "on", { friendly_name: "Router online", device_class: "connectivity" }],
].map(([entity_id, state, attributes]) => [entity_id, { entity_id, state, attributes }]));
const riscoPanel = Object.create(PanelClass.prototype);
riscoPanel._hass = { states: riscoStates, user: { is_admin: true } };
riscoPanel._bootstrap = {
  discovery: {
    classification_confidence_threshold: 0.75,
    experience_rules: {
      essential_domains: ["alarm_control_panel"],
      standard_domains: ["climate", "camera"],
      pro_domains: ["sensor", "binary_sensor", "select"],
    },
  },
  customer_ui: { experience: { default_level: "standard" }, labels: {} },
};
riscoPanel._config = {
  hidden: [],
  aliases: {},
  entity_modules: {},
  entity_subtypes: {},
  entity_levels: {},
  entity_visibility: Object.fromEntries(Object.keys(riscoStates).map(id => [id, true])),
  module_levels: {},
  experience_level: "standard",
};
riscoPanel._hidden = new Set();
riscoPanel._pendingCommands = new Map();
riscoPanel._entityRegistry = new Map(Object.keys(riscoStates).map(entity_id => {
  const isRisco = riscoZoneIds.includes(entity_id) || entity_id === "alarm_control_panel.casa" || entity_id === "switch.bar_serranda_bypassato";
  const deviceId = ["binary_sensor.bar_serranda", "switch.bar_serranda_bypassato"].includes(entity_id)
    ? "risco-bar-serranda"
    : entity_id.replaceAll(".", "-");
  return [entity_id, {
    entity_id,
    platform: isRisco ? "risco" : "demo",
    config_entry_id: isRisco ? "risco-entry" : "demo-entry",
    device_id: deviceId,
    original_device_class: riscoZoneIds.includes(entity_id) ? "motion" : "",
  }];
}));
riscoPanel._deviceRegistry = new Map(Object.keys(riscoStates).map(entity_id => [
  ["binary_sensor.bar_serranda", "switch.bar_serranda_bypassato"].includes(entity_id) ? "risco-bar-serranda" : entity_id.replaceAll(".", "-"),
  {
    id: ["binary_sensor.bar_serranda", "switch.bar_serranda_bypassato"].includes(entity_id) ? "risco-bar-serranda" : entity_id.replaceAll(".", "-"),
    name: riscoStates[entity_id].attributes.friendly_name,
    manufacturer: riscoZoneIds.includes(entity_id) || entity_id === "switch.bar_serranda_bypassato" ? "Risco" : "Demo",
  },
]));
riscoPanel._entityArea = new Map(riscoZoneIds.map((entityId, index) => [entityId, index < 3 ? "Cucina" : "Garage"]));
riscoPanel._areas = new Map();
riscoPanel._securityProvider = "generic";

const security = { zones: riscoPanel._securityZones() };
assert.equal(riscoPanel._entityClassification(riscoStates["binary_sensor.bar_serranda"]).recommended_level, "pro");
assert.equal(riscoPanel._visibleForExperience(riscoStates["binary_sensor.bar_serranda"], "security"), false);
assert.equal(security.zones.length, 6);
assert.equal(security.zones.some(zone => zone.entityId === "binary_sensor.router_online"), false);
assert.equal(security.zones.every(zone => zone.classification.module === "security"), true);
const realRiscoZone = security.zones.find(zone => zone.entityId === "binary_sensor.bar_serranda");
assert.equal(realRiscoZone.hasBypass, true);
assert.equal(realRiscoZone.bypassEntityId, "switch.bar_serranda_bypassato");
assert.equal(realRiscoZone.bypassed, false);

const securityRoot = {
  innerHTML: "",
  querySelectorAll() { return []; },
};
riscoPanel.shadowRoot = {
  getElementById(id) { return id === "page-security" ? securityRoot : null; },
};
riscoPanel._renderSecurity();
assert.ok(securityRoot.innerHTML.includes('<h2>Zone</h2><span class="pill">6</span>'));
assert.equal((securityRoot.innerHTML.match(/class="zoneRow/g) || []).length, 6);
assert.match(securityRoot.innerHTML, /Cucina/);
assert.match(securityRoot.innerHTML, /Garage/);
assert.doesNotMatch(securityRoot.innerHTML, /binary_sensor./);
assert.match(securityRoot.innerHTML, /data-security-zone="\d+"/);

let zoneDialog;
riscoPanel._openDialog = async options => {
  zoneDialog = options;
  return null;
};
await riscoPanel._openSecurityZone(realRiscoZone);
assert.equal(zoneDialog.title, "Bar.Serranda");
assert.match(zoneDialog.body, /Cucina/);
assert.match(zoneDialog.body, /Movimento/);
assert.match(zoneDialog.body, /Inclusa/);
assert.equal(zoneDialog.confirmLabel, "ESCLUDI ZONA");

const zoneWithoutBypass = security.zones.find(zone => zone.entityId === "binary_sensor.risco_zona_2");
await riscoPanel._openSecurityZone(zoneWithoutBypass);
assert.match(zoneDialog.body, /non espone un controllo di esclusione supportato/);
assert.equal(zoneDialog.confirmLabel, "CHIUDI");

const securityCalls = [];
const securityToasts = [];
let confirmationDialog;
riscoPanel._openDialog = async options => {
  confirmationDialog = options;
  return {};
};
riscoPanel._requestPin = async () => {
  throw new Error("Risco bypass must not request a PIN");
};
riscoPanel._renderSecurity = () => {};
riscoPanel._toast = (message, tone = "") => securityToasts.push({ message, tone });
riscoPanel._hass.callWS = async message => {
  securityCalls.push(message);
  return { success: true, state: message.excluded ? "on" : "off" };
};
await riscoPanel._setSecurityZoneBypass(realRiscoZone, true);
assert.equal(confirmationDialog.title, "Escludere Bar.Serranda?");
assert.equal(confirmationDialog.confirmLabel, "ESCLUDI");
assert.equal(confirmationDialog.cancelLabel, "ANNULLA");
assert.deepEqual(securityCalls, [{
  type: "cl_control/security/zone_exclusion",
  zone_entity_id: "binary_sensor.bar_serranda",
  entity_id: "switch.bar_serranda_bypassato",
  excluded: true,
}]);
assert.equal("pin" in securityCalls[0], false);
assert.equal(riscoPanel._pendingState("switch.bar_serranda_bypassato").targetState, "on");
let pendingZone = riscoPanel._securityZones().find(zone => zone.entityId === "binary_sensor.bar_serranda");
assert.equal(pendingZone.pending, true);
assert.equal(pendingZone.bypassed, false);
assert.equal(pendingZone.state, "Aggiornamento…");

riscoStates["switch.bar_serranda_bypassato"].state = "on";
riscoPanel._syncPendingCommands();
let excludedZone = riscoPanel._securityZones().find(zone => zone.entityId === "binary_sensor.bar_serranda");
assert.equal(excludedZone.pending, false);
assert.equal(excludedZone.bypassed, true);
assert.equal(excludedZone.state, "Esclusa");

securityCalls.length = 0;
await riscoPanel._setSecurityZoneBypass(excludedZone, false);
assert.equal(confirmationDialog.title, "Reincludere Bar.Serranda?");
assert.equal(confirmationDialog.confirmLabel, "REINCLUDI");
assert.deepEqual(securityCalls, [{
  type: "cl_control/security/zone_exclusion",
  zone_entity_id: "binary_sensor.bar_serranda",
  entity_id: "switch.bar_serranda_bypassato",
  excluded: false,
}]);
riscoStates["switch.bar_serranda_bypassato"].state = "off";
riscoPanel._syncPendingCommands();
const includedZone = riscoPanel._securityZones().find(zone => zone.entityId === "binary_sensor.bar_serranda");
assert.equal(includedZone.pending, false);
assert.equal(includedZone.bypassed, false);
assert.notEqual(includedZone.state, "Esclusa");

const technicalErrors = [];
const originalConsoleError = console.error;
console.error = (...args) => technicalErrors.push(args);
riscoPanel._hass.callWS = async () => {
  throw { code: "service_error", message: "Risco transport failed" };
};
await riscoPanel._setSecurityZoneBypass(includedZone, true);
console.error = originalConsoleError;
assert.equal(riscoPanel._pendingState("switch.bar_serranda_bypassato"), null);
assert.match(securityToasts.at(-1).message, /Home Assistant non ha eseguito/);
assert.match(JSON.stringify(technicalErrors), /Risco transport failed/);

console.log("frontend contracts: ok");
