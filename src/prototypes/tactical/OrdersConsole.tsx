import type { CSSProperties } from 'react'
import { C } from './theme'
import { ORDER_KINDS, ORDER_META, TICKS_PER_ROUND, assignedPoints } from './model'
import type { OrderKind, OrderSlots, UnitState } from './model'

export interface SlotFocus {
  unitId: string
  tick: number
}

export interface ReadoutRow {
  k: string
  v: string
  tone?: 'ok' | 'warn' | 'hot'
}

export interface ConsoleProps {
  units: UnitState[]
  readout: ReadoutRow[]
  slots: Record<string, OrderSlots>
  selectedId: string | null
  focus: SlotFocus | null
  playing: boolean
  liveTick: number | null
  onSelect: (id: string) => void
  onFocus: (focus: SlotFocus) => void
  onAdd: (kind: OrderKind) => void
  onClearSlot: (unitId: string, tick: number) => void
  onClearUnit: (unitId: string) => void
}

const TICK_LABELS = ['T1', 'T2', 'T3']

function accentOf(unit: UnitState): string {
  return unit.side === 'player' ? C.plr : C.enm
}

/** Top-of-panel overview: every unit's three ticks, side by side, always visible. */
function PlanGrid({
  units,
  slots,
  liveTick,
}: {
  units: UnitState[]
  slots: Record<string, OrderSlots>
  liveTick: number | null
}) {
  return (
    <div className="tc-plan">
      <div className="tc-planrow head">
        <i>UNIT</i>
        {TICK_LABELS.map((t, i) => (
          <em key={t} style={i === liveTick ? { color: C.warn } : undefined}>
            {t}
          </em>
        ))}
      </div>
      {units.map((unit) => {
        const queue = slots[unit.id] ?? []
        return (
          <div className="tc-planrow" key={unit.id}>
            <i style={{ color: accentOf(unit) }}>{unit.tag}</i>
            {Array.from({ length: TICKS_PER_ROUND }, (_, tick) => {
              const order = queue[tick] ?? null
              const live = tick === liveTick
              return (
                <em
                  key={tick}
                  className={order ? undefined : 'none'}
                  style={
                    live
                      ? { borderColor: C.warn, color: C.warn, background: '#191305' }
                      : order
                        ? { color: accentOf(unit) }
                        : undefined
                  }
                >
                  {order ? ORDER_META[order].code : '···'}
                </em>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function UnitCard({
  unit,
  queue,
  selected,
  focus,
  playing,
  liveTick,
  onSelect,
  onFocus,
  onAdd,
  onClearSlot,
  onClearUnit,
}: {
  unit: UnitState
  queue: OrderSlots
  selected: boolean
  focus: SlotFocus | null
  playing: boolean
  liveTick: number | null
  onSelect: (id: string) => void
  onFocus: (focus: SlotFocus) => void
  onAdd: (kind: OrderKind) => void
  onClearSlot: (unitId: string, tick: number) => void
  onClearUnit: (unitId: string) => void
}) {
  const accent = accentOf(unit)
  const ai = unit.side === 'enemy'
  const spent = assignedPoints(queue)
  const total = unit.stats.movement
  const armed = spent >= total
  const style = { '--accent': accent } as CSSProperties

  return (
    <div className={`tc-card${selected ? ' sel' : ''}`} style={style}>
      <div className="tc-card-top" onClick={() => onSelect(unit.id)}>
        <span className="tc-tag">{unit.tag}</span>
        <span className="tc-name">{unit.name}</span>
        <span className={`tc-chip ${ai ? 'auto' : armed ? 'ok' : 'wait'}`}>
          {ai ? 'AI AUTO' : armed ? 'ARMED' : `${total - spent} FREE`}
        </span>
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
                disabled={playing || !selected || (armed && !focus)}
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
            <span className="tc-hint">
              {playing
                ? 'LOCKED'
                : !selected
                  ? 'TAP TO TAKE CONTROL'
                  : focus
                    ? `WRITING → ${TICK_LABELS[focus.tick]}`
                    : 'QUEUE FULL'}
            </span>
          </div>
        </>
      )}
      {ai && (
        <div className="tc-cardfoot">
          <span className="tc-hint" style={{ textAlign: 'left' }}>
            OPFOR DOCTRINE · STAND FAST
          </span>
        </div>
      )}
    </div>
  )
}

function OrdersConsole({
  units,
  readout,
  slots,
  selectedId,
  focus,
  playing,
  liveTick,
  onSelect,
  onFocus,
  onAdd,
  onClearSlot,
  onClearUnit,
}: ConsoleProps) {
  return (
    <div className="tc-panel">
      <div className="tc-panel-scroll">
        <div className="tc-sect">
          <span>ORDER MATRIX</span>
          <span>{playing ? 'RESOLVING' : 'EDITABLE'}</span>
        </div>
        <PlanGrid units={units} slots={slots} liveTick={liveTick} />
        <div className="tc-sect">
          <span>Engagement forecast</span>
          <span>END OF T3</span>
        </div>
        <div className="tc-read">
          {readout.map((row) => (
            <div className={`tc-readrow${row.tone ? ` ${row.tone}` : ''}`} key={row.k}>
              <i>{row.k}</i>
              <u />
              <b>{row.v}</b>
            </div>
          ))}
        </div>
        <div className="tc-sect">
          <span>UNIT DETAIL</span>
          <span>{units.length} ON FIELD</span>
        </div>
        {units.map((unit) => (
          <UnitCard
            key={unit.id}
            unit={unit}
            queue={slots[unit.id] ?? []}
            selected={unit.id === selectedId}
            focus={focus}
            playing={playing}
            liveTick={liveTick}
            onSelect={onSelect}
            onFocus={onFocus}
            onAdd={onAdd}
            onClearSlot={onClearSlot}
            onClearUnit={onClearUnit}
          />
        ))}
      </div>
    </div>
  )
}

export default OrdersConsole
