/** Cold, high-contrast console identity: hairline rules, monospace numerals. */
export const C = {
  bg: '#05080c',
  deep: '#080d13',
  panel: '#0b1219',
  raised: '#0f1922',
  line: '#17242f',
  lineHot: '#24394a',
  dim: '#4f6878',
  text: '#8fabbd',
  bright: '#e4f2fb',
  plr: '#46e0c0',
  plrDeep: '#0c3a35',
  enm: '#ff6a4d',
  enmDeep: '#43140c',
  warn: '#f2c14e',
} as const

export const MONO =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"

export const CSS = `
.tc-root{
  --bg:${C.bg}; --deep:${C.deep}; --panel:${C.panel}; --raised:${C.raised};
  --line:${C.line}; --lineHot:${C.lineHot}; --dim:${C.dim}; --text:${C.text};
  --bright:${C.bright}; --plr:${C.plr}; --enm:${C.enm}; --warn:${C.warn};
  font-family:${MONO};
  background:var(--bg);
  color:var(--text);
  font-size:12px;
  line-height:1.35;
  font-variant-numeric:tabular-nums;
  -webkit-font-smoothing:antialiased;
  min-height:100%;
  display:flex;
  flex-direction:column;
  position:relative;
  isolation:isolate;
}
.tc-root *{box-sizing:border-box;}
.tc-root::before{
  content:'';position:absolute;inset:0;pointer-events:none;z-index:0;
  background:
    repeating-linear-gradient(0deg, rgba(120,190,220,.035) 0 1px, transparent 1px 3px);
  opacity:.5;
}
.tc-root > *{position:relative;z-index:1;}

/* ── header ─────────────────────────────────────────────── */
.tc-head{
  display:flex;align-items:stretch;gap:0;
  border-bottom:1px solid var(--lineHot);
  background:linear-gradient(180deg,#0c151d,#070c11);
  flex-wrap:wrap;
}
.tc-head-cell{
  padding:7px 10px;border-right:1px solid var(--line);
  display:flex;flex-direction:column;gap:2px;justify-content:center;
}
.tc-head-cell:last-child{border-right:none;}
.tc-head-grow{flex:1;min-width:0;}
.tc-head-phase{min-width:168px;}
.tc-k{font-size:9px;letter-spacing:.14em;color:var(--dim);text-transform:uppercase;}
.tc-v{font-size:12px;letter-spacing:.06em;color:var(--bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.tc-pips{display:flex;gap:3px;align-items:center;}
.tc-pip{width:14px;height:9px;border:1px solid var(--lineHot);background:transparent;}
.tc-pip.on{background:var(--plr);border-color:var(--plr);box-shadow:0 0 7px rgba(70,224,192,.55);}
.tc-pip.done{background:var(--lineHot);}
.tc-phase{color:var(--warn);}
.tc-phase.set{color:var(--plr);}
.tc-phase.live{animation:tc-blink 1s steps(2,end) infinite;}
@keyframes tc-blink{50%{opacity:.25}}

/* ── body layout ───────────────────────────────────────── */
.tc-body{display:flex;align-items:stretch;flex:1;min-height:0;}
.tc-stage{
  flex:1;min-width:0;padding:10px;
  background:
    radial-gradient(ellipse at 50% 42%, #0d1720 0%, #05080c 72%);
  border-right:1px solid var(--lineHot);
  display:flex;flex-direction:column;gap:8px;
}
.tc-stage-rail{display:flex;justify-content:space-between;gap:8px;font-size:9px;letter-spacing:.14em;color:var(--dim);text-transform:uppercase;}
.tc-boardwrap{
  position:relative;flex:1;min-height:0;align-self:center;
  width:100%;max-width:min(100%, 94vh);
  display:flex;align-items:center;justify-content:center;
}
.tc-board{display:block;width:100%;height:auto;}

.tc-panel{
  width:338px;flex:0 0 338px;background:var(--panel);
  display:flex;flex-direction:column;min-height:0;
}
/* column, so the doctrine card can be pinned to the foot of the panel and the
   space freed by the old forecast table reads as deliberate rather than empty */
.tc-panel-scroll{overflow-y:auto;flex:1;min-height:0;display:flex;flex-direction:column;}
.tc-panel-scroll > .tc-sect.tc-wide{margin-top:auto;}
.tc-sect{
  padding:5px 9px;border-bottom:1px solid var(--lineHot);border-top:1px solid var(--lineHot);
  background:var(--deep);
  font-size:9px;letter-spacing:.2em;color:var(--dim);text-transform:uppercase;
  display:flex;justify-content:space-between;align-items:center;
}
.tc-sect:first-child{border-top:none;}

/* ── unit card ─────────────────────────────────────────── */
.tc-card{border-bottom:1px solid var(--line);padding:8px 9px 9px;position:relative;}
.tc-card.sel{background:var(--raised);}
.tc-card.sel::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--accent);}
.tc-card-top{display:flex;align-items:baseline;gap:6px;cursor:pointer;}
.tc-tag{font-size:12px;letter-spacing:.08em;color:var(--accent);font-weight:700;}
.tc-name{font-size:10px;color:var(--dim);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tc-chip{
  font-size:9px;letter-spacing:.1em;padding:1px 5px;border:1px solid currentColor;
  white-space:nowrap;
}
.tc-chip.ok{color:var(--plr);}
.tc-chip.wait{color:var(--warn);}
.tc-chip.auto{color:var(--dim);}

.tc-stats{
  display:grid;grid-template-columns:repeat(5,1fr);gap:1px;margin-top:7px;
  background:var(--line);border:1px solid var(--line);
}
.tc-stat{background:var(--deep);padding:3px 4px;display:flex;flex-direction:column;gap:1px;}
.tc-stat b{font-size:12px;color:var(--bright);font-weight:600;}
.tc-stat.hurt b{color:var(--enm);}
.tc-stat span{font-size:8px;letter-spacing:.1em;color:var(--dim);}

.tc-slots{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:7px;}
.tc-slot{
  position:relative;border:1px solid var(--line);background:#070d12;
  padding:3px 4px 5px;text-align:left;cursor:pointer;color:inherit;font:inherit;
  display:flex;flex-direction:column;gap:1px;min-height:46px;
  transition:border-color .12s, background .12s;
}
.tc-slot:disabled{cursor:default;}
.tc-slot-k{font-size:8px;letter-spacing:.16em;color:var(--dim);}
.tc-slot-v{font-size:13px;letter-spacing:.04em;color:var(--bright);display:flex;align-items:center;gap:4px;}
.tc-slot-v.empty{color:#2c414f;}
.tc-slot.filled{background:#0b1a1d;border-color:var(--accent);}
.tc-slot.focus{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);background:#0d1b22;}
.tc-slot.focus .tc-slot-k{color:var(--accent);}
.tc-slot.live{border-color:var(--warn);box-shadow:0 0 0 1px var(--warn), 0 0 12px rgba(242,193,78,.25);}
.tc-slot.past{opacity:.42;}
.tc-x{
  position:absolute;top:0;right:0;width:15px;height:15px;line-height:13px;text-align:center;
  border:none;border-left:1px solid var(--line);border-bottom:1px solid var(--line);
  background:#0e1a22;color:var(--dim);font:inherit;font-size:10px;cursor:pointer;padding:0;
}
.tc-x:hover{color:var(--enm);background:#1b1210;}

.tc-pad{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:6px;}
.tc-btn{
  border:1px solid var(--lineHot);background:#0d1821;color:var(--text);
  font:inherit;font-size:11px;letter-spacing:.06em;padding:6px 2px;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;gap:2px;
  transition:background .12s,border-color .12s,color .12s;
}
.tc-btn small{font-size:8px;letter-spacing:.08em;color:var(--dim);}
.tc-btn:hover:not(:disabled){background:#14242f;border-color:var(--accent);color:var(--bright);}
.tc-btn:active:not(:disabled){background:var(--accent);color:#04100e;}
.tc-btn:disabled{opacity:.3;cursor:default;}
.tc-cardfoot{display:flex;gap:6px;margin-top:6px;align-items:center;}
.tc-mini{
  border:1px solid var(--line);background:transparent;color:var(--dim);
  font:inherit;font-size:9px;letter-spacing:.14em;padding:3px 7px;cursor:pointer;
}
.tc-mini:hover:not(:disabled){color:var(--enm);border-color:var(--enm);}
.tc-mini:disabled{opacity:.3;cursor:default;}
.tc-hint{font-size:9px;letter-spacing:.08em;color:var(--dim);flex:1;text-align:right;}

.tc-read{padding:7px 9px;display:flex;flex-direction:column;gap:3px;}
.tc-readrow{display:flex;align-items:baseline;gap:6px;font-size:10px;letter-spacing:.06em;}
.tc-readrow > i{font-style:normal;color:var(--dim);font-size:9px;letter-spacing:.12em;white-space:nowrap;}
.tc-readrow > u{flex:1;border-bottom:1px dotted var(--line);text-decoration:none;transform:translateY(-3px);}
.tc-readrow > b{font-weight:600;color:var(--bright);white-space:nowrap;}
.tc-readrow.ok > b{color:var(--plr);}
.tc-readrow.warn > b{color:var(--warn);}
.tc-readrow.hot > b{color:var(--enm);}

/* ── order matrix: roster, status and selector in one block ── */
.tc-plan{padding:8px 9px 10px;display:flex;flex-direction:column;gap:5px;}
.tc-mrow{
  display:grid;grid-template-columns:62px repeat(3,1fr) 30px;gap:3px;align-items:stretch;
  position:relative;padding-left:4px;
}
.tc-mrow.sel{background:var(--raised);box-shadow:inset 0 0 0 1px var(--line);}
.tc-mrow.sel::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--accent);}
.tc-mrow.head{color:var(--dim);}
.tc-mtag{
  border:none;background:none;font:inherit;font-size:10px;letter-spacing:.06em;
  color:var(--accent);display:flex;align-items:center;gap:4px;padding:0;cursor:pointer;
  text-align:left;min-width:0;
}
.tc-mrow.head .tc-mtag{color:var(--dim);font-size:8px;letter-spacing:.16em;cursor:default;}
.tc-dot{width:6px;height:6px;flex:0 0 6px;border:1px solid var(--warn);background:transparent;}
.tc-dot.part{background:var(--warn);opacity:.55;}
.tc-dot.armed{border-color:var(--plr);background:var(--plr);}
.tc-cell{
  font:inherit;font-size:10px;letter-spacing:.04em;text-align:center;padding:4px 0;
  border:1px solid var(--line);background:#070d12;color:var(--bright);cursor:pointer;
  transition:border-color .12s,background .12s,color .12s;
}
.tc-cell.none{color:#2c414f;}
.tc-cell.filled{color:var(--accent);border-color:#1d3441;}
.tc-cell.focus{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);background:#0d1b22;}
.tc-cell.live{border-color:var(--warn);color:var(--warn);background:#191305;}
.tc-cell.past{opacity:.4;}
.tc-cell:disabled{cursor:default;}
.tc-mrow.head .tc-cell{border-color:transparent;background:transparent;color:var(--dim);font-size:8px;letter-spacing:.16em;padding:2px 0;}
.tc-mcount{font-size:9px;letter-spacing:.02em;color:var(--dim);display:flex;align-items:center;justify-content:flex-end;}
.tc-mcount.part{color:var(--warn);}
.tc-mcount.armed{color:var(--plr);}
.tc-mrow.head .tc-mcount{font-size:8px;letter-spacing:.1em;}
.tc-empty{padding:9px;font-size:9px;letter-spacing:.12em;color:var(--dim);}

.tc-legend{padding:7px 9px 11px;display:flex;flex-direction:column;gap:3px;}
.tc-legendrow{display:grid;grid-template-columns:70px 1fr;gap:6px;font-size:9px;letter-spacing:.06em;}
.tc-legendrow > i{font-style:normal;color:var(--text);letter-spacing:.1em;}
.tc-legendrow > span{color:var(--dim);}

.tc-step{
  border:1px solid var(--line);background:#0b141b;color:var(--dim);font:inherit;
  font-size:12px;line-height:1;padding:2px 6px;cursor:pointer;
}
.tc-step:hover:not(:disabled){color:var(--accent);border-color:var(--accent);}
.tc-step:disabled{opacity:.35;cursor:default;}
.tc-mini.go{color:var(--plr);border-color:#1c4a44;}
.tc-mini.go:hover:not(:disabled){color:#041310;background:var(--plr);border-color:var(--plr);}

/* ── commit bar ────────────────────────────────────────── */
.tc-foot{
  border-top:1px solid var(--lineHot);background:linear-gradient(0deg,#0c151d,#070c11);
  padding:8px;display:flex;gap:8px;align-items:center;
}
.tc-foot-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}
.tc-commit{
  border:1px solid var(--plr);background:#0a2a26;color:var(--plr);
  font:inherit;font-size:12px;letter-spacing:.18em;font-weight:700;
  padding:10px 18px;cursor:pointer;white-space:nowrap;
  transition:background .14s,box-shadow .14s;
}
.tc-commit:hover:not(:disabled){background:var(--plr);color:#041310;box-shadow:0 0 18px rgba(70,224,192,.4);}
.tc-commit:disabled{border-color:var(--line);background:#0a1016;color:#33485a;cursor:not-allowed;letter-spacing:.18em;}

/* ── board bits ────────────────────────────────────────── */
.tc-tok{transition:transform 520ms cubic-bezier(.4,0,.22,1);cursor:pointer;}
.tc-rot{transition:transform 520ms cubic-bezier(.4,0,.22,1);}
/* SVG: transform-origin resolves against the whole viewBox unless the box is
   switched to the element itself — without this, every scale() drifts. */
.tc-float,.tc-floatd,.tc-burst,.tc-scan,.tc-blocked{transform-box:fill-box;transform-origin:center;}
/* fill-mode both, not forwards: staggered beats stay hidden through their delay. */
.tc-float{animation:tc-float 820ms ease-out both;}
@keyframes tc-float{
  0%{opacity:0;transform:translateY(5px) scale(.7)}
  18%{opacity:1;transform:translateY(-2px) scale(1.12)}
  100%{opacity:0;transform:translateY(-20px) scale(1)}
}
.tc-floatd{animation:tc-floatd 820ms ease-out both;}
@keyframes tc-floatd{
  0%{opacity:0;transform:translateY(-5px) scale(.7)}
  18%{opacity:1;transform:translateY(2px) scale(1.12)}
  100%{opacity:0;transform:translateY(20px) scale(1)}
}
.tc-edge{animation:tc-edge 820ms ease-out both;}
@keyframes tc-edge{
  0%{opacity:0}
  16%{opacity:1}
  100%{opacity:0}
}
.tc-burst{animation:tc-burst 820ms ease-out both;}
@keyframes tc-burst{
  0%{opacity:0;transform:scale(.3) rotate(-25deg)}
  20%{opacity:1;transform:scale(1) rotate(0deg)}
  100%{opacity:0;transform:scale(1.28) rotate(12deg)}
}
.tc-scan{animation:tc-scan 760ms ease-out forwards;}
@keyframes tc-scan{
  0%{opacity:.85;transform:scale(.4)}
  100%{opacity:0;transform:scale(1.35)}
}
.tc-blocked{animation:tc-blocked 620ms ease-out both;}
@keyframes tc-blocked{
  0%{opacity:0;transform:translateY(4px) scale(.85)}
  22%{opacity:1;transform:translateY(0) scale(1)}
  70%{opacity:1}
  100%{opacity:0;transform:translateY(-3px)}
}
.tc-shake{animation:tc-shake 400ms ease-in-out;}
@keyframes tc-shake{
  0%,100%{transform:translate(0,0)}
  20%{transform:translate(1.6px,-1.2px)}
  45%{transform:translate(-1.8px,1px)}
  70%{transform:translate(1.1px,1.4px)}
}

/* ── phone ─────────────────────────────────────────────── */
@media (max-width:880px){
  /* phone: the board never leaves the screen — it pins under the header while
     the order console scrolls beneath it, and the commit bar pins to the base. */
  .tc-head{position:sticky;top:0;z-index:6;height:44px;}
  .tc-head-cell{padding:5px 8px;}
  .tc-head-phase{min-width:132px;}
  .tc-body{flex-direction:column;}
  .tc-stage{
    position:sticky;top:44px;z-index:5;
    border-right:none;border-bottom:1px solid var(--lineHot);padding:6px 8px 7px;
  }
  .tc-stage-rail.foot{display:none;}
  .tc-boardwrap{max-width:min(100%, 44vh);}
  .tc-panel{width:auto;flex:1 1 auto;}
  .tc-panel-scroll{overflow-y:visible;}
  .tc-foot{position:sticky;bottom:0;z-index:6;padding:7px 8px;}
  .tc-foot .tc-v{font-size:10px;}
  .tc-commit{padding:11px 12px;font-size:11px;letter-spacing:.1em;}

  .tc-wide{display:none;}
  /* every row loses a pixel or two so the order pad clears the commit bar */
  .tc-sect{padding:4px 8px;}
  .tc-plan{padding:6px 8px 7px;gap:4px;}
  .tc-mrow{grid-template-columns:58px repeat(3,1fr) 28px;}
  .tc-cell{padding:3px 0;}
  .tc-card{padding:6px 8px 8px;}
  .tc-stats,.tc-slots{margin-top:5px;}
  .tc-slot{min-height:40px;}
  .tc-pad{margin-top:5px;}
  .tc-btn{padding:5px 2px;}
}
`
