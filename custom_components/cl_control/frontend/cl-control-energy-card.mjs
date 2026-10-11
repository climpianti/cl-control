const RANGE_OPTIONS = Object.freeze({
  '12h': {label: '12 h', hours: 12, period: '5minute'},
  '24h': {label: '24 h', hours: 24, period: '5minute'},
  '7d': {label: '7 giorni', days: 7, period: 'day'},
  '30d': {label: '30 giorni', days: 30, period: 'day'},
});

const LOAD_RANGE_OPTIONS = Object.freeze({
  now: {label: 'Adesso'},
  '24h': {label: '24 h', hours: 24, period: 'hour'},
  '7d': {label: '7 giorni', days: 7, period: 'day'},
  '30d': {label: '30 giorni', days: 30, period: 'day'},
});

const HISTORY_PERIOD_OPTIONS = Object.freeze({
  day: {label: 'Giorno'},
  month: {label: 'Mese'},
  year: {label: 'Anno'},
});

const LOAD_DETAIL_RANGE_OPTIONS = Object.freeze({
  '24h': {label: 'Giorno', days: 1, period: '5minute'},
  '7d': {label: '7 giorni', days: 7, period: 'day'},
  '30d': {label: '30 giorni', days: 30, period: 'day'},
});

const CHART_SERIES = Object.freeze([
  ['pv', 'FV', '--cl-solar'],
  ['home', 'Casa', '--cl-home'],
  ['import', 'Prelievo', '--cl-grid'],
  ['export', 'Immissione', '--cl-export'],
]);

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatPower(value) {
  const watts = number(value);
  if (watts === null) return '—';
  const abs = Math.abs(watts);
  if (abs >= 1000) return `${(abs / 1000).toLocaleString('it-IT', {maximumFractionDigits: abs >= 10000 ? 1 : 2})} kW`;
  return `${Math.round(abs).toLocaleString('it-IT')} W`;
}

function formatSignedPower(value) {
  const watts = number(value);
  if (watts === null) return '—';
  const sign = watts < 0 ? '−' : '';
  const abs = Math.abs(watts);
  if (abs >= 1000) return `${sign}${(abs / 1000).toLocaleString('it-IT', {maximumFractionDigits: abs >= 10000 ? 1 : 2})} kW`;
  return `${sign}${Math.round(abs).toLocaleString('it-IT')} W`;
}

function formatEnergy(value) {
  const kwh = number(value);
  if (kwh === null) return '—';
  return `${Math.max(0, kwh).toLocaleString('it-IT', {minimumFractionDigits: kwh < 10 ? 2 : 1, maximumFractionDigits: 2})} kWh`;
}

function formatPercent(value) {
  const percentage = number(value);
  return percentage === null ? '—' : `${Math.round(clamp(percentage, 0, 100))}%`;
}

function titleCase(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

class CLEnergyCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._hass = null;
    this._config = {energy: {}};
    this._range = '24h';
    this._barMetric = 'home';
    // Persist a user-selected chart point across Home Assistant state refreshes.
    // Without this, the realtime card re-rendered every few seconds and mobile
    // tooltips disappeared before the user could read them.
    this._chartSelection = null;
    this._loadChartSelection = null;
    this._loadRange = 'now';
    this._viewMode = 'realtime';
    this._loadRangeRawResult = null;
    this._statsCache = new Map();
    this._statsLoading = new Set();
    this._statsError = '';
    this._todayStats = null;
    this._todayRawResult = null;
    this._rangeStats = null;
    this._historyPeriod = 'day';
    this._historyAnchor = new Date();
    this._historyStats = null;
    this._historyRawResult = null;
    this._loadDetailId = '';
    this._loadDetailRange = '24h';
    this._loadDetailAnchor = new Date();
    this._loadDetailStats = null;
    this._loadDetailLoading = false;
    this._loadDetailRequestKey = '';
    this._loadDetailError = '';
    this._loadDetailCache = new Map();
    this.shadowRoot.innerHTML = `
      <style>
        :host{
          display:block;
          --cl-blue:#1488f4;
          --cl-blue-soft:color-mix(in srgb,var(--cl-blue) 10%,transparent);
          --cl-solar:#ffb300;
          --cl-home:#1488f4;
          --cl-grid:#58657a;
          --cl-export:#12b76a;
          --cl-battery:#12b76a;
          --cl-danger:var(--error-color,#d92d20);
          --cl-warning:#f79009;
          --cl-good:#12b76a;
          --cl-panel:var(--ha-card-background,var(--card-background-color,#fff));
          --cl-soft:color-mix(in srgb,var(--secondary-background-color,#f3f5f8) 86%,transparent);
          --cl-line:color-mix(in srgb,var(--divider-color,#e5e7eb) 86%,transparent);
          --cl-shadow:0 8px 28px rgba(23,43,77,.07);
        }
        *{box-sizing:border-box}
        ha-card{padding:0;background:transparent;box-shadow:none;border:0;color:var(--primary-text-color)}
        .stack{display:grid;gap:14px}
        .appBar,.card{background:var(--cl-panel);border:1px solid var(--cl-line);border-radius:22px;box-shadow:var(--cl-shadow)}
        .appBar{padding:13px 16px;display:flex;align-items:center;justify-content:space-between;gap:14px}
        .appTitle{display:flex;align-items:center;gap:11px;min-width:0}.appTitleIcon{width:42px;height:42px;border-radius:14px;background:var(--cl-blue-soft);display:grid;place-items:center;color:var(--cl-blue)}.appTitleIcon ha-icon{--mdc-icon-size:25px}.appTitle h2{margin:0;font-size:24px;letter-spacing:-.02em}.appTitle p{margin:2px 0 0;color:var(--secondary-text-color);font-size:12px}
        .viewTabs{display:grid;grid-template-columns:1fr 1fr;min-width:230px;padding:4px;border-radius:999px;background:var(--cl-soft)}.viewTab{border:0;background:transparent;color:var(--secondary-text-color);padding:9px 18px;border-radius:999px;font:inherit;font-size:13px;font-weight:800;cursor:pointer}.viewTab.active{background:var(--cl-blue);color:white;box-shadow:0 4px 10px rgba(20,136,244,.25)}
        .card{padding:18px}
        .sectionHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.sectionHead h2,.sectionHead h3{margin:0}.sectionHead h2{font-size:22px}.sectionHead h3{font-size:18px;letter-spacing:-.01em}.sectionHead p{margin:4px 0 0;color:var(--secondary-text-color);font-size:12px;line-height:1.35}
        .headIcon{display:flex;align-items:center;gap:9px}.headIcon ha-icon{color:var(--cl-blue);--mdc-icon-size:22px}
        .badge{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;background:var(--cl-soft);font-size:10px;font-weight:800;white-space:nowrap}.badge.good{background:color-mix(in srgb,var(--cl-good) 14%,transparent);color:var(--cl-good)}.badge.warn{background:color-mix(in srgb,var(--cl-warning) 15%,transparent);color:var(--cl-warning)}.badge.bad{background:color-mix(in srgb,var(--cl-danger) 14%,transparent);color:var(--cl-danger)}
        .flowCard{padding:18px 18px 16px;overflow:hidden}.flowMeta{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.onlineDot{width:9px;height:9px;border-radius:50%;background:var(--cl-good);box-shadow:0 0 0 4px color-mix(in srgb,var(--cl-good) 14%,transparent)}.provider{font-size:10px;color:var(--secondary-text-color)}
        .flowScene{position:relative;min-height:350px;max-width:820px;margin:2px auto 0}.flowSvg{position:absolute;inset:34px 8% 24px;width:84%;height:78%;overflow:visible;pointer-events:none}.flowPath{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;opacity:.82}.flowPath.active{stroke-dasharray:7 8}.flowPath.active.forward{animation:dashForward 1.15s linear infinite}.flowPath.active.reverse{animation:dashReverse 1.15s linear infinite}.flowPath.solar{stroke:var(--cl-blue)}.flowPath.battery{stroke:#15c49a}.flowPath.grid{stroke:#13b96f}.flowDot{fill:currentColor}.flowArrow{fill:currentColor}@keyframes dashForward{to{stroke-dashoffset:-30}}@keyframes dashReverse{to{stroke-dashoffset:30}}
        .energyNode{position:absolute;display:flex;flex-direction:column;align-items:center;text-align:center;z-index:2;min-width:112px}.energyNode .iconBox{width:64px;height:64px;border-radius:22px;display:grid;place-items:center;background:var(--cl-soft);box-shadow:0 6px 16px rgba(23,43,77,.06)}.energyNode ha-icon{--mdc-icon-size:40px}.energyNode .nodeName{font-size:12px;font-weight:800;margin-top:7px}.energyNode .nodeValue{font-size:22px;font-weight:900;letter-spacing:-.02em;margin-top:2px}.energyNode .nodeSub{font-size:11px;color:var(--secondary-text-color);margin-top:1px}.energyNode.pv{left:50%;top:0;transform:translateX(-50%)}.energyNode.pv ha-icon{color:var(--cl-solar)}.energyNode.home{left:50%;bottom:0;transform:translateX(-50%)}.energyNode.home .iconBox{background:var(--cl-blue-soft)}.energyNode.home ha-icon{color:var(--cl-home)}.energyNode.battery{left:1%;bottom:18px}.energyNode.battery ha-icon{color:var(--cl-battery)}.energyNode.grid{right:1%;bottom:18px}.energyNode.grid ha-icon{color:var(--cl-grid)}.energyNode.battery .nodeValue,.energyNode.grid.export .nodeValue{color:var(--cl-good)}
        .batteryBar{height:7px;width:68px;border-radius:999px;background:var(--cl-line);overflow:hidden;margin-top:6px}.batteryFill{height:100%;border-radius:inherit;background:var(--cl-battery)}
        .statusGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.statusTile{min-height:92px;border:1px solid var(--cl-line);border-radius:17px;background:var(--cl-panel);padding:13px;display:flex;gap:11px;align-items:flex-start}.statusIcon{width:38px;height:38px;flex:0 0 38px;border-radius:13px;background:var(--cl-soft);display:grid;place-items:center;color:var(--cl-blue)}.statusIcon ha-icon{--mdc-icon-size:22px}.statusTile.good .statusIcon{color:var(--cl-good);background:color-mix(in srgb,var(--cl-good) 10%,transparent)}.statusText{min-width:0}.statusLabel{font-size:11px;color:var(--secondary-text-color);font-weight:700}.statusValue{font-size:19px;font-weight:900;margin-top:4px;letter-spacing:-.015em}.statusNote{font-size:10px;color:var(--secondary-text-color);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.statePill{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;background:color-mix(in srgb,var(--cl-good) 14%,transparent);color:var(--cl-good);font-size:11px;font-weight:900;margin-top:5px}
        .summaryGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.metric{position:relative;padding:12px;border:1px solid var(--cl-line);border-radius:16px;background:var(--cl-panel);min-height:104px;overflow:hidden}.metricTop{display:flex;align-items:center;gap:8px}.metricIcon{width:34px;height:34px;border-radius:11px;background:var(--cl-soft);display:grid;place-items:center}.metricIcon ha-icon{--mdc-icon-size:20px}.metric .label{font-size:10px;color:var(--secondary-text-color);font-weight:750;line-height:1.2}.metric .big{font-size:18px;font-weight:900;margin-top:8px;letter-spacing:-.015em}.metric .note{font-size:10px;color:var(--secondary-text-color);margin-top:4px}.metric.solar .metricIcon{color:var(--cl-solar)}.metric.home .metricIcon{color:var(--cl-home)}.metric.grid .metricIcon{color:var(--cl-grid)}.metric.export .metricIcon,.metric.good .metricIcon{color:var(--cl-good)}.metric.battery .metricIcon{color:var(--cl-battery)}
        .rangeTabs{display:flex;gap:5px;flex-wrap:wrap;padding:4px;background:var(--cl-soft);border-radius:999px}.range{border:0;background:transparent;color:var(--secondary-text-color);border-radius:999px;padding:7px 11px;font:inherit;font-size:11px;font-weight:800;cursor:pointer}.range.active{background:var(--cl-blue);color:white;box-shadow:0 3px 8px rgba(20,136,244,.2)}
        .chartWrap{position:relative;min-height:300px;display:flex;align-items:center;justify-content:center}.chart{width:100%;height:auto;max-height:330px;touch-action:pan-y;user-select:none;-webkit-user-select:none}.gridLine{stroke:var(--cl-line);stroke-width:1}.axisText{fill:var(--secondary-text-color);font-size:10px}.chartPath{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.barRect{rx:3;ry:3;opacity:.88}.barMetricTabs{display:flex;gap:4px;flex-wrap:wrap;padding:4px;background:var(--cl-soft);border-radius:999px;margin:0 0 10px auto;width:max-content;max-width:100%}.barMetric{border:0;background:transparent;color:var(--secondary-text-color);border-radius:999px;padding:6px 10px;font:inherit;font-size:10px;font-weight:800;cursor:pointer}.barMetric.active{background:var(--cl-panel);color:var(--primary-text-color);box-shadow:0 2px 6px rgba(23,43,77,.09)}.chartCursor{position:absolute;top:18px;bottom:34px;width:1px;background:color-mix(in srgb,var(--primary-text-color) 30%,transparent);pointer-events:none;z-index:4}.chartCursor::after{content:'';position:absolute;top:0;left:50%;width:8px;height:8px;border-radius:50%;background:var(--cl-blue);transform:translate(-50%,-50%);box-shadow:0 0 0 4px color-mix(in srgb,var(--cl-blue) 12%,transparent)}.chartTooltip{position:absolute;z-index:5;top:8px;min-width:170px;max-width:220px;padding:9px 10px;border-radius:12px;background:color-mix(in srgb,var(--cl-panel) 96%,transparent);border:1px solid var(--cl-line);box-shadow:0 10px 26px rgba(23,43,77,.16);pointer-events:none;font-size:10px;line-height:1.35}.chartTooltip[hidden],.chartCursor[hidden]{display:none}.chartTooltipTitle{font-size:11px;font-weight:900;margin-bottom:5px}.chartTooltipRow{display:flex;justify-content:space-between;gap:12px;white-space:nowrap}.chartTooltipName{color:var(--secondary-text-color)}.chartTooltipValue{font-weight:850}.legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px}.legendItem{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--secondary-text-color)}.legendDot{width:9px;height:9px;border-radius:50%}
        .loadGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.loadCard{position:relative;min-height:136px;padding:12px;border:1px solid var(--cl-line);border-radius:16px;background:var(--cl-panel);display:flex;flex-direction:column}.loadCardHead{display:flex;gap:9px;align-items:center}.loadCardIcon{width:38px;height:38px;border-radius:12px;background:var(--cl-soft);display:grid;place-items:center;color:var(--cl-grid)}.loadCardIcon ha-icon{--mdc-icon-size:22px}.loadName{font-size:11px;font-weight:800;line-height:1.2;min-width:0}.loadValue{font-size:18px;font-weight:900;margin-top:10px}.loadSub{font-size:10px;color:var(--secondary-text-color);margin-top:2px}.loadBadge{display:inline-flex;align-items:center;gap:4px;align-self:flex-start;padding:4px 7px;border-radius:999px;margin-top:auto;font-size:9px;font-weight:900;background:var(--cl-soft);color:var(--secondary-text-color)}.loadBadge.pc{background:color-mix(in srgb,var(--cl-good) 12%,transparent);color:var(--cl-good)}.loadBadge.cl{background:var(--cl-blue-soft);color:var(--cl-blue)}.loadCommand{margin-top:7px;min-height:28px;border:1px solid var(--cl-line);border-radius:9px;padding:0 9px;background:var(--cl-panel);color:var(--primary-text-color);font-size:9px;font-weight:800;cursor:pointer}.loadCommand.on{color:var(--cl-good)}.loadCommand:disabled{opacity:.5;cursor:default}.suspended{color:var(--cl-warning)}
        .list{display:grid;gap:8px}.historyRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 11px;border:1px solid var(--cl-line);border-radius:12px;background:var(--cl-soft)}.historyRow .name{font-weight:700;font-size:12px}.historyRow small{display:block;color:var(--secondary-text-color);font-size:10px;margin-top:3px}.loadPower{font-weight:900;font-size:12px;text-align:right}.empty{padding:14px;border:1px dashed var(--cl-line);border-radius:12px;color:var(--secondary-text-color);font-size:12px}.error{padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--cl-warning) 10%,transparent);color:var(--secondary-text-color);font-size:12px;margin-bottom:10px}
        .historyOnly{display:grid;gap:14px}
        .historyTools{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.historyPeriodTabs{display:flex;gap:4px;padding:4px;border-radius:999px;background:var(--cl-soft)}.historyPeriod{border:0;background:transparent;color:var(--secondary-text-color);border-radius:999px;padding:7px 11px;font:inherit;font-size:10px;font-weight:850;cursor:pointer}.historyPeriod.active{background:var(--cl-blue);color:#fff;box-shadow:0 3px 8px rgba(20,136,244,.2)}.historyNav{display:flex;align-items:center;gap:5px}.historyNavButton,.historyNow{border:1px solid var(--cl-line);background:var(--cl-panel);color:var(--primary-text-color);border-radius:10px;min-height:32px;padding:5px 9px;font:inherit;font-size:10px;font-weight:800;cursor:pointer}.historyNavButton{width:34px;padding:0;display:grid;place-items:center}.historyNavButton ha-icon{--mdc-icon-size:18px}.historyNavButton:disabled{opacity:.35;cursor:default}.historyLabel{min-width:132px;text-align:center;font-size:11px;font-weight:900;padding:7px 9px;border-radius:10px;background:var(--cl-soft)}
        .loadBadge{border:0;cursor:pointer;min-height:28px;font-family:inherit}.loadBadge:hover{filter:brightness(.98)}.loadBadge:focus-visible,.loadCardIcon.detailLink:focus-visible{outline:2px solid var(--cl-blue);outline-offset:2px}.loadCardIcon.detailLink{border:0;cursor:pointer;font-family:inherit}.loadDetailHint{font-size:9px;color:var(--secondary-text-color);margin-top:5px}
        .loadDetailToolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:10px 0 2px}.loadDetailDateNav{display:flex;align-items:center;gap:5px}.loadDetailDateLabel{min-width:145px;text-align:center;font-size:10px;font-weight:900;padding:7px 9px;border-radius:10px;background:var(--cl-soft)}.loadDetailDateButton,.loadDetailToday{border:1px solid var(--cl-line);background:var(--cl-panel);color:var(--primary-text-color);border-radius:10px;min-height:32px;padding:5px 9px;font:inherit;font-size:10px;font-weight:800;cursor:pointer}.loadDetailDateButton{width:34px;padding:0;display:grid;place-items:center}.loadDetailDateButton ha-icon{--mdc-icon-size:18px}.loadDetailDateButton:disabled{opacity:.35;cursor:default}
        .modalBackdrop{position:fixed;inset:0;z-index:1000;background:rgba(8,19,38,.42);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(2px)}.loadModal{width:min(760px,100%);max-height:min(86vh,780px);overflow:auto;background:var(--cl-panel);border:1px solid var(--cl-line);border-radius:22px;box-shadow:0 24px 80px rgba(8,19,38,.28);padding:18px}.loadModalHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.loadModalTitle{display:flex;align-items:center;gap:10px}.loadModalTitle .loadCardIcon{flex:0 0 42px}.loadModalTitle h3{margin:0;font-size:19px}.loadModalTitle p{margin:3px 0 0;color:var(--secondary-text-color);font-size:10px}.modalClose{width:36px;height:36px;border:1px solid var(--cl-line);border-radius:12px;background:var(--cl-panel);color:var(--primary-text-color);display:grid;place-items:center;cursor:pointer}.modalClose ha-icon{--mdc-icon-size:20px}.loadDetailStats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}.loadDetailStat{padding:10px;border:1px solid var(--cl-line);border-radius:13px;background:var(--cl-soft)}.loadDetailStat .k{font-size:9px;color:var(--secondary-text-color);font-weight:750}.loadDetailStat .v{font-size:16px;font-weight:900;margin-top:4px}.loadChartWrap{position:relative;min-height:280px;margin-top:8px}.loadChart{width:100%;height:auto;max-height:320px;touch-action:pan-y;user-select:none;-webkit-user-select:none}.loadChartPath{fill:none;stroke:var(--cl-blue);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.loadChartCursor{position:absolute;top:15px;bottom:35px;width:1px;background:color-mix(in srgb,var(--primary-text-color) 30%,transparent);pointer-events:none;z-index:4}.loadChartTooltip{position:absolute;z-index:5;top:8px;padding:8px 10px;border-radius:11px;background:color-mix(in srgb,var(--cl-panel) 96%,transparent);border:1px solid var(--cl-line);box-shadow:0 8px 22px rgba(23,43,77,.15);pointer-events:none;font-size:10px;white-space:nowrap}.loadChartCursor[hidden],.loadChartTooltip[hidden]{display:none}.loadBarRect{opacity:.9}.loadBarRect:hover{opacity:1}
        @media(max-width:900px){.summaryGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.statusGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.loadGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:620px){.stack{gap:10px}.appBar,.card{border-radius:18px}.appBar{padding:10px 12px}.appTitleIcon{width:36px;height:36px;border-radius:12px}.appTitle h2{font-size:20px}.appTitle p{display:none}.viewTabs{min-width:175px}.viewTab{padding:8px 10px;font-size:11px}.card{padding:13px}.sectionHead{margin-bottom:10px}.sectionHead h3{font-size:16px}.sectionHead p{font-size:10px}.provider{display:none}.flowCard{padding:13px}.flowScene{min-height:290px}.energyNode{min-width:88px}.energyNode .iconBox{width:52px;height:52px;border-radius:18px}.energyNode ha-icon{--mdc-icon-size:32px}.energyNode .nodeName{font-size:10px}.energyNode .nodeValue{font-size:17px}.energyNode .nodeSub{font-size:9px}.energyNode.battery{left:-2%;bottom:15px}.energyNode.grid{right:-2%;bottom:15px}.flowSvg{inset:31px 6% 20px;width:88%;height:75%}.statusGrid,.summaryGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.statusTile{min-height:82px;padding:10px;gap:8px}.statusIcon{width:32px;height:32px;flex-basis:32px;border-radius:10px}.statusValue{font-size:16px}.statusNote{font-size:9px}.metric{min-height:92px;padding:10px}.metric .big{font-size:16px}.metric .note{font-size:9px}.rangeTabs{width:auto}.range{padding:6px 9px}.chartWrap{min-height:250px}.chart{max-height:285px}.chartTooltip{min-width:150px;max-width:190px;font-size:9px}.legend{gap:9px}.loadGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.loadCard{min-height:126px;padding:10px}.loadValue{font-size:16px}.historyTools{justify-content:flex-start}.historyLabel{min-width:112px}.historyOnly>.card .sectionHead{display:block}.historyOnly>.card .historyTools{margin-top:9px}.loadModal{padding:13px;border-radius:18px}.loadDetailStats{grid-template-columns:1fr 1fr}.loadDetailToolbar{align-items:flex-start}.loadDetailDateNav{width:100%;justify-content:flex-start}.loadDetailDateLabel{min-width:118px}.loadChartWrap{min-height:240px}}
        @media(max-width:390px){.appBar{align-items:flex-start;flex-direction:column}.viewTabs{width:100%}.flowScene{min-height:275px}.energyNode.battery{left:-5%}.energyNode.grid{right:-5%}.statusGrid,.summaryGrid,.loadGrid{grid-template-columns:1fr 1fr}}
      </style>
      <ha-card><div id="root" class="stack"></div></ha-card>
    `;
  }

  setConfig(config) {
    this._config = {title: config?.title || 'Energia', energy: config?.energy || {}};
    this._statsCache.clear();
    this._todayStats = null;
    this._todayRawResult = null;
    this._rangeStats = null;
    this._loadRangeRawResult = null;
    this._chartSelection = null;
    this._loadChartSelection = null;
    this._historyStats = null;
    this._historyRawResult = null;
    this._loadDetailId = '';
    this._loadDetailStats = null;
    this._loadDetailCache.clear();
    this._render();
  }

  _historyPassiveSignature(hass) {
    const historyId = (this._source('intervention_history')?.ids || []).filter(Boolean)[0];
    if (!historyId) return '';
    const state = hass?.states?.[historyId];
    if (!state) return '';
    const recent = Array.isArray(state.attributes?.ultimi_interventi) ? state.attributes.ultimi_interventi : [];
    const latest = recent[0] || {};
    const actions = Array.isArray(latest.actions) ? latest.actions.length : 0;
    return [
      state.state || '',
      state.last_changed || '',
      recent.length,
      latest.id || latest.started_at || '',
      latest.ended_at || '',
      actions,
    ].join('|');
  }

  set hass(value) {
    const firstUpdate = !this._hass;
    const previousHistorySignature = this._viewMode === 'history'
      ? this._historyPassiveSignature(this._hass)
      : '';
    this._hass = value;

    // Home Assistant can push state updates every few seconds (CL Power Control
    // normally refreshes very frequently). Replacing the whole History DOM on
    // every push caused scroll anchoring jumps and visible flicker. History is
    // statistics-driven, so keep its DOM stable and only repaint for a real
    // intervention-history change or explicit user/statistics actions.
    if (firstUpdate) {
      this._render();
      return;
    }
    if (this._loadDetailId) return;
    if (this._viewMode === 'history') {
      const nextHistorySignature = this._historyPassiveSignature(value);
      if (nextHistorySignature !== previousHistorySignature) this._render();
      return;
    }
    this._render();
  }

  getCardSize() { return 12; }

  _energy() { return this._config?.energy || {}; }
  _source(key) { return this._energy()?.sources?.[key] || {}; }
  _sourceIds(key) { return (this._source(key).ids || []).filter(Boolean); }

  _statIds(key) {
    const source = this._source(key);
    const valid = source?.metadata?.statistics_valid_ids;
    return (Array.isArray(valid) && valid.length ? valid : source?.ids || []).filter(Boolean);
  }

  _state(entityId) { return this._hass?.states?.[entityId]; }

  _metricValue(key) {
    const ids = this._sourceIds(key);
    const values = ids.map(id => number(this._state(id)?.state)).filter(value => value !== null);
    if (!values.length) return null;
    if (key === 'battery_soc') return values.reduce((a,b) => a+b, 0) / values.length;
    let total = values.reduce((a,b) => a+b, 0);
    if (this._source(key)?.metadata?.invert) total *= -1;
    return total;
  }

  _metricState(key) {
    const id = this._sourceIds(key)[0];
    return id ? String(this._state(id)?.state || '') : '';
  }

  _entityAvailable(key) {
    return this._sourceIds(key).some(id => {
      const state = this._state(id)?.state;
      return state !== undefined && !['unknown','unavailable',''].includes(String(state));
    });
  }

  _appHeaderMarkup() {
    const provider = this._energy()?.realtime_provider === 'cl_power_control' ? 'CL Power Control' : 'Home Assistant Energy';
    return `<div class="appBar"><div class="appTitle"><span class="appTitleIcon"><ha-icon icon="mdi:chart-histogram"></ha-icon></span><div><h2>Energia</h2><p>${esc(provider)} · dati live e storico Home Assistant</p></div></div><div class="viewTabs"><button type="button" class="viewTab ${this._viewMode === 'realtime' ? 'active' : ''}" data-view="realtime">Realtime</button><button type="button" class="viewTab ${this._viewMode === 'history' ? 'active' : ''}" data-view="history">Storico</button></div></div>`;
  }

  _statusTile(icon, label, value, note = '', options = {}) {
    const classes = ['statusTile', options.good ? 'good' : ''].filter(Boolean).join(' ');
    const valueMarkup = options.state ? `<span class="statePill"><ha-icon icon="mdi:check-circle"></ha-icon>${esc(value)}</span>` : `<div class="statusValue">${value}</div>`;
    return `<div class="${classes}"><div class="statusIcon"><ha-icon icon="${esc(icon)}"></ha-icon></div><div class="statusText"><div class="statusLabel">${esc(label)}</div>${valueMarkup}${note ? `<div class="statusNote">${esc(note)}</div>` : ''}</div></div>`;
  }

  _statusMarkup() {
    const energy = this._energy();
    const enabledState = this._metricState('power_control_status');
    const suspendedCount = Math.max(0, this._metricValue('suspended_count') || 0);
    const isOn = enabledState === 'on';
    const isOff = enabledState === 'off';
    const stateLabel = isOff ? 'Disattivato' : !isOn && enabledState ? 'Non disponibile' : suspendedCount > 0 ? 'Intervento' : 'Attivo';
    const surplus = this._metricValue('surplus_available');
    const limit = this._metricValue('grid_limit');
    const dynamic = this._metricValue('dynamic_limit');
    const headroom = this._metricValue('headroom');
    const suspendedPower = this._metricValue('suspended_power');
    if (!energy?.capabilities?.power_control) {
      return `<div class="statusGrid">${this._statusTile('mdi:leaf','Surplus disponibile',formatPower(surplus),'Dati Energy Control',{good:true})}</div>`;
    }
    return `<div class="statusGrid">
      ${this._statusTile('mdi:leaf','Surplus disponibile',formatPower(surplus),'Energia disponibile',{good:true})}
      ${this._statusTile('mdi:cog','Power Control',stateLabel,suspendedCount ? `${suspendedCount} carichi sospesi` : 'Sistema regolare',{good:!isOff,state:true})}
      ${this._statusTile('mdi:transmission-tower','Limite rete',formatPower(limit),'Soglia configurata')}
      ${this._statusTile('mdi:gauge','Limite dinamico',formatPower(dynamic),'Equivalente con contributo locale')}
      ${this._statusTile('mdi:chart-bar','Margine disponibile',formatPower(headroom),'Prima della soglia')}
      ${this._statusTile('mdi:format-list-bulleted','Carichi sospesi',String(Math.round(suspendedCount)),suspendedCount ? `${formatPower(suspendedPower)} sospesi` : 'Nessuno')}
    </div>`;
  }

  _todayMetric(label, value, kind, icon, cls, note = '') {
    const formatted = kind === 'percent' ? formatPercent(value) : formatEnergy(value);
    return `<div class="metric ${esc(cls || '')}"><div class="metricTop"><span class="metricIcon"><ha-icon icon="${esc(icon)}"></ha-icon></span><span class="label">${esc(label)}</span></div><div class="big">${formatted}</div>${note ? `<div class="note">${esc(note)}</div>` : ''}</div>`;
  }

  _flowMarkup() {
    const energy = this._energy();
    const pvRaw = this._metricValue('pv_power');
    const homeRaw = this._metricValue('home_power');
    const pv = pvRaw === null ? null : Math.max(0, pvRaw);
    const home = homeRaw === null ? null : Math.max(0, homeRaw);
    const grid = this._metricValue('grid_power');
    const battery = this._metricValue('battery_power');
    const soc = this._metricValue('battery_soc');
    const gridAbs = grid === null ? null : Math.abs(grid);
    const batteryAbs = battery === null ? null : Math.abs(battery);
    const deadband = 30;
    const gridImport = grid !== null && grid > deadband;
    const gridExport = grid !== null && grid < -deadband;
    const batteryDischarge = battery !== null && battery > deadband;
    const batteryCharge = battery !== null && battery < -deadband;
    const energyState = this._metricState('energy_control_status') || (energy?.power_control?.energy_control_detected ? 'Rilevato' : 'Non configurato');
    const statusGood = /attiv|rilevat|on/i.test(energyState) && !/disattiv/i.test(energyState);
    const provider = energy.realtime_provider === 'cl_power_control' ? `CL Power Control ${energy.power_control?.version ? `v${energy.power_control.version}` : ''}` : energy.realtime_provider === 'home_assistant_energy' ? 'Home Assistant Energy' : 'Sorgente non configurata';
    const batteryNode = this._sourceIds('battery_power').length || this._sourceIds('battery_soc').length;
    const socAvailable = soc !== null && this._entityAvailable('battery_soc');
    const batteryText = batteryCharge ? `Carica · ${formatPower(batteryAbs)}` : batteryDischarge ? `Scarica · ${formatPower(batteryAbs)}` : battery === null ? 'Dato non disponibile' : 'Standby';
    const gridText = gridImport ? 'In prelievo' : gridExport ? 'In immissione' : grid === null ? 'Dato non disponibile' : 'Standby';
    return `<div class="card flowCard">
      <div class="sectionHead"><div><div class="headIcon"><span class="onlineDot"></span><h3>${statusGood ? 'Sistema online' : 'Flusso energia'}</h3></div><p>Flusso energia in tempo reale</p></div><div class="flowMeta"><span class="badge ${statusGood ? 'good' : 'warn'}">${esc(energyState)}</span><span class="provider">${esc(provider)}</span></div></div>
      <div class="flowScene">
        <svg class="flowSvg" viewBox="0 0 700 300" preserveAspectRatio="none" aria-hidden="true">
          <path class="flowPath solar ${pv !== null && pv > deadband ? 'active forward' : ''}" d="M350 18 C350 78 350 125 350 178" />
          <path class="flowPath battery ${batteryCharge ? 'active forward' : batteryDischarge ? 'active reverse' : ''}" d="M350 200 C270 200 220 246 105 246" />
          <path class="flowPath grid ${gridExport ? 'active forward' : gridImport ? 'active reverse' : ''}" d="M350 200 C430 200 490 246 595 246" />
          ${pv !== null && pv > deadband ? '<circle cx="350" cy="136" r="5" fill="var(--cl-blue)" /><polygon points="350,198 340,181 360,181" fill="var(--cl-blue)" />' : ''}
          ${batteryCharge || batteryDischarge ? `<polygon points="${batteryCharge ? '110,246 124,238 124,254' : '220,246 206,238 206,254'}" fill="#15c49a" />` : ''}
          ${gridImport || gridExport ? `<polygon points="${gridExport ? '590,246 576,238 576,254' : '490,246 504,238 504,254'}" fill="#13b96f" />` : ''}
        </svg>
        <div class="energyNode pv"><span class="iconBox"><ha-icon icon="mdi:solar-panel-large"></ha-icon></span><span class="nodeName">Fotovoltaico</span><span class="nodeValue">${formatPower(pv)}</span><span class="nodeSub">Produzione</span></div>
        ${batteryNode ? `<div class="energyNode battery"><span class="iconBox"><ha-icon icon="mdi:battery-high"></ha-icon></span><span class="nodeName">Batteria</span><span class="nodeValue">${formatPower(batteryAbs)}</span><span class="nodeSub">${socAvailable ? `SOC ${formatPercent(soc)} · ${batteryText}` : batteryText}</span>${socAvailable ? `<div class="batteryBar"><div class="batteryFill" style="width:${clamp(soc,0,100)}%"></div></div>` : ''}</div>` : ''}
        <div class="energyNode home"><span class="iconBox"><ha-icon icon="mdi:home-lightning-bolt"></ha-icon></span><span class="nodeName">Casa</span><span class="nodeValue">${formatPower(home)}</span><span class="nodeSub">Consumo istantaneo</span></div>
        <div class="energyNode grid ${gridExport ? 'export' : ''}"><span class="iconBox"><ha-icon icon="mdi:transmission-tower"></ha-icon></span><span class="nodeName">Rete</span><span class="nodeValue">${formatPower(gridAbs)}</span><span class="nodeSub">${esc(gridText)}</span></div>
      </div>
    </div>`;
  }

  _todayMarkup() {
    const s = this._todayStats;
    const loading = this._statsLoading.has('today');
    const values = s || {};
    const statsAvailable = this._allStatisticIds().length > 0;
    const date = new Date().toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'short'});
    return `<div class="card">
      <div class="sectionHead"><div><div class="headIcon"><ha-icon icon="mdi:white-balance-sunny"></ha-icon><h3>Riepilogo di oggi</h3></div><p>${statsAvailable ? 'Statistiche energetiche Home Assistant' : 'Configura le statistiche energia per il riepilogo giornaliero'}</p></div><span class="badge">${loading ? 'AGGIORNAMENTO…' : esc(date)}</span></div>
      ${this._statsError ? `<div class="error">${esc(this._statsError)}</div>` : ''}
      <div class="summaryGrid">
        ${this._todayMetric('FV oggi',values.pv,'kwh','mdi:white-balance-sunny','solar','Produzione')}
        ${this._todayMetric('Consumo oggi',values.home,'kwh','mdi:home','home',values.homeDerived ? 'Bilancio energetico' : 'Casa')}
        ${this._todayMetric('Import oggi',values.import,'kwh','mdi:transmission-tower-import','grid','Da rete')}
        ${this._todayMetric('Export oggi',values.export,'kwh','mdi:transmission-tower-export','export','Verso rete')}
        ${this._todayMetric('Carica batt.',values.batteryCharge,'kwh','mdi:battery-arrow-up','battery','Energia caricata')}
        ${this._todayMetric('Scarica batt.',values.batteryDischarge,'kwh','mdi:battery-arrow-down','battery','Energia scaricata')}
        ${this._todayMetric('Autoconsumo',values.selfConsumption,'percent','mdi:chart-donut','good','FV usato in casa')}
        ${this._todayMetric('Autosufficienza',values.selfSufficiency,'percent','mdi:leaf','good','Copertura locale')}
      </div>
    </div>`;
  }

  _historyBounds() {
    const anchor = new Date(this._historyAnchor || new Date());
    let start, end, queryPeriod;
    if (this._historyPeriod === 'month') {
      start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1, 0, 0, 0, 0);
      queryPeriod = 'day';
    } else if (this._historyPeriod === 'year') {
      start = new Date(anchor.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(anchor.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
      queryPeriod = 'month';
    } else {
      start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 0, 0, 0, 0);
      end = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 1, 0, 0, 0, 0);
      queryPeriod = 'hour';
    }
    const now = new Date();
    if (end > now) end = now;
    return {start, end, queryPeriod};
  }

  _historyLabel() {
    const anchor = new Date(this._historyAnchor || new Date());
    if (this._historyPeriod === 'month') return anchor.toLocaleDateString('it-IT',{month:'long',year:'numeric'});
    if (this._historyPeriod === 'year') return String(anchor.getFullYear());
    return anchor.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  }

  _historyTitle() {
    if (this._historyPeriod === 'month') return 'Riepilogo del mese';
    if (this._historyPeriod === 'year') return 'Riepilogo dell’anno';
    return 'Riepilogo del giorno';
  }

  _historyCanNext() {
    const now = new Date();
    const anchor = new Date(this._historyAnchor || now);
    if (this._historyPeriod === 'year') return anchor.getFullYear() < now.getFullYear();
    if (this._historyPeriod === 'month') return anchor.getFullYear() < now.getFullYear() || (anchor.getFullYear() === now.getFullYear() && anchor.getMonth() < now.getMonth());
    const a = new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate()).getTime();
    const n = new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
    return a < n;
  }

  _shiftHistory(step) {
    const anchor = new Date(this._historyAnchor || new Date());
    if (this._historyPeriod === 'year') anchor.setFullYear(anchor.getFullYear() + step);
    else if (this._historyPeriod === 'month') anchor.setMonth(anchor.getMonth() + step, 1);
    else anchor.setDate(anchor.getDate() + step);
    const now = new Date();
    if (anchor > now) this._historyAnchor = now; else this._historyAnchor = anchor;
    this._historyStats = null;
    this._historyRawResult = null;
  }

  _historySummaryMarkup() {
    const values = this._historyStats || {};
    const loading = this._statsLoading.has('history-summary');
    const tabs = Object.entries(HISTORY_PERIOD_OPTIONS).map(([key,cfg]) => `<button type="button" class="historyPeriod ${key === this._historyPeriod ? 'active' : ''}" data-history-period="${key}">${esc(cfg.label)}</button>`).join('');
    const currentLabel = this._historyPeriod === 'year' ? 'Quest’anno' : this._historyPeriod === 'month' ? 'Questo mese' : 'Oggi';
    const controls = `<div class="historyTools"><div class="historyPeriodTabs">${tabs}</div><div class="historyNav"><button type="button" class="historyNavButton" data-history-shift="-1" aria-label="Periodo precedente"><ha-icon icon="mdi:chevron-left"></ha-icon></button><div class="historyLabel">${esc(this._historyLabel())}</div><button type="button" class="historyNavButton" data-history-shift="1" aria-label="Periodo successivo" ${this._historyCanNext() ? '' : 'disabled'}><ha-icon icon="mdi:chevron-right"></ha-icon></button><button type="button" class="historyNow" data-history-now>${esc(currentLabel)}</button></div></div>`;
    return `<div class="card">
      <div class="sectionHead"><div><div class="headIcon"><ha-icon icon="mdi:calendar-clock"></ha-icon><h3>${esc(this._historyTitle())}</h3></div><p>Statistiche energetiche Home Assistant del periodo selezionato.</p></div>${controls}</div>
      ${this._statsError ? `<div class="error">${esc(this._statsError)}</div>` : ''}
      ${loading ? '<div class="empty" style="margin-bottom:10px">Caricamento storico…</div>' : ''}
      <div class="summaryGrid">
        ${this._todayMetric('FV',values.pv,'kwh','mdi:white-balance-sunny','solar','Produzione')}
        ${this._todayMetric('Consumo',values.home,'kwh','mdi:home','home',values.homeDerived ? 'Bilancio energetico' : 'Casa')}
        ${this._todayMetric('Import',values.import,'kwh','mdi:transmission-tower-import','grid','Da rete')}
        ${this._todayMetric('Export',values.export,'kwh','mdi:transmission-tower-export','export','Verso rete')}
        ${this._todayMetric('Carica batt.',values.batteryCharge,'kwh','mdi:battery-arrow-up','battery','Energia caricata')}
        ${this._todayMetric('Scarica batt.',values.batteryDischarge,'kwh','mdi:battery-arrow-down','battery','Energia scaricata')}
        ${this._todayMetric('Autoconsumo',values.selfConsumption,'percent','mdi:chart-donut','good','FV usato in casa')}
        ${this._todayMetric('Autosufficienza',values.selfSufficiency,'percent','mdi:leaf','good','Copertura locale')}
      </div>
    </div>`;
  }

  _metricBox(label, value, kind, note) {
    const formatted = kind === 'percent' ? formatPercent(value) : kind === 'power' ? formatPower(value) : kind === 'signed-power' ? formatSignedPower(value) : kind === 'count' ? (number(value) === null ? '—' : Math.round(number(value)).toLocaleString('it-IT')) : formatEnergy(value);
    return `<div class="metric"><div class="label">${esc(label)}</div><div class="big">${formatted}</div><div class="note">${esc(note || '')}</div></div>`;
  }

  _powerControlMarkup() {
    const energy = this._energy();
    if (!energy?.capabilities?.power_control) return '';
    const enabledState = this._metricState('power_control_status');
    const suspendedCount = Math.max(0, this._metricValue('suspended_count') || 0);
    const isOff = enabledState === 'off';
    const isOn = enabledState === 'on';
    const stateLabel = isOff ? 'Disattivato' : !isOn && enabledState ? 'Non disponibile' : suspendedCount > 0 ? 'Intervento in corso' : 'Regolare';
    const dotClass = isOff || (!isOn && enabledState) ? 'bad' : suspendedCount > 0 ? 'warn' : '';
    const lastEvent = this._metricState('last_event');
    const controlPower = this._metricValue('control_power');
    const limit = this._metricValue('grid_limit');
    const dynamic = this._metricValue('dynamic_limit');
    const headroom = this._metricValue('headroom');
    const gridMargin = this._metricValue('grid_margin');
    const surplus = this._metricValue('surplus_available');
    const flexible = this._metricValue('flexible_available');
    const suspendedPower = this._metricValue('suspended_power');
    return `
      <div class="card">
        <div class="sectionHead"><div><h3>Power Control</h3><p>Stato del motore, limiti e disponibilità energetica.</p></div><span class="badge ${suspendedCount > 0 ? 'warn' : isOff || (!isOn && enabledState) ? 'bad' : 'good'}">${esc(stateLabel)}</span></div>
        <div class="pcGrid">
          <div class="pcState"><div><div class="stateTitle">${esc(stateLabel)}</div><div class="stateSub">${lastEvent ? esc(lastEvent) : 'Nessun intervento recente'}</div></div><span class="dot ${dotClass}"></span></div>
          ${this._metricBox('Potenza controllo', controlPower, 'signed-power', 'Valore usato dal motore')}
          ${this._metricBox('Limite rete', limit, 'power', 'Soglia configurata')}
          ${this._metricBox('Limite dinamico', dynamic, 'power', 'Equivalente con contributo locale')}
          ${this._metricBox('Margine disponibile', headroom, 'power', 'Prima della soglia')}
          ${this._metricBox('Margine contatore', gridMargin, 'power', 'Sul prelievo di rete')}
          ${this._metricBox('Surplus FV', surplus, 'power', 'Immissione disponibile')}
          ${this._metricBox('Disponibile flessibili', flexible, 'power', 'Dato backend Energy Control')}
          ${this._metricBox('Carichi sospesi', suspendedCount, 'count', suspendedCount ? `${formatPower(suspendedPower)} sospesi` : 'Nessuno')}
        </div>
      </div>`;
  }

  _chartMarkup() {
    const stats = this._rangeStats;
    const buttons = Object.entries(RANGE_OPTIONS).map(([key,cfg]) => `<button class="range ${key === this._range ? 'active' : ''}" data-range="${key}">${esc(cfg.label)}</button>`).join('');
    const isBarRange = this._range === '7d' || this._range === '30d';
    let content = '<div class="empty">Statistiche energetiche non disponibili per questo impianto.</div>';
    if (this._statsLoading.has(`range:${this._range}`)) content = '<div class="empty">Caricamento statistiche…</div>';
    else if (stats?.points?.length) content = isBarRange ? this._svgBarChart(stats.points) : this._svgChart(stats.points);

    const availableSeries = stats?.points?.length
      ? CHART_SERIES.filter(([key]) => stats.points.some(p => number(p[key]) !== null))
      : [];
    const barMetricKey = this._effectiveBarMetric(stats?.points || []);
    const metricTabs = this._range === '30d' && stats?.points?.length
      ? `<div class="barMetricTabs">${CHART_SERIES.filter(([key]) => availableSeries.some(([availableKey]) => availableKey === key)).map(([key,label]) => `<button type="button" class="barMetric ${key === barMetricKey ? 'active' : ''}" data-bar-metric="${key}">${esc(label === 'Casa' ? 'Consumo' : label)}</button>`).join('')}</div>`
      : '';
    const legendSeries = this._range === '30d'
      ? availableSeries.filter(([key]) => key === barMetricKey)
      : availableSeries;
    const description = this._range === '12h' || this._range === '24h'
      ? 'Dettaglio fino a 5 minuti nel periodo selezionato.'
      : this._range === '7d'
        ? 'Totali giornalieri: una barra per ogni giorno e metrica.'
        : 'Totali giornalieri: scegli la metrica e confronta gli ultimi 30 giorni.';
    return `
      <div class="card">
        <div class="sectionHead"><div><h3>Andamento energia</h3><p>${description}</p></div><div class="rangeTabs">${buttons}</div></div>
        ${metricTabs}
        <div class="chartWrap">${content}${stats?.points?.length ? '<div class="chartCursor" data-chart-cursor hidden></div><div class="chartTooltip" data-chart-tooltip hidden></div>' : ''}</div>
        ${stats?.points?.length ? `<div class="legend">${legendSeries.map(([key,label,css]) => `<span class="legendItem"><span class="legendDot" style="background:var(${css})"></span>${esc(label)}</span>`).join('')}</div>` : ''}
      </div>`;
  }

  _effectiveBarMetric(points = []) {
    if (points.some(p => number(p[this._barMetric]) !== null)) return this._barMetric;
    const fallback = CHART_SERIES.find(([key]) => points.some(p => number(p[key]) !== null));
    return fallback?.[0] || 'home';
  }

  _svgChart(points) {
    const width = 720, height = 240, left = 42, right = 14, top = 16, bottom = 34;
    const plotW = width-left-right, plotH = height-top-bottom;
    const maxValue = Math.max(0.1, ...points.flatMap(p => ['pv','home','import','export'].map(key => number(p[key]) || 0)));
    const timestamps = points.map(p => number(p.t)).filter(t => t !== null);
    const minT = timestamps.length ? Math.min(...timestamps) : 0;
    const maxT = timestamps.length ? Math.max(...timestamps) : minT;
    const xForT = t => left + (maxT <= minT ? plotW/2 : clamp((Number(t)-minT)/(maxT-minT),0,1)*plotW);
    const y = value => top + plotH - (Math.max(0,value)/maxValue)*plotH;
    const lines = CHART_SERIES.map(([key,_label,css]) => {
      const available = points.some(p => number(p[key]) !== null);
      if (!available) return '';
      const d = points.map((p,i) => `${i ? 'L':'M'}${xForT(p.t).toFixed(1)},${y(number(p[key]) || 0).toFixed(1)}`).join(' ');
      return `<path class="chartPath" d="${d}" style="stroke:var(${css})"></path>`;
    }).join('');
    const grid = [0,.5,1].map(frac => {
      const yy = top + plotH - frac*plotH;
      return `<line class="gridLine" x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}"></line><text class="axisText" x="4" y="${yy+4}">${(maxValue*frac).toLocaleString('it-IT',{maximumFractionDigits:2})}</text>`;
    }).join('');
    const labelIndexes = [...new Set([0, Math.floor((points.length-1)/2), points.length-1])];
    const labels = labelIndexes.map(i => `<text class="axisText" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}" x="${xForT(points[i].t)}" y="${height-8}">${esc(this._pointLabel(points[i].t))}</text>`).join('');
    return `<svg class="chart" data-energy-chart data-chart-kind="line" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico energia in kWh con risoluzione fino a 5 minuti. Tocca o trascina per leggere i valori.">${grid}${lines}${labels}<text class="axisText" x="4" y="12">kWh</text></svg>`;
  }

  _svgBarChart(points) {
    const width = 720, height = 260, left = 44, right = 14, top = 16, bottom = 42;
    const plotW = width-left-right, plotH = height-top-bottom;
    const availableSeries = CHART_SERIES.filter(([key]) => points.some(p => number(p[key]) !== null));
    const metricKey = this._effectiveBarMetric(points);
    const visibleSeries = this._range === '30d' ? availableSeries.filter(([key]) => key === metricKey) : availableSeries;
    const maxValue = Math.max(0.1, ...points.flatMap(p => visibleSeries.map(([key]) => number(p[key]) || 0)));
    const y = value => top + plotH - (Math.max(0,value)/maxValue)*plotH;
    const groupW = plotW / Math.max(1, points.length);
    const barCount = Math.max(1, visibleSeries.length);
    const barW = this._range === '30d'
      ? Math.max(2, Math.min(14, groupW*.64))
      : Math.max(5, Math.min(17, groupW*.76/barCount));
    const gap = this._range === '30d' ? 0 : Math.min(3, Math.max(1, barW*.18));
    const totalBarsW = barCount*barW + Math.max(0,barCount-1)*gap;
    const bars = points.map((point,index) => {
      const centerX = left + groupW*(index+.5);
      return visibleSeries.map(([key,_label,css],seriesIndex) => {
        const value = number(point[key]);
        if (value === null) return '';
        const barH = Math.max(value > 0 ? 1.5 : 0, (Math.max(0,value)/maxValue)*plotH);
        const x = centerX - totalBarsW/2 + seriesIndex*(barW+gap);
        const yy = top + plotH - barH;
        return `<rect class="barRect" data-bar-index="${index}" x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" style="fill:var(${css})"></rect>`;
      }).join('');
    }).join('');
    const grid = [0,.5,1].map(frac => {
      const yy = top + plotH - frac*plotH;
      return `<line class="gridLine" x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}"></line><text class="axisText" x="4" y="${yy+4}">${(maxValue*frac).toLocaleString('it-IT',{maximumFractionDigits:1})}</text>`;
    }).join('');
    let labelIndexes;
    if (this._range === '7d') labelIndexes = points.map((_p,i)=>i);
    else {
      const step = points.length > 24 ? 5 : points.length > 14 ? 3 : 2;
      labelIndexes = points.map((_p,i)=>i).filter(i => i===0 || i===points.length-1 || i%step===0);
    }
    const labels = labelIndexes.map(i => {
      const centerX = left + groupW*(i+.5);
      const date = new Date(points[i].t);
      const label = this._range === '7d'
        ? date.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit'})
        : date.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'});
      return `<text class="axisText" text-anchor="middle" x="${centerX.toFixed(1)}" y="${height-8}">${esc(label)}</text>`;
    }).join('');
    return `<svg class="chart" data-energy-chart data-chart-kind="bar" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico a barre dei totali energetici giornalieri. Tocca una barra per leggere il valore del giorno.">${grid}${bars}${labels}<text class="axisText" x="4" y="12">kWh</text></svg>`;
  }

  _pointLabel(timestamp) {
    const date = new Date(timestamp);
    if (this._range === '12h' || this._range === '24h') return date.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
    return date.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'});
  }

  _loadEnergyToday(ids) {
    if (!this._todayRawResult || !Array.isArray(ids) || !ids.length) return null;
    let total = 0;
    let found = false;
    for (const id of ids) {
      const rows = Array.isArray(this._todayRawResult?.[id]) ? this._todayRawResult[id] : [];
      for (const row of rows) {
        const change = number(row.change);
        if (change === null) continue;
        found = true;
        total += Math.max(0, change);
      }
    }
    return found ? total : null;
  }

  _loadEnergyFromResult(ids, result) {
    if (!result || !Array.isArray(ids) || !ids.length) return null;
    let total = 0;
    let found = false;
    for (const id of ids) {
      const rows = Array.isArray(result?.[id]) ? result[id] : [];
      for (const row of rows) {
        const change = number(row.change);
        if (change === null) continue;
        found = true;
        total += Math.max(0, change);
      }
    }
    return found ? total : null;
  }

  _collectLoads() {
    const energy = this._energy();
    const pcLoads = Array.isArray(energy?.power_control?.loads) ? energy.power_control.loads : [];
    const monitored = Array.isArray(energy?.monitored_loads) ? energy.monitored_loads : [];
    const rows = [];
    for (const load of pcLoads) {
      const powerEntity = load.power_entity_id || '';
      const power = powerEntity ? number(this._state(powerEntity)?.state) : null;
      const suspendedId = load.entities?.suspended;
      const suspended = suspendedId ? this._state(suspendedId)?.state === 'on' : false;
      const modeId = load.entities?.energy_mode;
      const mode = modeId ? this._state(modeId)?.state : '';
      rows.push({id:`pc:${load.load_id || powerEntity || load.name}`,name:load.name || load.load_id || 'Carico',power,powerEntity,energyIds:[],energyToday:null,suspended,mode,source:'power_control',ranking:true,icon:load.icon || '',command:''});
    }
    for (const load of monitored) {
      if (load.visible === false) continue;
      const powerEntity = load.power_entity_id || '';
      const power = powerEntity ? number(this._state(powerEntity)?.state) : null;
      const energyIds = Array.isArray(load.energy_statistics_valid_ids) ? load.energy_statistics_valid_ids : [];
      rows.push({id:`cl:${load.id}`,name:load.name || load.id || 'Utenza',power,powerEntity,energyIds,energyToday:this._loadEnergyToday(energyIds),suspended:false,mode:'',source:'cl_control',ranking:load.ranking !== false,icon:load.icon || '',command:load.command_entity_id || ''});
    }
    const rangeResult = this._loadRange === 'now' ? null : this._loadRangeRawResult;
    for (const load of rows) {
      load.rangeEnergy = this._loadRange === 'now' ? null : this._loadEnergyFromResult(load.energyIds, rangeResult);
      load.rankValue = this._loadRange === 'now' ? number(load.power) : number(load.rangeEnergy);
    }
    return rows;
  }

  _loadsMarkup() {
    const rows = this._collectLoads();
    rows.sort((a,b)=>Number(b.ranking)-Number(a.ranking)||(b.rankValue??-1)-(a.rankValue??-1)||String(a.name).localeCompare(String(b.name),'it'));
    const shown = rows.slice(0,8);
    const cards = shown.length ? shown.map(load => {
      const commandState = load.command ? this._state(load.command)?.state : '';
      const commandAvailable = load.command && !['unknown','unavailable',''].includes(String(commandState || ''));
      const commandOn = commandState === 'on';
      const defaultIcon = /wallbox|auto|car/i.test(load.name) ? 'mdi:ev-station' : /frigo|freezer/i.test(load.name) ? 'mdi:fridge-outline' : /pompa|pool|piscina/i.test(load.name) ? 'mdi:pool' : /clima|pdc|calor/i.test(load.name) ? 'mdi:air-conditioner' : /forno|oven/i.test(load.name) ? 'mdi:stove' : 'mdi:power-plug';
      const icon = load.icon || defaultIcon;
      const sourceLabel = load.source === 'power_control' ? 'Power Control' : 'Monitorato';
      const status = load.suspended ? 'Sospeso' : load.power !== null && Math.abs(load.power) > 20 ? 'Attivo' : 'Standby';
      const rangeLabel = LOAD_RANGE_OPTIONS[this._loadRange]?.label || '';
      const energyText = this._loadRange === 'now' ? (load.energyToday !== null ? `${formatEnergy(load.energyToday)} oggi` : (load.mode ? load.mode : status)) : (load.rangeEnergy !== null ? `Consumo ${rangeLabel.toLowerCase()}` : 'Energia periodo non disponibile');
      const command = load.command ? `<button type="button" class="loadCommand ${commandOn ? 'on' : ''}" data-load-toggle data-entity="${esc(load.command)}" data-turn-on="${commandOn ? 'false' : 'true'}" ${commandAvailable ? '' : 'disabled'}>${commandOn ? 'SPEGNI' : 'ACCENDI'}</button>` : '';
      const detailAvailable = Boolean(load.powerEntity || load.energyIds.length);
      const detailBadge = detailAvailable ? `<button type="button" class="loadBadge ${load.source === 'power_control' ? 'pc' : 'cl'}" data-load-detail="${esc(load.id)}" title="Apri grafico e andamento"><ha-icon icon="${load.source === 'power_control' ? 'mdi:lightning-bolt' : 'mdi:eye-outline'}"></ha-icon>${esc(sourceLabel)}</button>` : `<span class="loadBadge ${load.source === 'power_control' ? 'pc' : 'cl'}"><ha-icon icon="${load.source === 'power_control' ? 'mdi:lightning-bolt' : 'mdi:eye-outline'}"></ha-icon>${esc(sourceLabel)}</span>`;
      return `<div class="loadCard"><div class="loadCardHead"><span class="loadCardIcon"><ha-icon icon="${esc(icon)}"></ha-icon></span><div class="loadName ${load.suspended ? 'suspended' : ''}">${esc(load.name)}</div></div><div class="loadValue">${this._loadRange === 'now' ? formatPower(load.power) : formatEnergy(load.rangeEnergy)}</div><div class="loadSub">${esc(energyText)}</div>${detailBadge}${detailAvailable ? '<div class="loadDetailHint">Tocca il badge per il grafico</div>' : ''}${command}</div>`;
    }).join('') : '<div class="empty" style="grid-column:1/-1">Nessun carico o utenza monitorata configurata.</div>';
    const tabs = Object.entries(LOAD_RANGE_OPTIONS).map(([key,cfg]) => `<button type="button" class="range ${key === this._loadRange ? 'active' : ''}" data-load-range="${key}">${esc(cfg.label)}</button>`).join('');
    const loading = this._statsLoading.has(`loads:${this._loadRange}`);
    return `<div class="card"><div class="sectionHead"><div><div class="headIcon"><ha-icon icon="mdi:power-plug"></ha-icon><h3>Carichi monitorati</h3></div><p>Carichi Power Control e utenze monitorate da CL Control</p></div><div class="rangeTabs">${tabs}</div></div>${loading ? '<div class="empty" style="margin-bottom:8px">Caricamento consumi utenze…</div>' : ''}<div class="loadGrid">${cards}</div></div>`;
  }

  _loadDetailBounds(rangeKey = this._loadDetailRange) {
    const cfg = LOAD_DETAIL_RANGE_OPTIONS[rangeKey] || LOAD_DETAIL_RANGE_OPTIONS['24h'];
    const anchor = new Date(this._loadDetailAnchor || new Date());
    anchor.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    const start = new Date(anchor);
    start.setDate(start.getDate() - Math.max(0, (cfg.days || 1) - 1));
    const nextDay = new Date(anchor);
    nextDay.setDate(nextDay.getDate() + 1);
    let end = nextDay;
    if (anchor.getTime() === today.getTime()) end = new Date();
    if (end > new Date()) end = new Date();
    return {start,end,period:cfg.period};
  }

  _loadDetailAnchorLabel() {
    const date = new Date(this._loadDetailAnchor || new Date());
    return date.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  }

  _loadDetailCanNext() {
    const anchor = new Date(this._loadDetailAnchor || new Date());
    anchor.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    return anchor.getTime() < today.getTime();
  }

  _shiftLoadDetail(days) {
    const anchor = new Date(this._loadDetailAnchor || new Date());
    anchor.setHours(12,0,0,0);
    anchor.setDate(anchor.getDate() + days);
    const today = new Date();
    today.setHours(12,0,0,0);
    this._loadDetailAnchor = anchor > today ? today : anchor;
    this._loadDetailStats = null;
    this._loadDetailError = '';
  }

  _loadDetailMarkup() {
    if (!this._loadDetailId) return '';
    const load = this._collectLoads().find(item => item.id === this._loadDetailId);
    if (!load) return '';
    const defaultIcon = /wallbox|auto|car/i.test(load.name) ? 'mdi:ev-station' : /frigo|freezer/i.test(load.name) ? 'mdi:fridge-outline' : /pompa|pool|piscina/i.test(load.name) ? 'mdi:pool' : /clima|pdc|calor/i.test(load.name) ? 'mdi:air-conditioner' : /forno|oven/i.test(load.name) ? 'mdi:stove' : 'mdi:power-plug';
    const icon = load.icon || defaultIcon;
    const stats = this._loadDetailStats;
    const buttons = Object.entries(LOAD_DETAIL_RANGE_OPTIONS).map(([key,cfg]) => `<button type="button" class="range ${key === this._loadDetailRange ? 'active' : ''}" data-load-detail-range="${key}">${esc(cfg.label)}</button>`).join('');
    const dateNav = `<div class="loadDetailDateNav"><button type="button" class="loadDetailDateButton" data-load-detail-shift="-1" aria-label="Giorno precedente"><ha-icon icon="mdi:chevron-left"></ha-icon></button><div class="loadDetailDateLabel">${esc(this._loadDetailAnchorLabel())}</div><button type="button" class="loadDetailDateButton" data-load-detail-shift="1" aria-label="Giorno successivo" ${this._loadDetailCanNext() ? '' : 'disabled'}><ha-icon icon="mdi:chevron-right"></ha-icon></button><button type="button" class="loadDetailToday" data-load-detail-today>Oggi</button></div>`;
    let chart = '<div class="empty">Storico potenza non disponibile per questa utenza.</div>';
    // Keep an already loaded chart visible while a background refresh is running.
    // Replacing it with the loading placeholder caused a visible "stuck loading"
    // effect when Home Assistant triggered another statistics refresh.
    if (stats?.points?.length) chart = this._loadDetailRange === '24h' ? this._svgLoadChart(stats.points) : this._svgLoadBarChart(stats.points);
    else if (this._loadDetailLoading) chart = '<div class="empty">Caricamento andamento…</div>';
    const sourceLabel = load.source === 'power_control' ? 'Power Control' : 'Monitorato CL Control';
    const energyStatLabel = this._loadDetailRange === '24h' ? 'Energia giorno' : this._loadDetailRange === '7d' ? 'Energia 7 giorni' : 'Energia 30 giorni';
    return `<div class="modalBackdrop" data-load-detail-backdrop><div class="loadModal" role="dialog" aria-modal="true" aria-label="Dettaglio ${esc(load.name)}"><div class="loadModalHead"><div class="loadModalTitle"><span class="loadCardIcon"><ha-icon icon="${esc(icon)}"></ha-icon></span><div><h3>${esc(load.name)}</h3><p>${esc(sourceLabel)} · ${load.powerEntity ? esc(load.powerEntity) : 'sensore potenza non configurato'}</p></div></div><button type="button" class="modalClose" data-load-detail-close aria-label="Chiudi"><ha-icon icon="mdi:close"></ha-icon></button></div><div class="sectionHead" style="margin-top:12px"><div><h3>Andamento del carico</h3><p>Seleziona il periodo e usa le frecce per cambiare il giorno di riferimento.</p></div></div><div class="loadDetailToolbar"><div class="rangeTabs">${buttons}</div>${dateNav}</div>${this._loadDetailError ? `<div class="error">${esc(this._loadDetailError)}</div>` : ''}<div class="loadDetailStats"><div class="loadDetailStat"><div class="k">Potenza adesso</div><div class="v">${formatPower(load.power)}</div></div><div class="loadDetailStat"><div class="k">Potenza media</div><div class="v">${formatPower(stats?.averageW)}</div></div><div class="loadDetailStat"><div class="k">Picco periodo</div><div class="v">${formatPower(stats?.maxW)}</div></div>${stats?.energyKwh !== null && stats?.energyKwh !== undefined ? `<div class="loadDetailStat"><div class="k">${energyStatLabel}</div><div class="v">${formatEnergy(stats.energyKwh)}</div></div>` : ''}</div><div class="loadChartWrap">${chart}${stats?.points?.length ? '<div class="loadChartCursor" data-load-chart-cursor hidden></div><div class="loadChartTooltip" data-load-chart-tooltip hidden></div>' : ''}</div></div></div>`;
  }

  _svgLoadChart(points) {
    const width=720,height=240,left=46,right=14,top=16,bottom=34,plotW=width-left-right,plotH=height-top-bottom;
    const maxValue=Math.max(100,...points.map(p=>number(p.value)||0));
    const timestamps=points.map(p=>number(p.t)).filter(t=>t!==null);
    const minT=timestamps.length?Math.min(...timestamps):0;
    const maxT=timestamps.length?Math.max(...timestamps):minT;
    const xForT=t=>left+(maxT<=minT?plotW/2:clamp((Number(t)-minT)/(maxT-minT),0,1)*plotW);
    const y=value=>top+plotH-(Math.max(0,value)/maxValue)*plotH;
    const d=points.map((p,i)=>`${i?'L':'M'}${xForT(p.t).toFixed(1)},${y(number(p.value)||0).toFixed(1)}`).join(' ');
    const grid=[0,.5,1].map(frac=>{const yy=top+plotH-frac*plotH;return `<line class="gridLine" x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}"></line><text class="axisText" x="4" y="${yy+4}">${formatPower(maxValue*frac).replace(' kW','k').replace(' W','')}</text>`}).join('');
    const idx=[...new Set([0,Math.floor((points.length-1)/2),points.length-1])];
    const labels=idx.map(i=>`<text class="axisText" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}" x="${xForT(points[i].t)}" y="${height-8}">${esc(this._loadPointLabel(points[i].t))}</text>`).join('');
    return `<svg class="loadChart" data-load-chart data-load-chart-kind="line" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico potenza del carico">${grid}<path class="loadChartPath" d="${d}"></path>${labels}<text class="axisText" x="4" y="12">W</text></svg>`;
  }

  _svgLoadBarChart(points) {
    const width=720,height=250,left=48,right=14,top=16,bottom=42,plotW=width-left-right,plotH=height-top-bottom;
    const useEnergy=points.some(p=>number(p.energyKwh)!==null);
    const valueOf=p=>useEnergy?number(p.energyKwh):number(p.value);
    const values=points.map(valueOf).filter(v=>v!==null);
    const maxValue=Math.max(useEnergy?0.1:100,...values.map(v=>Math.max(0,v)));
    const y=value=>top+plotH-(Math.max(0,value)/maxValue)*plotH;
    const groupW=plotW/Math.max(1,points.length);
    const barW=Math.max(4,Math.min(this._loadDetailRange==='7d'?42:18,groupW*.64));
    const bars=points.map((point,index)=>{
      const value=valueOf(point); if(value===null)return '';
      const barH=Math.max(value>0?2:0,(Math.max(0,value)/maxValue)*plotH);
      const x=left+groupW*(index+.5)-barW/2; const yy=top+plotH-barH;
      return `<rect class="barRect loadBarRect" data-load-bar-index="${index}" x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" style="fill:var(--cl-blue)"></rect>`;
    }).join('');
    const grid=[0,.5,1].map(frac=>{const yy=top+plotH-frac*plotH;const value=maxValue*frac;const label=useEnergy?`${value.toLocaleString('it-IT',{maximumFractionDigits:2})}`:formatPower(value).replace(' kW','k').replace(' W','');return `<line class="gridLine" x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}"></line><text class="axisText" x="4" y="${yy+4}">${label}</text>`}).join('');
    let labelIndexes;
    if(this._loadDetailRange==='7d') labelIndexes=points.map((_p,i)=>i);
    else {const step=points.length>24?5:points.length>14?3:2;labelIndexes=points.map((_p,i)=>i).filter(i=>i===0||i===points.length-1||i%step===0);}
    const labels=labelIndexes.map(i=>{const x=left+groupW*(i+.5);const date=new Date(points[i].t);const label=this._loadDetailRange==='7d'?date.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit'}):date.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'});return `<text class="axisText" text-anchor="middle" x="${x.toFixed(1)}" y="${height-8}">${esc(label)}</text>`}).join('');
    const unit=useEnergy?'kWh':'W';
    return `<svg class="loadChart" data-load-chart data-load-chart-kind="bar" data-load-chart-energy="${useEnergy?'true':'false'}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico a barre giornaliero del carico. Tocca una barra per mantenerne visibile il dettaglio.">${grid}${bars}${labels}<text class="axisText" x="4" y="12">${unit}</text></svg>`;
  }

  _loadPointLabel(timestamp) {
    const date=new Date(timestamp);
    if (this._loadDetailRange==='24h') return date.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
    return date.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'});
  }

  async _openLoadDetail(id) {
    this._loadDetailId=String(id||'');
    this._loadDetailRange=this._loadRange==='now'?'24h':this._loadRange;
    this._loadDetailAnchor=new Date();
    this._loadDetailStats=null;
    this._loadChartSelection=null;
    this._loadDetailError='';
    this._render();
    await this._ensureLoadDetail();
  }

  _loadDetailCacheKey(load) {
    const anchor = new Date(this._loadDetailAnchor || new Date());
    // Use the selected local calendar day as the stable cache identity.
    // Do NOT use end.getTime(): for "Oggi" the end is `new Date()`, so every
    // render produced a different key and started a new Recorder request.
    const yyyy = anchor.getFullYear();
    const mm = String(anchor.getMonth() + 1).padStart(2, '0');
    const dd = String(anchor.getDate()).padStart(2, '0');
    return `load-detail:${load.id}:${this._loadDetailRange}:${yyyy}-${mm}-${dd}`;
  }

  async _ensureLoadDetail() {
    if (!this._loadDetailId || !this._hass?.callWS) return;
    const load=this._collectLoads().find(item=>item.id===this._loadDetailId);
    if (!load) return;
    const {start,end,period}=this._loadDetailBounds();
    const key=this._loadDetailCacheKey(load);
    const cached=this._loadDetailCache.get(key);
    if (cached && Date.now()-cached.at<5*60*1000) {
      if (this._loadDetailStats !== cached.data) {
        this._loadDetailStats=cached.data;
        this._loadDetailError='';
        this._render();
      }
      return;
    }
    // Ignore only an identical in-flight request. If the user changes day or
    // range while another request is running, allow the new request and use
    // the request key below to discard any stale completion.
    if (this._loadDetailLoading && this._loadDetailRequestKey === key) return;
    this._loadDetailLoading=true;
    this._loadDetailRequestKey=key;
    this._loadDetailError='';
    this._render();
    try {
      let points=[];
      if (load.powerEntity) {
        const result=await this._hass.callWS({type:'recorder/statistics_during_period',start_time:start.toISOString(),end_time:end.toISOString(),statistic_ids:[load.powerEntity],period,units:{power:'W'},types:['mean','max']});
        const rows=Array.isArray(result?.[load.powerEntity])?result[load.powerEntity]:[];
        points=rows.map(row=>({t:number(row.start),value:number(row.mean),max:number(row.max),energyKwh:null})).filter(p=>p.t!==null&&p.value!==null);
      }
      let energyKwh=null;
      let energyPoints=[];
      if (load.energyIds?.length) {
        const er=await this._fetchStatistics(start,end,period,load.energyIds);
        energyKwh=this._loadEnergyFromResult(load.energyIds,er);
        const merged=new Map();
        for(const id of load.energyIds){
          const rows=Array.isArray(er?.[id])?er[id]:[];
          for(const row of rows){const t=number(row.start),change=number(row.change);if(t===null||change===null)continue;merged.set(t,(merged.get(t)||0)+Math.max(0,change));}
        }
        energyPoints=[...merged.entries()].sort((a,b)=>a[0]-b[0]).map(([t,value])=>({t,energyKwh:value}));
      }
      if (energyPoints.length) {
        const byTime=new Map(energyPoints.map(item=>[item.t,item.energyKwh]));
        if(points.length) points=points.map(point=>({...point,energyKwh:byTime.has(point.t)?byTime.get(point.t):null}));
        else points=energyPoints.map(point=>({t:point.t,value:null,max:null,energyKwh:point.energyKwh}));
      }
      const values=points.map(p=>p.value).filter(v=>v!==null);
      const peaks=points.map(p=>p.max).filter(v=>v!==null);
      const averageW=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
      const maxW=peaks.length?Math.max(...peaks):(values.length?Math.max(...values):null);
      const data={points,averageW,maxW,energyKwh};
      this._loadDetailCache.set(key,{at:Date.now(),data});
      // A slower request for an old date/range must never overwrite the
      // detail currently selected by the user.
      if (this._loadDetailRequestKey === key) {
        this._loadDetailStats=data;
        this._loadDetailError=!points.length && !load.energyIds?.length
          ? 'Questo carico non espone statistiche di potenza o energia utilizzabili.'
          : '';
      }
    } catch (_error) {
      if (this._loadDetailRequestKey === key) {
        this._loadDetailError='Impossibile leggere lo storico del carico da Home Assistant Recorder.';
        this._loadDetailStats={points:[],averageW:null,maxW:null,energyKwh:null};
      }
    } finally {
      if (this._loadDetailRequestKey === key) {
        this._loadDetailLoading=false;
        this._loadDetailRequestKey='';
        this._render();
      }
    }
  }

  async _toggleLoadCommand(entityId, turnOn) {
    if (!entityId || !entityId.includes('.') || !this._hass?.callService) return;
    const domain = entityId.split('.',1)[0];
    if (!['switch','light'].includes(domain)) return;
    try {
      await this._hass.callService(domain, turnOn ? 'turn_on' : 'turn_off', {entity_id: entityId});
    } catch (_error) {
      // Home Assistant will expose service failures through its normal UI/logs.
    }
  }


  _historyMarkup() {
    const historyId = this._sourceIds('intervention_history')[0];
    const state = historyId ? this._state(historyId) : null;
    const recent = Array.isArray(state?.attributes?.ultimi_interventi) ? state.attributes.ultimi_interventi : [];
    const content = recent.length ? recent.slice(0,5).map(item => {
      const start = item.started_at ? new Date(item.started_at) : null;
      const label = start && !Number.isNaN(start.getTime()) ? start.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'Intervento';
      const actions = Array.isArray(item.actions) ? item.actions : [];
      const shed = actions.filter(action => action?.type === 'distacco').map(action => action?.name).filter(Boolean);
      const status = item.ended_at ? 'Completato' : 'In corso';
      return `<div class="historyRow"><div><div class="name">${esc(label)} · ${esc(item.reason || 'Power Control')}</div><small>${shed.length ? `Distacco: ${esc(shed.join(', '))}` : 'Intervento Power Control'} · ${esc(status)}</small></div><div class="loadPower">${formatPower(item.system_power_w)}</div></div>`;
    }).join('') : '<div class="empty">Nessun intervento Power Control memorizzato.</div>';
    return `<div class="card"><div class="sectionHead"><div><h3>Storico interventi</h3><p>Ultimi interventi tecnici registrati dal backend.</p></div><span class="badge">POWER CONTROL</span></div><div class="list">${content}</div></div>`;
  }

  _render() {
    const root = this.shadowRoot?.getElementById('root');
    if (!root) return;
    if (!this._hass) { root.innerHTML = '<div class="card"><div class="empty">Home Assistant non disponibile.</div></div>'; return; }
    const energy = this._energy();
    if (!energy?.available) {
      root.innerHTML = `${this._appHeaderMarkup()}<div class="card"><div class="sectionHead"><div><h2>Energia</h2><p>Configura CL Power Control Energy Control oppure Home Assistant Energy per abilitare questa sezione.</p></div></div></div>`;
      return;
    }
    const realtime = `${this._flowMarkup()}${this._statusMarkup()}${this._todayMarkup()}${this._chartMarkup()}${this._loadsMarkup()}`;
    const history = `<div class="historyOnly">${this._historySummaryMarkup()}${this._chartMarkup()}${this._loadsMarkup()}${this._historyMarkup()}</div>`;
    root.innerHTML = `${this._appHeaderMarkup()}${this._viewMode === 'history' ? history : realtime}${this._loadDetailMarkup()}`;
    root.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
      const next = String(button.dataset.view || 'realtime');
      if (!['realtime','history'].includes(next) || next === this._viewMode) return;
      this._viewMode = next; this._render(); this._ensureStatistics();
    }));
    root.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
      const next = button.dataset.range;
      if (!RANGE_OPTIONS[next] || next === this._range) return;
      this._range = next; this._rangeStats = null; this._chartSelection = null; this._render(); this._ensureStatistics();
    }));
    root.querySelectorAll('[data-bar-metric]').forEach(button => button.addEventListener('click', () => {
      const next = String(button.dataset.barMetric || 'home');
      if (!CHART_SERIES.some(([key]) => key === next) || next === this._barMetric) return;
      this._barMetric = next;
      this._chartSelection = null;
      this._render();
    }));
    root.querySelectorAll('[data-load-range]').forEach(button => button.addEventListener('click', () => {
      const next = String(button.dataset.loadRange || 'now');
      if (!LOAD_RANGE_OPTIONS[next] || next === this._loadRange) return;
      this._loadRange = next; this._loadRangeRawResult = null; this._render(); this._ensureStatistics();
    }));
    root.querySelectorAll('[data-load-toggle]').forEach(button => button.addEventListener('click', () => {
      const entityId = String(button.dataset.entity || ''); const turnOn = button.dataset.turnOn === 'true'; this._toggleLoadCommand(entityId, turnOn);
    }));
    root.querySelectorAll('[data-history-period]').forEach(button => button.addEventListener('click', () => {
      const next=String(button.dataset.historyPeriod||'day'); if (!HISTORY_PERIOD_OPTIONS[next]||next===this._historyPeriod) return; this._historyPeriod=next; this._historyStats=null; this._historyRawResult=null; this._render(); this._ensureStatistics();
    }));
    root.querySelectorAll('[data-history-shift]').forEach(button => button.addEventListener('click', () => { const step=Number(button.dataset.historyShift)||0; if (!step || (step>0&&!this._historyCanNext())) return; this._shiftHistory(step); this._render(); this._ensureStatistics(); }));
    root.querySelectorAll('[data-history-now]').forEach(button => button.addEventListener('click', () => { this._historyAnchor=new Date(); this._historyStats=null; this._historyRawResult=null; this._render(); this._ensureStatistics(); }));
    root.querySelectorAll('[data-load-detail]').forEach(button => button.addEventListener('click', () => this._openLoadDetail(button.dataset.loadDetail)));
    root.querySelectorAll('[data-load-detail-close]').forEach(button => button.addEventListener('click', () => { this._loadDetailId=''; this._loadDetailStats=null; this._loadChartSelection=null; this._loadDetailError=''; this._render(); }));
    root.querySelectorAll('[data-load-detail-backdrop]').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target!==backdrop) return; this._loadDetailId=''; this._loadDetailStats=null; this._loadChartSelection=null; this._loadDetailError=''; this._render(); }));
    root.querySelectorAll('[data-load-detail-range]').forEach(button => button.addEventListener('click', () => { const next=String(button.dataset.loadDetailRange||'24h'); if (!LOAD_DETAIL_RANGE_OPTIONS[next]||next===this._loadDetailRange) return; this._loadDetailRange=next; this._loadDetailStats=null; this._loadChartSelection=null; this._loadDetailError=''; this._render(); this._ensureLoadDetail(); }));
    root.querySelectorAll('[data-load-detail-shift]').forEach(button => button.addEventListener('click', () => { const step=Number(button.dataset.loadDetailShift)||0; if (!step || (step>0&&!this._loadDetailCanNext())) return; this._shiftLoadDetail(step); this._loadChartSelection=null; this._render(); this._ensureLoadDetail(); }));
    root.querySelectorAll('[data-load-detail-today]').forEach(button => button.addEventListener('click', () => { this._loadDetailAnchor=new Date(); this._loadDetailStats=null; this._loadChartSelection=null; this._loadDetailError=''; this._render(); this._ensureLoadDetail(); }));
    this._attachChartInteractions(root);
    this._attachLoadChartInteractions(root);
    queueMicrotask(() => { this._ensureStatistics(); if (this._loadDetailId) this._ensureLoadDetail(); });
  }

  _chartTooltipTime(timestamp) {
    const date = new Date(timestamp);
    if (this._range === '12h' || this._range === '24h') return date.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
    return date.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'short'});
  }

  _attachChartInteractions(root) {
    const svg = root.querySelector('[data-energy-chart]');
    const wrap = svg?.closest('.chartWrap');
    const cursor = wrap?.querySelector('[data-chart-cursor]');
    const tooltip = wrap?.querySelector('[data-chart-tooltip]');
    const points = this._rangeStats?.points || [];
    if (!svg || !wrap || !cursor || !tooltip || !points.length) return;

    const selectionMatches = () => this._chartSelection && this._chartSelection.range === this._range && (this._range !== '30d' || this._chartSelection.barMetric === this._effectiveBarMetric(points));
    const hide = () => { cursor.hidden = true; tooltip.hidden = true; };
    const pointIndexForTimestamp = timestamp => {
      let index=0, nearest=Infinity;
      points.forEach((item,i)=>{const t=number(item.t);if(t===null)return;const distance=Math.abs(t-Number(timestamp));if(distance<nearest){nearest=distance;index=i;}});
      return index;
    };
    const showIndex = (index, pin=false) => {
      const point=points[index]; if(!point)return;
      const rect=svg.getBoundingClientRect(); if(!rect.width)return;
      const width=720,left=42,right=14,plotW=width-left-right;
      const timestamps=points.map(p=>number(p.t)).filter(t=>t!==null);
      const minT=timestamps.length?Math.min(...timestamps):0;
      const maxT=timestamps.length?Math.max(...timestamps):minT;
      const pointT=number(point.t);
      let pointSvgX;
      if(svg.dataset.chartKind==='bar') pointSvgX=left+(plotW/Math.max(1,points.length))*(index+.5);
      else {const pointRatio=(maxT<=minT||pointT===null) ? .5 : clamp((pointT-minT)/(maxT-minT),0,1);pointSvgX=left+pointRatio*plotW;}
      const pointPx=(pointSvgX/width)*rect.width+(rect.left-wrap.getBoundingClientRect().left);
      cursor.style.left=`${pointPx}px`;cursor.hidden=false;
      const tooltipSeries=this._range==='30d'?CHART_SERIES.filter(([key])=>key===this._effectiveBarMetric(points)&&number(point[key])!==null):CHART_SERIES.filter(([key])=>number(point[key])!==null);
      const rows=tooltipSeries.map(([key,label])=>`<div class="chartTooltipRow"><span class="chartTooltipName">${esc(label)}</span><span class="chartTooltipValue">${formatEnergy(point[key])}</span></div>`).join('');
      tooltip.innerHTML=`<div class="chartTooltipTitle">${esc(this._chartTooltipTime(point.t))}</div>${rows}`;tooltip.hidden=false;
      const wrapRect=wrap.getBoundingClientRect(),tooltipWidth=tooltip.offsetWidth||180;let leftPx=pointPx+10;if(leftPx+tooltipWidth>wrapRect.width-4)leftPx=pointPx-tooltipWidth-10;tooltip.style.left=`${Math.max(4,leftPx)}px`;
      if(pin)this._chartSelection={range:this._range,barMetric:this._effectiveBarMetric(points),t:point.t};
    };
    const showAt=(clientX,pin=false)=>{
      const rect=svg.getBoundingClientRect();if(!rect.width)return;
      const width=720,left=42,right=14,plotW=width-left-right;
      const svgX=clamp(((clientX-rect.left)/rect.width)*width,left,width-right);
      let index=0;
      if(svg.dataset.chartKind==='bar') index=clamp(Math.floor(((svgX-left)/plotW)*points.length),0,points.length-1);
      else {
        const ratio=clamp((svgX-left)/plotW,0,1),timestamps=points.map(p=>number(p.t)).filter(t=>t!==null),minT=timestamps.length?Math.min(...timestamps):0,maxT=timestamps.length?Math.max(...timestamps):minT,targetT=minT+ratio*Math.max(0,maxT-minT);
        index=pointIndexForTimestamp(targetT);
      }
      showIndex(index,pin);
    };
    const restorePinned=()=>{if(selectionMatches())showIndex(pointIndexForTimestamp(this._chartSelection.t),false);else hide();};

    svg.addEventListener('pointerdown',event=>{showAt(event.clientX,true);try{svg.setPointerCapture(event.pointerId)}catch(_e){}});
    svg.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'&&!event.buttons)showAt(event.clientX,false);else if(event.buttons||svg.hasPointerCapture?.(event.pointerId))showAt(event.clientX,true);});
    svg.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'&&!event.buttons){if(selectionMatches())restorePinned();else hide();}});
    svg.addEventListener('pointerup',event=>{showAt(event.clientX,true);try{svg.releasePointerCapture(event.pointerId)}catch(_e){}});
    svg.addEventListener('pointercancel',()=>restorePinned());
    if(selectionMatches()) queueMicrotask(restorePinned);
  }

  _attachLoadChartInteractions(root) {
    const svg=root.querySelector('[data-load-chart]');
    const wrap=svg?.closest('.loadChartWrap');
    const cursor=wrap?.querySelector('[data-load-chart-cursor]');
    const tooltip=wrap?.querySelector('[data-load-chart-tooltip]');
    const points=this._loadDetailStats?.points||[];
    if(!svg||!wrap||!cursor||!tooltip||!points.length)return;
    const anchor=this._loadDetailCacheKey({id:this._loadDetailId});
    const selectionMatches=()=>this._loadChartSelection&&this._loadChartSelection.key===anchor;
    const hide=()=>{cursor.hidden=true;tooltip.hidden=true;};
    const pointIndexForTimestamp=timestamp=>{let index=0,nearest=Infinity;points.forEach((item,i)=>{const t=number(item.t);if(t===null)return;const distance=Math.abs(t-Number(timestamp));if(distance<nearest){nearest=distance;index=i;}});return index;};
    const showIndex=(index,pin=false)=>{
      const point=points[index];if(!point)return;
      const rect=svg.getBoundingClientRect();if(!rect.width)return;
      const width=720,left=svg.dataset.loadChartKind==='bar'?48:46,right=14,plotW=width-left-right;
      const timestamps=points.map(p=>number(p.t)).filter(t=>t!==null),minT=timestamps.length?Math.min(...timestamps):0,maxT=timestamps.length?Math.max(...timestamps):minT;
      const pointT=number(point.t);let pointSvgX;
      if(svg.dataset.loadChartKind==='bar')pointSvgX=left+(plotW/Math.max(1,points.length))*(index+.5);
      else {const pointRatio=(maxT<=minT||pointT===null) ? .5 : clamp((pointT-minT)/(maxT-minT),0,1);pointSvgX=left+pointRatio*plotW;}
      const pointPx=(pointSvgX/width)*rect.width+(rect.left-wrap.getBoundingClientRect().left);cursor.style.left=`${pointPx}px`;cursor.hidden=false;
      const date=new Date(point.t);const label=this._loadDetailRange==='24h'?date.toLocaleString('it-IT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):date.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'short'});
      const energy=number(point.energyKwh);const power=number(point.value);const peak=number(point.max);
      let rows='';
      if(energy!==null)rows+=`<div class="chartTooltipRow"><span class="chartTooltipName">Consumo</span><span class="chartTooltipValue">${formatEnergy(energy)}</span></div>`;
      if(power!==null)rows+=`<div class="chartTooltipRow"><span class="chartTooltipName">Potenza media</span><span class="chartTooltipValue">${formatPower(power)}</span></div>`;
      if(peak!==null&&this._loadDetailRange!=='24h')rows+=`<div class="chartTooltipRow"><span class="chartTooltipName">Picco</span><span class="chartTooltipValue">${formatPower(peak)}</span></div>`;
      tooltip.innerHTML=`<div class="chartTooltipTitle">${esc(label)}</div>${rows||formatPower(point.value)}`;tooltip.hidden=false;
      const tw=tooltip.offsetWidth||150;let leftPx=pointPx+8;if(leftPx+tw>wrap.getBoundingClientRect().width-4)leftPx=pointPx-tw-8;tooltip.style.left=`${Math.max(4,leftPx)}px`;
      if(pin)this._loadChartSelection={key:anchor,t:point.t};
    };
    const showAt=(clientX,pin=false)=>{const rect=svg.getBoundingClientRect();if(!rect.width)return;const width=720,left=svg.dataset.loadChartKind==='bar'?48:46,right=14,plotW=width-left-right,svgX=clamp(((clientX-rect.left)/rect.width)*width,left,width-right);let index=0;if(svg.dataset.loadChartKind==='bar')index=clamp(Math.floor(((svgX-left)/plotW)*points.length),0,points.length-1);else{const ratio=clamp((svgX-left)/plotW,0,1),timestamps=points.map(p=>number(p.t)).filter(t=>t!==null),minT=timestamps.length?Math.min(...timestamps):0,maxT=timestamps.length?Math.max(...timestamps):minT,targetT=minT+ratio*Math.max(0,maxT-minT);index=pointIndexForTimestamp(targetT);}showIndex(index,pin);};
    const restorePinned=()=>{if(selectionMatches())showIndex(pointIndexForTimestamp(this._loadChartSelection.t),false);else hide();};
    svg.addEventListener('pointerdown',event=>{showAt(event.clientX,true);try{svg.setPointerCapture(event.pointerId)}catch(_e){}});
    svg.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'&&!event.buttons)showAt(event.clientX,false);else if(event.buttons||svg.hasPointerCapture?.(event.pointerId))showAt(event.clientX,true);});
    svg.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'&&!event.buttons){if(selectionMatches())restorePinned();else hide();}});
    svg.addEventListener('pointerup',event=>{showAt(event.clientX,true);try{svg.releasePointerCapture(event.pointerId)}catch(_e){}});
    svg.addEventListener('pointercancel',()=>restorePinned());
    if(selectionMatches())queueMicrotask(restorePinned);
  }

  _globalStatisticIds() {
    const ids = new Set();
    ['pv_energy_total','home_energy_total','grid_import_energy_total','grid_export_energy_total','battery_charge_energy_total','battery_discharge_energy_total'].forEach(key => this._statIds(key).forEach(id => ids.add(id)));
    return [...ids];
  }

  _monitoredStatisticIds() {
    const ids = new Set();
    for (const load of (this._energy()?.monitored_loads || [])) {
      for (const id of (load.energy_statistics_valid_ids || [])) if (id) ids.add(id);
    }
    return [...ids];
  }

  _allStatisticIds() {
    return [...new Set([...this._globalStatisticIds(), ...this._monitoredStatisticIds()])];
  }

  async _ensureStatistics() {
    if (!this._hass?.callWS) return;
    const tasks = [];
    if (this._allStatisticIds().length) tasks.push(this._ensureToday());
    if (this._globalStatisticIds().length) tasks.push(this._ensureRange(this._range));
    if (this._viewMode === 'history' && this._globalStatisticIds().length) tasks.push(this._ensureHistorySummary());
    if (this._loadRange !== 'now' && this._monitoredStatisticIds().length) tasks.push(this._ensureLoadRange(this._loadRange));
    if (tasks.length) await Promise.all(tasks);
  }

  _cacheFresh(key) {
    const item = this._statsCache.get(key);
    return item && Date.now() - item.at < 5 * 60 * 1000;
  }

  async _ensureToday() {
    const now = new Date();
    const start = new Date(now); start.setHours(0,0,0,0);
    const key = `today:${start.toISOString().slice(0,10)}`;
    if (this._cacheFresh(key)) {
      this._todayRawResult = this._statsCache.get(key).data;
      this._todayStats = this._summaryFromResult(this._todayRawResult);
      return;
    }
    if (this._statsLoading.has('today')) return;
    this._statsLoading.add('today');
    try {
      const result = await this._fetchStatistics(start, now, 'hour');
      this._statsCache.set(key,{at:Date.now(),data:result});
      this._todayRawResult = result;
      this._todayStats = this._summaryFromResult(result);
      this._statsError = '';
    } catch (error) {
      this._statsError = 'Impossibile leggere le statistiche energetiche di Home Assistant.';
    } finally {
      this._statsLoading.delete('today');
      this._render();
    }
  }

  async _ensureHistorySummary() {
    const ids=this._globalStatisticIds(); if (!ids.length) return;
    const {start,end,queryPeriod}=this._historyBounds();
    const key=`history:${this._historyPeriod}:${start.getTime()}:${end.getTime()}`;
    if (this._cacheFresh(key)) { const raw=this._statsCache.get(key).data; if (this._historyRawResult !== raw) { this._historyRawResult=raw; this._historyStats=this._summaryFromResult(raw); this._render(); } return; }
    if (this._statsLoading.has('history-summary')) return;
    this._statsLoading.add('history-summary');
    try { const result=await this._fetchStatistics(start,end,queryPeriod,ids); this._statsCache.set(key,{at:Date.now(),data:result}); this._historyRawResult=result; this._historyStats=this._summaryFromResult(result); this._statsError=''; }
    catch(_error){ this._statsError='Impossibile leggere il riepilogo storico selezionato.'; }
    finally { this._statsLoading.delete('history-summary'); this._render(); }
  }

  async _ensureRange(rangeKey) {
    const cfg = RANGE_OPTIONS[rangeKey];
    if (!cfg) return;
    const now = new Date();
    const start = new Date(now);
    if (cfg.hours) start.setTime(now.getTime() - cfg.hours*3600000);
    else { start.setHours(0,0,0,0); start.setDate(start.getDate() - (cfg.days-1)); }
    const key = `range:${rangeKey}:${start.toISOString().slice(0,13)}`;
    if (this._cacheFresh(key)) {
      if (rangeKey === this._range && !this._rangeStats) { this._rangeStats = this._seriesFromResult(this._statsCache.get(key).data); this._render(); }
      return;
    }
    const loadingKey = `range:${rangeKey}`;
    if (this._statsLoading.has(loadingKey)) return;
    this._statsLoading.add(loadingKey);
    try {
      const result = await this._fetchStatistics(start, now, cfg.period, this._globalStatisticIds());
      this._statsCache.set(key,{at:Date.now(),data:result});
      if (rangeKey === this._range) this._rangeStats = this._seriesFromResult(result);
      this._statsError = '';
    } catch (error) {
      this._statsError = 'Impossibile leggere lo storico energetico.';
    } finally {
      this._statsLoading.delete(loadingKey);
      this._render();
    }
  }

  async _ensureLoadRange(rangeKey) {
    const cfg = LOAD_RANGE_OPTIONS[rangeKey];
    if (!cfg || rangeKey === 'now') return;
    const ids = this._monitoredStatisticIds();
    if (!ids.length) return;
    const now = new Date();
    const start = new Date(now);
    if (cfg.hours) start.setTime(now.getTime() - cfg.hours * 3600000);
    else { start.setHours(0,0,0,0); start.setDate(start.getDate() - ((cfg.days || 1) - 1)); }
    const key = `loads:${rangeKey}:${Math.floor(start.getTime()/3600000)}`;
    if (this._cacheFresh(key)) { if (rangeKey === this._loadRange && this._loadRangeRawResult !== this._statsCache.get(key).data) { this._loadRangeRawResult = this._statsCache.get(key).data; this._render(); } return; }
    const loadingKey = `loads:${rangeKey}`;
    if (this._statsLoading.has(loadingKey)) return;
    this._statsLoading.add(loadingKey);
    try { const result = await this._fetchStatistics(start, now, cfg.period, ids); this._statsCache.set(key,{at:Date.now(),data:result}); if (rangeKey === this._loadRange) this._loadRangeRawResult = result; }
    catch (_error) { this._statsError = 'Impossibile leggere i consumi storici delle utenze.'; }
    finally { this._statsLoading.delete(loadingKey); this._render(); }
  }

  async _fetchStatistics(start, end, period, statisticIds = this._allStatisticIds()) {
    return await this._hass.callWS({
      type: 'recorder/statistics_during_period',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      statistic_ids: statisticIds,
      period,
      units: {energy: 'kWh'},
      types: ['change'],
    });
  }

  _metricSeries(key, result) {
    const combined = new Map();
    for (const id of this._statIds(key)) {
      const rows = Array.isArray(result?.[id]) ? result[id] : [];
      for (const row of rows) {
        const timestamp = number(row.start);
        const change = number(row.change);
        if (timestamp === null || change === null) continue;
        combined.set(timestamp, (combined.get(timestamp) || 0) + Math.max(0, change));
      }
    }
    return combined;
  }

  _sumMap(map) { return [...map.values()].reduce((sum,value) => sum + (number(value) || 0),0); }

  _summaryFromResult(result) {
    const total = key => this._statIds(key).length ? this._sumMap(this._metricSeries(key, result)) : null;
    const pv = total('pv_energy_total');
    const directHome = total('home_energy_total');
    const imp = total('grid_import_energy_total');
    const exp = total('grid_export_energy_total');
    const charge = total('battery_charge_energy_total');
    const discharge = total('battery_discharge_energy_total');
    const canDeriveHome = pv !== null && imp !== null;
    const derivedHome = canDeriveHome ? Math.max(0, pv + imp + (discharge || 0) - (exp || 0) - (charge || 0)) : null;
    const home = directHome !== null ? directHome : derivedHome;
    const selfConsumption = pv !== null && pv > 0 ? clamp(((pv-(exp || 0))/pv)*100,0,100) : null;
    const selfSufficiency = home !== null && home > 0 && imp !== null ? clamp(((home-imp)/home)*100,0,100) : null;
    return {pv,home,homeDerived:directHome === null && home !== null,import:imp,export:exp,batteryCharge:charge,batteryDischarge:discharge,selfConsumption,selfSufficiency};
  }

  _seriesFromResult(result) {
    const series = {
      pv:this._metricSeries('pv_energy_total', result),
      home:this._metricSeries('home_energy_total', result),
      import:this._metricSeries('grid_import_energy_total', result),
      export:this._metricSeries('grid_export_energy_total', result),
      charge:this._metricSeries('battery_charge_energy_total', result),
      discharge:this._metricSeries('battery_discharge_energy_total', result),
    };
    const timestamps = new Set(); Object.values(series).forEach(map => [...map.keys()].forEach(t => timestamps.add(t)));
    const points = [...timestamps].sort((a,b)=>a-b).map(t => {
      const hasPv = this._statIds('pv_energy_total').length > 0;
      const hasImport = this._statIds('grid_import_energy_total').length > 0;
      const hasExport = this._statIds('grid_export_energy_total').length > 0;
      const hasCharge = this._statIds('battery_charge_energy_total').length > 0;
      const hasDischarge = this._statIds('battery_discharge_energy_total').length > 0;
      const pv = hasPv ? (series.pv.get(t) ?? 0) : null;
      const imp = hasImport ? (series.import.get(t) ?? 0) : null;
      const exp = hasExport ? (series.export.get(t) ?? 0) : null;
      const charge = hasCharge ? (series.charge.get(t) ?? 0) : null;
      const discharge = hasDischarge ? (series.discharge.get(t) ?? 0) : null;
      const directHome = this._statIds('home_energy_total').length ? (series.home.get(t) ?? 0) : null;
      const canDerive = pv !== null && imp !== null;
      const home = directHome !== null ? directHome : canDerive ? Math.max(0,pv+imp+(discharge||0)-(exp||0)-(charge||0)) : null;
      return {t,pv,home,import:imp,export:exp};
    });
    return {points};
  }
}

if (!customElements.get('cl-control-energy-card')) customElements.define('cl-control-energy-card', CLEnergyCard);

window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'cl-control-energy-card')) {
  window.customCards.push({
    type: 'cl-control-energy-card',
    name: 'CL Control Energia',
    description: 'Interfaccia energia CL Control con realtime CL Power Control e statistiche Home Assistant.',
  });
}

export {CLEnergyCard};
