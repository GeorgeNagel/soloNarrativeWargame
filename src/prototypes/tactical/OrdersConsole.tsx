import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { C } from './theme'
import {
  ORDER_KINDS,
  ORDER_META,
  TICKS_PER_ROUND,
  assignedPoints,
  queueState,
} from './model'
import type { OrderKind, OrderSlots, UnitState } from './model'

export interface SlotFocus {
  unitId: string
  tick: number
}

/** One line of the resolving-tick log. */
export interface LogRow {
  k: string
  v: string
  tone?: 'ok' | 'warn' | 'hot'
}

export interface ConsoleProps {
  units: UnitState[]
  log: LogRow[]
  slots: Record<string, OrderSlots>
  selectedId: string | null
  focus: SlotFocus | null
  playing: boolean
  liveTick: number | null
  armedCount: number
  playerCount: number
  nextUnorderedId: string | null
  onSelect: (id: string) => void
  onFocus: (focus: SlotFocus) => void
  onCycle: (delta: number) => void
  onAdd: (kind: OrderKind) => void
  onClearSlot: (unitId: string, tick: number) => void
  onClearUnit: (unitId: string) => void
}

const TICK_LABELS = ['T1', 'T2', 'T3']

function accentOf(unit: UnitState): string {
  return unit.side === 'player' ? C.plr : C.enm
}

/**
 * The matrix is the friendly roster: three units, three ticks each, always on
 * screen. It is also the only selector you need — a cell takes control of that
 * unit and points the pad at that tick, so you never lose your place.
 */
function PlanGrid({
  units,
  slots,
  selectedId,
  focus,
  liveTick,
  playing,
  onSelect,
  onFocus,
}: {
  units: UnitState[]
  slots: Record<string, OrderSlots>
  selectedId: string | null
  focus: SlotFocus | null
  liveTick: number | null
  playing: boolean
  onSelect: (id: string) => void
  onFocus: (focus: SlotFocus) => void
}) {
  const rows = units
    .filter((unit) => unit.side === 'player')
    .map((unit) => {
      const queue = slots[unit.id] ?? []
      const spent = assignedPoints(queue)
      const total = unit.stats.movement
      const state = queueState(queue, total)
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
          {Array.from({ length: TICKS_PER_ROUND }, (_, tick) => {
            const order = queue[tick] ?? null
            const live = playing && tick === liveTick
            const isFocus =
              !playing && focus?.unitId === unit.id && focus.tick === tick
            const classes = [
              'tc-cell',
              order ? 'filled' : 'none',
              isFocus ? 'focus' : '',
              live ? 'live' : '',
              playing && liveTick !== null && tick < liveTick ? 'past' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={tick}
                type="button"
                className={classes}
                disabled={playing}
                onClick={() => onFocus({ unitId: unit.id, tick })}
                aria-label={`${unit.tag} tick ${tick + 1}${
                  order ? ` ${ORDER_META[order].code}` : ' empty'
                }`}
              >
                {order ? ORDER_META[order].code : '···'}
              </button>
            )
          })}
          <span className={`tc-mcount ${state}`}>
            {spent}/{total}
          </span>
        </div>
      )
    })

  return (
    <div className="tc-plan">
      <div className="tc-mrow head">
        <span className="tc-mtag">UNIT</span>
        {TICK_LABELS.map((t, i) => (
          <span key={t} className="tc-cell" style={i === liveTick ? { color: C.warn } : undefined}>
            {t}
          </span>
        ))}
        <span className="tc-mcount">PTS</span>
      </div>
      {rows}
    </div>
  )
}

function UnitCard({
  unit,
  queue,
  focus,
  playing,
  liveTick,
  nextUnorderedId,
  onFocus,
  onCycle,
  onAdd,
  onClearSlot,
  onClearUnit,
  onSelect,
}: {
  unit: UnitState
  queue: OrderSlots
  focus: SlotFocus | null
  playing: boolean
  liveTick: number | null
  nextUnorderedId: string | null
  onFocus: (focus: SlotFocus) => void
  onCycle: (delta: number) => void
  onAdd: (kind: OrderKind) => void
  onClearSlot: (unitId: string, tick: number) => void
  onClearUnit: (unitId: string) => void
  onSelect: (id: string) => void
}) {
  const accent = accentOf(unit)
  const ai = unit.side === 'enemy'
  const spent = assignedPoints(queue)
  const total = unit.stats.movement
  const armed = spent >= total
  const style = { '--accent': accent } as CSSProperties
  const jumpId = nextUnorderedId && nextUnorderedId !== unit.id ? nextUnorderedId : null

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
          {ai ? 'AI AUTO' : armed ? 'ARMED' : `${total - spent} FREE`}
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
        <div className={`tc-stat${unit.models < unit.startModels ? ' hurt' : ''}`}>
          <b>{unit.models}</b>
          <span>MDL</span>
        </div>
        <div className="tc-stat">
          <b>{unit.stats.attack}</b>
          <span>ATK</span>
        </div>
        <div className="tc-stat">
          <b>{unit.stats.defense}</b>
          <span>DEF</span>
        </div>
        <div className="tc-stat">
          <b>{unit.facing}</b>
          <span>FACE</span>
        </div>
        <div className="tc-stat">
          <b>
            {spent}/{total}
          </b>
          <span>MOV</span>
        </div>
      </div>

      <div className="tc-slots">
        {Array.from({ length: TICKS_PER_ROUND }, (_, tick) => {
          const order = queue[tick] ?? null
          const isFocus = !ai && !playing && focus?.unitId === unit.id && focus.tick === tick
          const live = playing && liveTick === tick
          const past = playing && liveTick !== null && tick < liveTick
          const classes = [
            'tc-slot',
            order ? 'filled' : '',
            isFocus ? 'focus' : '',
            live ? 'live' : '',
            past ? 'past' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={tick}
              type="button"
              className={classes}
              disabled={ai || playing}
              onClick={() => onFocus({ unitId: unit.id, tick })}
              aria-label={`${unit.tag} tick ${tick + 1}`}
            >
              <span className="tc-slot-k">{TICK_LABELS[tick]}</span>
              <span className={`tc-slot-v${order ? '' : ' empty'}`}>
                {order ? (
                  <>
                    <span style={{ color: accent }}>{ORDER_META[order].glyph}</span>
                    {ORDER_META[order].code}
                  </>
                ) : (
                  '— — —'
                )}
              </span>
              {order && !ai && !playing && (
                <span
                  className="tc-x"
                  role="button"
                  aria-label={`clear ${unit.tag} tick ${tick + 1}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onClearSlot(unit.id, tick)
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
            {ORDER_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                className="tc-btn"
                disabled={playing || !focus || focus.unitId !== unit.id}
                onClick={() => onAdd(kind)}
                aria-label={ORDER_META[kind].label}
              >
                <span style={{ color: accent }}>{ORDER_META[kind].glyph}</span>
                <small>{ORDER_META[kind].code}</small>
              </button>
            ))}
          </div>
          <div className="tc-cardfoot">
            <button
              type="button"
              className="tc-mini"
              disabled={playing || spent === 0}
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
                : focus && focus.unitId === unit.id
                  ? `WRITING → ${TICK_LABELS[focus.tick]}`
                  : 'TAP A TICK'}
            </span>
          </div>
        </>
      )}
      {ai && (
        <div className="tc-cardfoot">
          <span className="tc-hint" style={{ textAlign: 'left' }}>
            OPFOR DOCTRINE · STAND FAST · ALL TICKS HLD
          </span>
        </div>
      )}
    </div>
  )
}

function OrdersConsole({
  units,
  log,
  slots,
  selectedId,
  focus,
  playing,
  liveTick,
  armedCount,
  playerCount,
  nextUnorderedId,
  onSelect,
  onFocus,
  onCycle,
  onAdd,
  onClearSlot,
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
          slots={slots}
          selectedId={selectedId}
          focus={focus}
          liveTick={liveTick}
          playing={playing}
          onSelect={onSelect}
          onFocus={onFocus}
        />

        {playing && (
          <>
            <div className="tc-sect">
              <span>Tick log</span>
              <span>{`T${(liveTick ?? 0) + 1}`}</span>
            </div>
            <div className="tc-read">
              {log.length === 0 ? (
                <div className="tc-empty">NO CONTACT THIS TICK</div>
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
              queue={slots[selected.id] ?? []}
              focus={focus}
              playing={playing}
              liveTick={liveTick}
              nextUnorderedId={nextUnorderedId}
              onFocus={onFocus}
              onCycle={onCycle}
              onAdd={onAdd}
              onClearSlot={onClearSlot}
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
            ['ADV', 'INTO THE FACED HEX · 1 PT'],
            ['L60 / R60', 'WHEEL ONE EDGE · 1 PT'],
            ['HLD', 'STAND FAST · 1 PT'],
            ['CONTACT', 'ADJACENT AT A TICK BOUNDARY'],
            ['FLANK', 'REAR 3 EDGES · DEF ÷2'],
            ['BLOCKED', 'HEX HELD · ADV REFUSED, PT SPENT'],
          ].map(([k, v]) => (
            <div className="tc-legendrow" key={k}>
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
