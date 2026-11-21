/** Read a valid instant-power sensor from Home Assistant live states. */
export function readInstantPower(hass, entityId) {
  if (!entityId || !hass?.states) return '';
  const sensor = hass.states[entityId];
  const state = String(sensor?.state ?? '');
  const unit = sensor?.attributes?.unit_of_measurement;
  if (!sensor || !state || state === 'unknown' || state === 'unavailable' ||
      !['W', 'kW'].includes(unit)) return '';
  const numeric = Number(state);
  if (!Number.isFinite(numeric)) return '';
  const watts = unit === 'kW' ? numeric * 1000 : numeric;
  const inKw = Math.abs(watts) >= 1000;
  const formatted = new Intl.NumberFormat('it-IT', {
    maximumFractionDigits: inKw ? 2 : 1,
  }).format(inKw ? watts / 1000 : watts);
  return formatted + (inKw ? ' kW' : ' W');
}

/**
 * Shared presentation for instant power across lights, outlets and switches.
 * Keep the measurement separate from the on/off state: a valid 0 W is visible.
 */
export const INSTANT_POWER_BADGE_CSS = `
  .cl-power-meter {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    column-gap: 5px;
    row-gap: 2px;
    max-width: 100%;
    margin-top: 4px;
    color: #ffd27e;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .cl-power-meter[hidden] { display: none !important; }
  .cl-power-symbol { color: #ffbf4c; font-size: 16px; line-height: 1; }
  .cl-power-value { min-width: 0; }
`;
