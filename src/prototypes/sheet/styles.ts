import { BOARD_RATIO } from './rules'
import { SHEET_HEIGHT, T } from './theme'

/** One stylesheet for the prototype, injected by the root component. */
export const SHEET_CSS = `
.sh-root {
  --sheet-h: ${SHEET_HEIGHT}px;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
  background:
    radial-gradient(120% 70% at 50% 0%, ${T.tableGlow} 0%, ${T.table} 62%),
    ${T.table};
  color: ${T.cream};
  font-family: ${T.sans};
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.sh-column {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  overflow: hidden;
}

/* ---------- header ---------- */
.sh-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px 6px;
  flex: none;
}
.sh-round {
  font-family: ${T.serif};
  font-size: 20px;
  letter-spacing: 0.04em;
  color: ${T.parchment};
}
.sh-round small {
  display: block;
  font-family: ${T.sans};
  font-size: 9.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: ${T.inkFaint};
  margin-bottom: 2px;
}
.sh-phase {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 11px;
  border-radius: 999px;
  border: 1px solid rgba(232, 192, 106, 0.32);
  background: rgba(192, 138, 36, 0.12);
  color: ${T.goldSoft};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.sh-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: ${T.goldSoft};
  animation: sh-breathe 1.8s ease-in-out infinite;
}
.sh-reset {
  border: 1px solid rgba(249, 242, 224, 0.16);
  background: rgba(249, 242, 224, 0.05);
  color: ${T.inkFaint};
  border-radius: 999px;
  padding: 7px 11px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}
.sh-reset:active { transform: scale(0.94); }

/* ---------- board ---------- */
.sh-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px 4px 4px;
  transition: padding-bottom 460ms cubic-bezier(0.22, 1, 0.36, 1);
}
.sh-slab {
  position: relative;
  aspect-ratio: ${BOARD_RATIO.toFixed(4)};
  border-radius: 16px;
  padding: 4px;
  transition: width 460ms cubic-bezier(0.22, 1, 0.36, 1);
  background:
    radial-gradient(120% 120% at 20% 0%, #f2e3c4 0%, ${T.slab} 55%, #d9c49b 100%);
  box-shadow:
    0 26px 44px -20px rgba(0, 0, 0, 0.85),
    0 2px 0 rgba(255, 255, 255, 0.35) inset,
    0 0 0 1px rgba(43, 31, 22, 0.45);
}
.sh-slab svg { display: block; width: 100%; height: 100%; overflow: visible; }
.sh-slab-clash { animation: sh-clash-glow 620ms ease-out; }
.sh-hit { cursor: pointer; }

.sh-token-shift { transition: transform 640ms cubic-bezier(0.34, 1.2, 0.5, 1); }
.sh-token-turn { transition: transform 560ms cubic-bezier(0.34, 1.3, 0.5, 1); }
.sh-ants { animation: sh-ants 1s linear infinite; }
.sh-pulse { animation: sh-pulse 1.9s ease-in-out infinite; transform-origin: center; }
.sh-halo { animation: sh-halo 2.4s ease-in-out infinite; }
.sh-shake { animation: sh-shake 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97); }
.sh-quiet { animation: sh-ghost-in 260ms cubic-bezier(0.22, 1, 0.36, 1); }
.sh-burst { animation: sh-burst 620ms cubic-bezier(0.2, 0.9, 0.3, 1) forwards; }
.sh-float { animation: sh-float 1100ms cubic-bezier(0.2, 0.8, 0.3, 1) forwards; }
.sh-ghost-in { animation: sh-ghost-in 260ms cubic-bezier(0.22, 1, 0.36, 1); }


/* ---------- bottom bar ---------- */
.sh-bar {
  flex: none;
  padding: 6px 10px calc(10px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: opacity 260ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}
.sh-bar-hidden { opacity: 0; transform: translateY(18px); pointer-events: none; }
.sh-chips { display: flex; gap: 7px; }
.sh-chip {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
  border-radius: 14px;
  border: 1px solid rgba(249, 242, 224, 0.12);
  background: rgba(249, 242, 224, 0.05);
  color: ${T.parchment};
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: transform 160ms ease, background 200ms ease, border-color 200ms ease;
}
.sh-chip:active { transform: scale(0.97); }
.sh-chip-body { min-width: 0; flex: 1; }
.sh-chip b { display: block; font-size: 13.5px; letter-spacing: 0.01em; }
.sh-chip em { font-style: normal; font-size: 10.5px; color: ${T.inkFaint}; }
.sh-chip-need { border-color: rgba(232, 192, 106, 0.45); background: rgba(192, 138, 36, 0.13); }
.sh-chip-need em { color: ${T.goldSoft}; }
.sh-chip-badge {
  width: 26px; height: 26px; border-radius: 9px; flex: none;
  display: grid; place-items: center;
  font-family: ${T.serif};
  font-size: 13px;
  color: ${T.cream};
  box-shadow: 0 0 0 1px rgba(249,242,224,0.22) inset;
}
.sh-chip-pips { display: flex; gap: 4px; flex: none; }
.sh-chip-pips i, .sh-rail-pips i {
  display: block;
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(249, 242, 224, 0.18);
  transition: background 200ms ease, box-shadow 200ms ease;
}
.sh-chip-pips i.sh-on { background: ${T.goldSoft}; box-shadow: 0 0 6px rgba(232,192,106,0.6); }
.sh-foe {
  display: flex; align-items: center; gap: 8px;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${T.inkFaint};
  padding: 0 3px;
}
.sh-foe-swatch { width: 8px; height: 8px; border-radius: 50%; flex: none; }

.sh-commit {
  width: 100%;
  border: 0;
  border-radius: 16px;
  padding: 13px 18px;
  font-family: ${T.serif};
  font-size: 17px;
  letter-spacing: 0.06em;
  color: #22170c;
  background: linear-gradient(180deg, #f0c063 0%, ${T.gold} 100%);
  box-shadow: 0 12px 24px -12px rgba(192, 138, 36, 0.9), 0 2px 0 rgba(255,255,255,0.4) inset;
  cursor: pointer;
  transition: transform 140ms ease, filter 200ms ease, opacity 200ms ease;
}
.sh-commit:active:not(:disabled) { transform: scale(0.975); filter: brightness(1.05); }
.sh-commit:disabled {
  cursor: not-allowed;
  color: rgba(249, 242, 224, 0.4);
  background: rgba(249, 242, 224, 0.07);
  box-shadow: 0 0 0 1px rgba(249, 242, 224, 0.1) inset;
}
.sh-commit-ready { animation: sh-ready 2.6s ease-in-out infinite; }
/* ---------- sheet ---------- */
.sh-sheet {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  min-height: var(--sheet-h);
  max-height: 86%;
  max-width: 560px;
  margin: 0 auto;
  border-radius: 28px 28px 0 0;
  background: linear-gradient(180deg, #f6ead2 0%, ${T.parchment} 26%, ${T.parchmentDeep} 100%);
  color: ${T.ink};
  box-shadow: 0 -22px 50px -18px rgba(0, 0, 0, 0.85), 0 -1px 0 rgba(255,255,255,0.6) inset;
  display: flex;
  flex-direction: column;
  padding: 0 12px calc(12px + env(safe-area-inset-bottom, 0px));
  animation: sh-rise 400ms cubic-bezier(0.22, 1.04, 0.36, 1);
  overflow: hidden;
}
.sh-sheet-out { animation: sh-fall 260ms cubic-bezier(0.4, 0, 1, 1) forwards; }
.sh-grip {
  margin: 3px auto 0;
  width: 96px; height: 15px;
  border: 0; padding: 0; background: none;
  display: grid; place-items: center;
  flex: none;
  cursor: pointer;
}
.sh-grip::before {
  content: '';
  display: block;
  width: 52px; height: 5px; border-radius: 999px;
  background: rgba(43, 31, 22, 0.22);
  transition: background 180ms ease, width 180ms ease;
}
.sh-grip:active::before { background: rgba(43, 31, 22, 0.42); width: 42px; }
/* the roster rail: all three companies, their pips, and one tap to switch */
.sh-rail { display: flex; align-items: stretch; gap: 6px; flex: none; padding: 1px 0 0; }
.sh-rail-tab {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 5px 7px;
  border-radius: 13px;
  border: 1px solid rgba(43, 31, 22, 0.14);
  background: rgba(43, 31, 22, 0.05);
  color: ${T.inkSoft};
  cursor: pointer;
  transition: background 200ms ease, border-color 200ms ease, transform 150ms ease, color 200ms ease;
}
.sh-rail-tab:active { transform: scale(0.97); }
.sh-rail-badge {
  width: 22px; height: 22px; border-radius: 7px; flex: none;
  display: grid; place-items: center;
  font-family: ${T.serif}; font-size: 12.5px;
  color: ${T.cream};
  background: linear-gradient(160deg, ${T.player} 0%, ${T.playerDeep} 100%);
  box-shadow: 0 0 0 1px rgba(43,31,22,0.2);
}
.sh-rail-top { display: flex; align-items: center; gap: 6px; min-width: 0; }
.sh-rail-name {
  font-size: 14px; font-weight: 700; letter-spacing: 0.01em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sh-rail-pips { display: flex; gap: 4px; flex: none; }
.sh-rail-pips i { background: rgba(43, 31, 22, 0.18); }
.sh-rail-pips i.sh-on { background: ${T.gold}; box-shadow: 0 0 0 1px rgba(43,31,22,0.16); }
.sh-rail-on {
  background: linear-gradient(180deg, #fffaef 0%, #f2e5c8 100%);
  border-color: rgba(43, 31, 22, 0.3);
  color: ${T.ink};
  box-shadow: 0 6px 14px -10px rgba(43,31,22,0.9), 0 1px 0 rgba(255,255,255,0.9) inset;
}
.sh-rail-need {
  border-color: rgba(192, 138, 36, 0.6);
  background: rgba(192, 138, 36, 0.12);
  animation: sh-rail-wait 2.4s ease-in-out infinite;
}
.sh-rail-dead { opacity: 0.4; cursor: not-allowed; }

.sh-slots { display: flex; gap: 8px; flex: none; margin-top: 8px; }
.sh-slot {
  flex: 1;
  position: relative;
  min-height: 62px;
  border-radius: 16px;
  border: 2px dashed rgba(43, 31, 22, 0.2);
  background: rgba(43, 31, 22, 0.035);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 3px;
  padding: 6px 4px;
  cursor: pointer;
  transition: transform 180ms cubic-bezier(0.34, 1.4, 0.5, 1), border-color 200ms ease, background 220ms ease, box-shadow 220ms ease;
}
.sh-slot-label {
  font-size: 9.5px; letter-spacing: 0.2em; text-transform: uppercase; color: ${T.inkFaint};
}
.sh-slot-active {
  border-color: ${T.gold};
  background: rgba(192, 138, 36, 0.14);
  box-shadow: 0 0 0 4px rgba(192, 138, 36, 0.14);
}
.sh-slot-active .sh-slot-label { color: #8a6417; }
.sh-slot-filled {
  border-style: solid;
  border-color: rgba(43, 31, 22, 0.18);
  background: linear-gradient(180deg, #fdf6e6 0%, #f3e6cb 100%);
  box-shadow: 0 8px 14px -10px rgba(43, 31, 22, 0.7), 0 1px 0 rgba(255,255,255,0.8) inset;
}
.sh-slot-pop { animation: sh-pop 340ms cubic-bezier(0.3, 1.5, 0.5, 1); }
.sh-slot-name { font-size: 11.5px; font-weight: 650; color: ${T.ink}; letter-spacing: 0.01em; }
.sh-slot-x {
  position: absolute; top: -9px; right: -7px;
  width: 30px; height: 30px; border-radius: 50%;
  border: 1px solid rgba(43,31,22,0.18);
  background: ${T.cream};
  color: ${T.inkSoft};
  display: grid; place-items: center;
  font-size: 15px; line-height: 1;
  cursor: pointer;
  box-shadow: 0 4px 10px -4px rgba(0,0,0,0.5);
}
.sh-slot-x:active { transform: scale(0.88); }

.sh-orders {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  flex: none;
  margin-top: 9px;
}
.sh-order {
  display: flex; align-items: center; gap: 11px;
  min-height: 58px;
  padding: 9px 11px;
  border-radius: 15px;
  border: 1px solid rgba(43, 31, 22, 0.14);
  background: linear-gradient(180deg, #fffaf0 0%, #f4e8ce 100%);
  box-shadow: 0 8px 16px -12px rgba(43, 31, 22, 0.85), 0 1px 0 rgba(255,255,255,0.9) inset;
  color: ${T.ink};
  font-size: 13.5px;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 200ms ease, opacity 200ms ease;
}
.sh-order:active:not(:disabled) { transform: scale(0.96) translateY(1px); box-shadow: 0 3px 8px -6px rgba(43,31,22,0.9) inset; }
.sh-order:disabled { opacity: 0.35; cursor: not-allowed; }
.sh-order-glyph {
  width: 36px; height: 36px; border-radius: 11px; flex: none;
  display: grid; place-items: center;
  background: rgba(43, 31, 22, 0.07);
}
.sh-order small { display: block; font-weight: 500; font-size: 10.5px; color: ${T.inkSoft}; margin-top: 1px; }
.sh-sheet-foot { margin-top: auto; padding-top: 9px; display: flex; gap: 10px; align-items: center; flex: none; }
.sh-clear {
  flex: none;
  border: 1px solid rgba(43, 31, 22, 0.18);
  background: transparent;
  color: ${T.inkSoft};
  border-radius: 15px;
  padding: 14px 14px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}
.sh-clear:disabled { opacity: 0.35; cursor: not-allowed; }
.sh-note {
  font-size: 11.5px;
  color: ${T.inkSoft};
  line-height: 1.45;
  background: rgba(43,31,22,0.05);
  border-radius: 12px;
  padding: 11px 13px;
  margin-top: 12px;
}

@keyframes sh-rise {
  from { transform: translateY(102%); }
  to { transform: translateY(0); }
}
@keyframes sh-fall {
  from { transform: translateY(0); }
  to { transform: translateY(102%); }
}
@keyframes sh-pop {
  0% { transform: scale(0.82); }
  60% { transform: scale(1.06); }
  100% { transform: scale(1); }
}
@keyframes sh-ants { to { stroke-dashoffset: -12; } }
@keyframes sh-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.97); }
  50% { opacity: 1; transform: scale(1.03); }
}
@keyframes sh-halo {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.85; }
}
@keyframes sh-breathe { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
@keyframes sh-rail-wait {
  0%, 100% { box-shadow: 0 0 0 0 rgba(192, 138, 36, 0); }
  50% { box-shadow: 0 0 0 3px rgba(192, 138, 36, 0.18); }
}
@keyframes sh-ready {
  0%, 100% { box-shadow: 0 12px 24px -12px rgba(192, 138, 36, 0.9), 0 2px 0 rgba(255,255,255,0.4) inset; }
  50% { box-shadow: 0 12px 30px -8px rgba(240, 192, 99, 0.95), 0 2px 0 rgba(255,255,255,0.55) inset; }
}
@keyframes sh-shake {
  10%, 90% { transform: translate(-1.1px, 0); }
  20%, 80% { transform: translate(1.8px, 0.5px); }
  30%, 50%, 70% { transform: translate(-2.4px, -0.6px); }
  40%, 60% { transform: translate(2.4px, 0.6px); }
}
@keyframes sh-burst {
  0% { opacity: 0; transform: scale(0.25) rotate(-12deg); }
  35% { opacity: 1; transform: scale(1.12) rotate(4deg); }
  100% { opacity: 0; transform: scale(1.5) rotate(10deg); }
}
@keyframes sh-float {
  0% { opacity: 0; transform: translateY(3px) scale(0.8); }
  25% { opacity: 1; transform: translateY(-2px) scale(1.06); }
  100% { opacity: 0; transform: translateY(-13px) scale(1); }
}
@keyframes sh-clash-glow {
  0% { box-shadow: 0 26px 44px -20px rgba(0,0,0,0.85), 0 2px 0 rgba(255,255,255,0.35) inset, 0 0 0 1px rgba(43,31,22,0.45); }
  30% { box-shadow: 0 26px 44px -20px rgba(0,0,0,0.85), 0 2px 0 rgba(255,255,255,0.35) inset, 0 0 0 4px rgba(232,192,106,0.75); }
  100% { box-shadow: 0 26px 44px -20px rgba(0,0,0,0.85), 0 2px 0 rgba(255,255,255,0.35) inset, 0 0 0 1px rgba(43,31,22,0.45); }
}
@keyframes sh-ghost-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
/* On a wider screen the board grows but the controls stay thumb-sized. */
@media (min-width: 620px) {
  .sh-column { max-width: 820px; }
  .sh-header, .sh-bar { width: 100%; max-width: 560px; margin-left: auto; margin-right: auto; }
}
@media (prefers-reduced-motion: reduce) {
  .sh-root * { animation-duration: 0.01ms !important; transition-duration: 1ms !important; }
}
`
