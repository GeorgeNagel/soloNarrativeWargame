/** Visual identity: luminous thin lines on near-black, ghosted future states. */
export const COLORS = {
  void: '#04060b',
  deep: '#080d16',
  grid: 'rgba(122, 190, 214, 0.13)',
  gridWarm: 'rgba(122, 190, 214, 0.05)',
  player: '#57E8CE',
  playerDeep: '#0d3b38',
  enemy: '#FF7D6A',
  enemyDeep: '#3d1712',
  focus: '#F4C97A',
  text: '#D6E9F2',
  muted: '#6E8798',
  faint: 'rgba(214, 233, 242, 0.32)',
} as const

export function sideColor(side: 'player' | 'enemy'): string {
  return side === 'player' ? COLORS.player : COLORS.enemy
}

export function sideDeep(side: 'player' | 'enemy'): string {
  return side === 'player' ? COLORS.playerDeep : COLORS.enemyDeep
}

export const FONT_STACK =
  '"Iowan Old Style", "Palatino Linotype", Palatino, "Georgia", serif'
export const MONO_STACK =
  'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace'

/** Component-scoped stylesheet, injected once by the prototype root. */
export const STYLES = `
.rp-root {
  --rp-player: ${COLORS.player};
  --rp-enemy: ${COLORS.enemy};
  --rp-focus: ${COLORS.focus};
  position: relative;
  min-height: 100%;
  background:
    radial-gradient(120% 80% at 50% 0%, #0d1726 0%, ${COLORS.void} 62%),
    ${COLORS.void};
  color: ${COLORS.text};
  font-family: ${MONO_STACK};
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 14px;
  box-sizing: border-box;
  overflow: hidden;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none;
  user-select: none;
}
.rp-root *, .rp-root *::before, .rp-root *::after { box-sizing: border-box; }
.rp-root button { font: inherit; color: inherit; }

.rp-scanlines {
  position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(
    to bottom, rgba(255,255,255,0.016) 0 1px, transparent 1px 3px);
  mix-blend-mode: screen;
}

.rp-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px; letter-spacing: 0.14em; text-transform: uppercase;
  font-size: 10px; color: ${COLORS.muted}; white-space: nowrap;
}
.rp-head b { color: ${COLORS.text}; font-weight: 500; letter-spacing: 0.18em; }
.rp-head .rp-phase { color: var(--rp-focus); }

.rp-boardwrap {
  position: relative; flex: 1 1 auto; min-height: 220px;
  width: 100%; max-width: 960px; margin: 0 auto;
}
.rp-board {
  position: absolute; inset: 0; display: block; width: 100%; height: 100%;
  touch-action: manipulation;
}
.rp-root svg [role="button"] { outline: none; }
.rp-root svg [role="button"]:focus-visible .rp-btn-plate { stroke-width: 3.2; }
.rp-root svg [role="button"]:focus-visible .rp-focus-ring { opacity: 1; }

.rp-hint {
  position: absolute; left: 0; right: 0; bottom: 0; text-align: center;
  font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
  color: ${COLORS.muted}; pointer-events: none;
}

/* --- radial cluster ------------------------------------------------- */
.rp-btn { cursor: pointer; }
.rp-btn .rp-btn-body {
  transform-box: fill-box; transform-origin: center;
  animation: rp-bloom 260ms cubic-bezier(.2,1.5,.4,1) backwards;
}
.rp-btn:hover .rp-btn-plate { fill-opacity: 0.4; }
.rp-btn:focus-visible { outline: none; }
.rp-btn:focus-visible .rp-btn-plate { stroke-width: 3; }
.rp-btn.rp-off { cursor: not-allowed; opacity: 0.4; }
.rp-spoke {
  stroke-dasharray: 90; stroke-dashoffset: 90;
  animation: rp-spoke 320ms ease-out forwards;
}
@keyframes rp-bloom { from { transform: scale(0.25); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes rp-spoke { to { stroke-dashoffset: 0; } }

.rp-pulse { animation: rp-pulse 2.4s ease-in-out infinite; }
@keyframes rp-pulse { 0%,100% { opacity: 0.25; } 50% { opacity: 0.8; } }
.rp-march { animation: rp-march 1.6s linear infinite; }
@keyframes rp-march { to { stroke-dashoffset: -28; } }

/* --- timeline ------------------------------------------------------- */
.rp-timeline { display: flex; flex-direction: column; gap: 8px; flex: 0 0 auto; }
.rp-slots { display: flex; gap: 6px; touch-action: none; position: relative; }
.rp-slot {
  flex: 1 1 0; min-width: 0; position: relative;
  border: 1px solid rgba(122,190,214,0.2); border-radius: 3px;
  background: linear-gradient(180deg, rgba(20,32,46,0.85), rgba(8,13,22,0.85));
  padding: 6px 6px 7px; display: flex; flex-direction: column; align-items: center;
  gap: 3px; cursor: pointer; transition: border-color 160ms, box-shadow 160ms;
}
.rp-slot.rp-focus {
  border-color: var(--rp-focus);
  box-shadow: 0 0 0 1px rgba(244,201,122,0.25), 0 0 18px -6px rgba(244,201,122,0.8);
}
.rp-slot.rp-past { opacity: 0.62; }
.rp-slot-name {
  font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: ${COLORS.muted};
}
.rp-slot.rp-focus .rp-slot-name { color: var(--rp-focus); }
.rp-slot-chip {
  display: flex; align-items: center; gap: 5px; height: 26px;
  font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
}
.rp-slot-empty {
  height: 26px; display: flex; align-items: center; font-size: 10px;
  letter-spacing: 0.14em; color: rgba(214,233,242,0.22); text-transform: uppercase;
}
.rp-x {
  position: absolute; top: -7px; right: -7px; width: 22px; height: 22px;
  border-radius: 50%; border: 1px solid rgba(255,125,106,0.55);
  background: #120a0a; color: ${COLORS.enemy}; font-size: 11px; line-height: 1;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  padding: 0;
}
.rp-x:hover { background: #2a1210; }

.rp-track {
  position: relative; height: 34px; touch-action: none; cursor: ew-resize;
}
.rp-track-inner { position: absolute; left: 14px; right: 14px; top: 0; bottom: 0; }
.rp-track-line {
  position: absolute; left: 0; right: 0; top: 16px; height: 1px;
  background: linear-gradient(90deg, rgba(122,190,214,0.12), rgba(122,190,214,0.4), rgba(122,190,214,0.12));
}
.rp-track-fill { position: absolute; left: 0; top: 16px; height: 1px; background: var(--rp-focus); box-shadow: 0 0 10px rgba(244,201,122,0.9); }
.rp-notch { position: absolute; top: 12px; width: 1px; height: 9px; background: rgba(122,190,214,0.35); transform: translateX(-0.5px); }
.rp-notch-label {
  position: absolute; top: 20px; font-size: 8.5px; letter-spacing: 0.16em;
  color: ${COLORS.muted}; transform: translateX(-50%); white-space: nowrap;
}
.rp-head-handle {
  position: absolute; top: 0; width: 34px; height: 34px; margin-left: -17px;
  display: flex; align-items: center; justify-content: center;
}
.rp-head-handle i {
  display: block; width: 3px; height: 22px; border-radius: 2px;
  background: var(--rp-focus); box-shadow: 0 0 14px 1px rgba(244,201,122,0.75);
}

.rp-actions { display: flex; gap: 8px; align-items: stretch; }
.rp-commit {
  flex: 1 1 auto; border: 1px solid var(--rp-focus); border-radius: 3px;
  background: linear-gradient(180deg, rgba(244,201,122,0.16), rgba(244,201,122,0.05));
  color: var(--rp-focus); padding: 12px 8px; font-size: 10.5px; letter-spacing: 0.16em;
  text-transform: uppercase; cursor: pointer; transition: filter 140ms, transform 80ms;
  min-height: 46px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rp-commit:hover:not(:disabled) { filter: brightness(1.35); }
.rp-commit:active:not(:disabled) { transform: translateY(1px); }
.rp-commit:disabled {
  border-color: rgba(122,190,214,0.18); color: rgba(214,233,242,0.28);
  background: rgba(255,255,255,0.02); cursor: not-allowed;
}
.rp-ghostbtn {
  border: 1px solid rgba(122,190,214,0.3); border-radius: 3px; background: transparent;
  color: ${COLORS.text}; padding: 12px 14px; font-size: 11px; letter-spacing: 0.18em;
  text-transform: uppercase; cursor: pointer; min-height: 44px;
}
.rp-ghostbtn:hover { border-color: rgba(122,190,214,0.7); background: rgba(122,190,214,0.07); }

@media (min-width: 720px) {
  .rp-root { padding: 16px 20px 20px; }
  .rp-timeline { max-width: 860px; width: 100%; margin: 0 auto; }
  .rp-head { max-width: 860px; width: 100%; margin: 0 auto; font-size: 11px; }
}
@media (prefers-reduced-motion: reduce) {
  .rp-root * { animation-duration: 1ms !important; animation-iteration-count: 1 !important; }
}
`
