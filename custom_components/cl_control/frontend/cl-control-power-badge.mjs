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
