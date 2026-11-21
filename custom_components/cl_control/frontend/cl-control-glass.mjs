// Blue Tech Glass card surface, shared by custom and native CL Control cards.
const GLASS_BACKGROUND = [
  'var(--cl-glass-tint, linear-gradient(transparent,transparent)) padding-box',
  'radial-gradient(ellipse at 12% 35%,#16426a 0%,transparent 64%) padding-box',
  'linear-gradient(115deg,#102438,#0b1524 66%,#1e1938) padding-box',
  'linear-gradient(130deg,#9adcff 0%,#3084bd 37%,#234976 68%,#9976c9 100%) border-box',
].join(',');
const GLASS_SHADOW = '0 0 16px #3184d042,inset 0 0 7px #56b5ff25';

export const GLASS_SURFACE = `
  background: ${GLASS_BACKGROUND};
  border: 1px solid transparent;
  box-shadow: ${GLASS_SHADOW};
`;

// Inherited by native cards inside CL Control, including their shadow DOM.
export const NATIVE_GLASS = `
  --ha-card-background: ${GLASS_BACKGROUND};
  --ha-card-border-color: transparent;
  --ha-card-border-width: 1px;
  --ha-card-box-shadow: ${GLASS_SHADOW};
  --ha-card-border-radius: 20px;
  --primary-text-color: #f5f7fc;
  --secondary-text-color: #bdcadd;
`;
