import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { C } from './theme'
import {
  HITS_TO_ELIMINATE,
  MAX_TURNS_PER_PHASE,
  ORDER_PHASES,
  WHEEL_GLYPH,
  canShoot,
  phaseCode,
  profileOf,
  queueState,
  turnWheel,
  turnsIn,
} from './model'
import type { OrderBook, OrderPhase, RoundOrder, UnitState } from './model'

/** What the order pad can do to the focused phase. */
export type PadAction = 'left' | 'right' | 'advance' | 'hold'

const PAD_META: Record<PadAction, { glyph: string; code: string; label: string }> = {
  left: { glyph: WHEEL_GLYPH.left, code: 'L60', label: 'TURN LEFT ONE EDGE — FREE' },
  advance: { glyph: '▲', code: 'ADV', label: 'ADVANCE ONE HEX, STRAIGHT AHEAD' },
  right: { glyph: WHEEL_GLYPH.right, code: 'R60', label: 'TURN RIGHT ONE EDGE — FREE' },
  hold: { glyph: '■', code: 'HLD', label: 'STAND FAST — NO TURNS, NO GROUND' },
}

export interface SlotFocus {
  unitId: string
  phase: OrderPhase
}

/** One line of the resolving-round log. */
export interface LogRow {
  k: string
  v: string
  tone?: 'ok' | 'warn' | 'hot'
}

export interface ConsoleProps {
  units: UnitState[]
  log: LogRow[]
  orders: OrderBook
  selectedId: string | null
  focus: SlotFocus | null
  playing: boolean
  /** The part of the order the resolution is working through, if any. */
  livePhase: OrderPhase | null
  armedCount: number
  playerCount: number
  nextUnorderedId: string | null
  onSelect: (id: string) => void
  onFocus: (focus: SlotFocus) => void
  onCycle: (delta: number) => void
  onOrder: (action: PadAction) => void
  onClearPhase: (unitId: string, phase: OrderPhase) => void
  onClearUnit: (unitId: string) => void
}

/** A round reads left to right: turns, the straight advance, then turns again. */
const PHASE_LABELS: Record<OrderPhase, string> = {
  before: 'TURN',
  advance: 'ADVANCE',
  after: 'TURN',
}

/** The matrix has less room than the card does. */
const PHASE_SHORT: Record<OrderPhase, string> = {
  before: 'TURN',
  advance: 'ADV',
  after: 'TURN',
}

/** The pad reads like the board: turns either side of the advance, hold below. */
const PAD_ROW: PadAction[] = ['left', 'advance', 'right']

function accentOf(unit: UnitState): string {
  return unit.side === 'player' ? C.plr : C.enm
}

/** Phases already resolved, so the console can grey them out during playback. */
function isPast(phase: OrderPhase, livePhase: OrderPhase | null): boolean {
  if (!livePhase) return false
  return ORDER_PHASES.indexOf(phase) < ORDER_PHASES.indexOf(livePhase)
}

/**
 * The matrix is the friendly roster: four units, three parts of an order each,
 * always on screen. It is also the only selector you need — a cell takes
 * control of that unit and points the pad at that part of its order, so you
 * never lose your place.
 */
function PlanGrid({
  units,
  orders,
  selectedId,
  focus,
  livePhase,
  playing,
  onSelect,
  onFocus,
}: {
  units: UnitState[]
  orders: OrderBook
  selectedId: string | null
  focus: SlotFocus | null
  livePhase: OrderPhase | null
  playing: boolean
  onSelect: (id: string) => void
  onFocus: (focus: SlotFocus) => void
}) {
  const rows = units
    .filter((unit) => unit.side === 'player')
    .map((unit) => {
      const order = orders[unit.id] ?? null
      const total = profileOf(unit).movement
      const state = queueState(order)
      const accent = accentOf(unit)
      return (
        <div
          className={`tc-mrow${unit.id === selectedId ? ' sel' : ''}`}
          key={unit.id}
          style={{ '--accent': accent } as CSSProperties}
        >
          <button
            type="button"
            className="tc-mtag"
            onClick={() => onSelect(unit.id)}
            aria-label={`select ${unit.tag}`}
          >
            <span className={`tc-dot ${state}`} />
            {unit.tag}
          </button>
          {ORDER_PHASES.map((phase) => {
            const live = playing && phase === livePhase
            const isFocus = !playing && focus?.unitId === unit.id && focus.phase === phase
            const classes = [
              'tc-cell',
              order ? 'filled' : 'none',
              isFocus ? 'focus' : '',
              live ? 'live' : '',
              playing && isPast(phase, livePhase) ? 'past' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={phase}
                type="button"
                className={classes}
                disabled={playing}
                onClick={() => onFocus({ unitId: unit.id, phase })}
                aria-label={`${unit.tag} ${PHASE_LABELS[phase]}${
                  order ? ` ${phaseCode(order, phase)}` : ' unordered'
                }`}
              >
                {phaseCode(order, phase)}
              </button>
            )
          })}
          <span className={`tc-mcount ${state}`}>
            {order ? order.advance : 0}/{total}
          </span>
        </div>
      )
    })

  return (
    <div className="tc-plan">
      <div className="tc-mrow head">
        <span className="tc-mtag">UNIT</span>
        {ORDER_PHASES.map((phase) => (
          <span
            key={phase}
            className="tc-cell"
            style={phase === livePhase ? { color: C.warn } : undefined}
          >
            {PHASE_SHORT[phase]}
          </span>
        ))}
        <span className="tc-mcount">HEX</span>
      </div>
      {rows}
    </div>
  )
}

function UnitCard({
  unit,
  order,
  focus,
  playing,
  livePhase,
  nextUnorderedId,
  onFocus,
  onCycle,
  onOrder,
  onClearPhase,
  onClearUnit,
  onSelect,
}: {
  unit: UnitState
  order: RoundOrder | null
  focus: SlotFocus | null
  playing: boolean
  livePhase: OrderPhase | null
  nextUnorderedId: string | null
  onFocus: (focus: SlotFocus) => void
  onCycle: (delta: number) => void
  onOrder: (action: PadAction) => void
  onClearPhase: (unitId: string, phase: OrderPhase) => void
  onClearUnit: (unitId: string) => void
  onSelect: (id: string) => void
}) {
  const accent = accentOf(unit)
  const ai = unit.side === 'enemy'
  const profile = profileOf(unit)
  const spent = order?.advance ?? 0
  const total = profile.movement
  const armed = order != null
  const style = { '--accent': accent } as CSSProperties
  const jumpId = nextUnorderedId && nextUnorderedId !== unit.id ? nextUnorderedId : null
  const focused = !ai && !playing && focus?.unitId === unit.id ? focus.phase : null
  const turning = focused === 'before' || focused === 'after'
  const turnsHere = order && turning ? Math.abs(turnsIn(order, focused)) : 0

  return (
    <div className="tc-card sel" style={style}>
      <div className="tc-card-top">
        <button
          type="button"
          className="tc-step"
          onClick={() => onCycle(-1)}
          disabled={playing}
          aria-label="previous unit"
        >
          ‹
        </button>
        <span className="tc-tag">{unit.tag}</span>
        <span className="tc-name">{unit.name}</span>
        <span className={`tc-chip ${ai ? 'auto' : armed ? 'ok' : 'wait'}`}>
          {ai ? 'AI AUTO' : armed ? 'ARMED' : 'NO ORDER'}
        </span>
        <button
          type="button"
          className="tc-step"
          onClick={() => onCycle(1)}
          disabled={playing}
          aria-label="next unit"
        >
          ›
        </button>
      </div>

      <div className="tc-stats">
        <div className={`tc-stat${unit.hits > 0 ? ' hurt' : ''}`}>
          <b>
            {unit.hits}/{HITS_TO_ELIMINATE}
          </b>
          <span>HITS</span>
        </div>
        <div className="tc-stat">
          <b>{profile.code}</b>
          <span>{profile.armoured ? 'ARMOURED' : 'TYPE'}</span>
        </div>
        <div className="tc-stat">
          <b>
            {profile.meleeModifier === 0
              ? 'd6'
              : `d6${profile.meleeModifier > 0 ? '+' : '−'}${Math.abs(profile.meleeModifier)}`}
          </b>
          <span>MELEE</span>
        </div>
        <div className="tc-stat">
          {canShoot(unit) ? (
            <>
              <b>
                {profile.shootModifier === 0
                  ? 'd6'
                  : `d6${profile.shootModifier! > 0 ? '+' : '−'}${Math.abs(
                      profile.shootModifier!,
                    )}`}
              </b>
              <span>{`SHOOT ${profile.range}`}</span>
            </>
          ) : (
            <>
              <b>{unit.facing}</b>
              <span>FACE</span>
            </>
          )}
        </div>
        <div className="tc-stat">
          <b>
            {spent}/{total}
          </b>
          <span>HEXES</span>
        </div>
      </div>

      <div className="tc-slots">
        {ORDER_PHASES.map((phase) => {
          const written = order != null
          const isFocus = focused === phase
          const live = playing && livePhase === phase
          const past = playing && isPast(phase, livePhase)
          const wheelGlyph = order ? turnWheel(turnsIn(order, phase)) : null
          const classes = [
            'tc-slot',
            written ? 'filled' : '',
            isFocus ? 'focus' : '',
            live ? 'live' : '',
            past ? 'past' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={phase}
              type="button"
              className={classes}
              disabled={ai || playing}
              onClick={() => onFocus({ unitId: unit.id, phase })}
              aria-label={`${unit.tag} ${PHASE_LABELS[phase]}`}
            >
              <span className="tc-slot-k">{PHASE_LABELS[phase]}</span>
              <span className={`tc-slot-v${written ? '' : ' empty'}`}>
                {written ? (
                  <>
                    {wheelGlyph && (
                      <span style={{ color: accent }}>{WHEEL_GLYPH[wheelGlyph]}</span>
                    )}
                    {phaseCode(order, phase)}
                  </>
                ) : (
                  '— — —'
                )}
              </span>
              {written && !ai && !playing && (
                <span
                  className="tc-x"
                  role="button"
                  aria-label={`clear ${unit.tag} ${PHASE_LABELS[phase]}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onClearPhase(unit.id, phase)
                  }}
                >
                  ×
                </span>
              )}
            </button>
          )
        })}
      </div>

      {!ai && (
        <>
          <div className="tc-pad">
            {[...PAD_ROW, 'hold' as PadAction].map((action) => {
              const meta = PAD_META[action]
              // a turn phase takes three wheels; the advance takes the allowance
              const exhausted =
                action === 'advance'
                  ? spent >= total
                  : turning && turnsHere >= MAX_TURNS_PER_PHASE
              return (
                <button
                  key={action}
                  type="button"
                  className={`tc-btn${action === 'hold' ? ' hold' : ''}`}
                  disabled={playing || !focus || focus.unitId !== unit.id || exhausted}
                  onClick={() => onOrder(action)}
                  aria-label={meta.label}
                >
                  <span style={{ color: accent }}>{meta.glyph}</span>
                  <small>{meta.code}</small>
                </button>
              )
            })}
          </div>
          <div className="tc-cardfoot">
            <button
              type="button"
              className="tc-mini"
              disabled={playing || !armed}
              onClick={() => onClearUnit(unit.id)}
            >
              WIPE
            </button>
            {jumpId ? (
              <button
                type="button"
                className="tc-mini go"
                disabled={playing}
                onClick={() => onSelect(jumpId)}
              >
                NEXT UNORDERED ›
              </button>
            ) : null}
            <span className="tc-hint">
              {playing
                ? 'LOCKED'
                : focused
                  ? `WRITING → ${PHASE_LABELS[focused]}${focused === 'after' ? ' AFTER' : ''}`
                  : 'TAP A PHASE'}
            </span>
          </div>
        </>
      )}
      {ai && (
        <div className="tc-cardfoot">
          <span className="tc-hint" style={{ textAlign: 'left' }}>
            OPFOR DOCTRINE · STAND FAST · NO TURNS, NO GROUND
          </span>
        </div>
      )}
    </div>
  )
}

function OrdersConsole({
  units,
  log,
  orders,
  selectedId,
  focus,
  playing,
  livePhase,
  armedCount,
  playerCount,
  nextUnorderedId,
  onSelect,
  onFocus,
  onCycle,
  onOrder,
  onClearPhase,
  onClearUnit,
}: ConsoleProps) {
  const selected = units.find((unit) => unit.id === selectedId) ?? null
  const cardRef = useRef<HTMLDivElement | null>(null)

  // Switching units on a phone must not leave the order pad below the fold.
  useEffect(() => {
    if (playing) return
    cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId, playing])

  return (
    <div className="tc-panel">
      <div className="tc-panel-scroll">
        <div className="tc-sect">
          <span>ORDER MATRIX</span>
          <span style={{ color: armedCount === playerCount ? C.plr : C.warn }}>
            {playing ? 'RESOLVING' : `${armedCount}/${playerCount} ARMED`}
          </span>
        </div>
        <PlanGrid
          units={units}
          orders={orders}
          selectedId={selectedId}
          focus={focus}
          livePhase={livePhase}
          playing={playing}
          onSelect={onSelect}
          onFocus={onFocus}
        />

        {playing && (
          <>
            <div className="tc-sect">
              <span>Round log</span>
              <span>{livePhase ? PHASE_LABELS[livePhase] : 'FIGHT'}</span>
            </div>
            <div className="tc-read">
              {log.length === 0 ? (
                <div className="tc-empty">NO CONTACT THIS ROUND</div>
              ) : (
                log.map((row, i) => (
                  <div
                    className={`tc-readrow${row.tone ? ` ${row.tone}` : ''}`}
                    key={`${row.k}-${i}`}
                  >
                    <i>{row.k}</i>
                    <u />
                    <b>{row.v}</b>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        <div className="tc-sect">
          <span>Unit detail</span>
          <span>{selected ? selected.tag : '—'}</span>
        </div>
        <div ref={cardRef}>
          {selected ? (
            <UnitCard
              unit={selected}
              order={orders[selected.id] ?? null}
              focus={focus}
              playing={playing}
              livePhase={livePhase}
              nextUnorderedId={nextUnorderedId}
              onFocus={onFocus}
              onCycle={onCycle}
              onOrder={onOrder}
              onClearPhase={onClearPhase}
              onClearUnit={onClearUnit}
              onSelect={onSelect}
            />
          ) : (
            <div className="tc-empty">SELECT A UNIT FROM THE MATRIX OR THE BOARD</div>
          )}
        </div>

        {/* reference card: desktop has the room for it, the phone does not */}
        <div className="tc-sect tc-wide">
          <span>Doctrine</span>
          <span>REF</span>
        </div>
        <div className="tc-legend tc-wide">
          {[
            ['ROUND', 'TURN, THEN A STRAIGHT ADVANCE, THEN TURN AGAIN'],
            ['', 'NOTHING SHOOTS OR FIGHTS UNTIL ALL OF THAT HAS RESOLVED'],
            ['TURN', `UP TO ${MAX_TURNS_PER_PHASE} EDGES EITHER SIDE OF THE ADVANCE · FREE`],
            ['ADV', 'STRAIGHT AHEAD · UP TO THE TYPE ALLOWANCE'],
            ['HLD', 'STAND FAST · COSTS NOTHING'],
            ['SHOOT', 'ARC / SKM ONLY · 4 HEXES · 45° OF THE FACED EDGE'],
            ['', 'A UNIT THAT ADVANCED CANNOT SHOOT · TURNING IS FREE'],
            ['CONTACT', 'ADJACENT WHEN THE MOVING STOPS · ONE FIGHT PER FACE'],
            ['MELEE', 'BOTH SIDES ROLL d6 ± TYPE · HITS LAND TOGETHER'],
            ['ARMOUR', 'INFANTRY TAKE HALF · ROUNDED TO THE ATTACKER'],
            ['REAR', 'REAR 3 EDGES · HITS DOUBLED'],
            ['LOCKED', 'ENGAGED AS THE ROUND OPENS · NO ADVANCE, MELEE ENDS IN A KILL'],
            ['', 'A REAR-ONLY ATTACK MAY BE TURNED TO FACE · COSTS NOTHING'],
            ['GONE', `${HITS_TO_ELIMINATE} HITS ELIMINATES A UNIT`],
            ['BLOCKED', 'HEX HELD · ADV REFUSED, HEX SPENT'],
          ].map(([k, v]) => (
            <div className="tc-legendrow" key={`${k}-${v}`}>
              <i>{k}</i>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default OrdersConsole
