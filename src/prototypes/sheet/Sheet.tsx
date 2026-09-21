import { forwardRef, useRef } from 'react'
import type { ReactNode } from 'react'

import { OrderGlyph } from './Glyphs'
import { ORDER_LABEL, TICK_NUMERAL, assignedCount } from './rules'
import type { OrderType, Slots, UnitId, UnitState } from './rules'
import { T } from './theme'

const ORDER_HINT: Record<OrderType, string> = {
  move: 'one hex ahead',
  left: 'turn 60° left',
  right: 'turn 60° right',
  hold: 'stand fast',
}

const ORDERS: OrderType[] = ['move', 'left', 'right', 'hold']

export interface RosterEntry {
  readonly id: UnitId
  readonly badge: string
  readonly name: string
  readonly assigned: number
  readonly alive: boolean
  readonly active: boolean
}

interface SheetProps {
  unit: UnitState
  slots: Slots
  activeSlot: number
  editable: boolean
  closing: boolean
  lastPlaced: { slot: number; stamp: number } | null
  /** Your three companies, always in reach without dropping the sheet. */
  roster: RosterEntry[]
  commit: ReactNode
  onPlace: (order: OrderType) => void
  onClearSlot: (slot: number) => void
  onClearAll: () => void
  onPickSlot: (slot: number) => void
  onSelectUnit: (id: UnitId) => void
  onCycle: (step: number) => void
  onClose: () => void
}

const Sheet = forwardRef<HTMLDivElement, SheetProps>(function Sheet(
  {
    unit,
    slots,
    activeSlot,
    editable,
    closing,
    lastPlaced,
    roster,
    commit,
    onPlace,
    onClearSlot,
    onClearAll,
    onPickSlot,
    onSelectUnit,
    onCycle,
    onClose,
  },
  ref,
) {
  const assigned = assignedCount(slots)
  const swipe = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      ref={ref}
      className={`sh-sheet${closing ? ' sh-sheet-out' : ''}`}
      role="dialog"
      aria-label={`${unit.name} orders`}
      onPointerDown={(event) => {
        swipe.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerUp={(event) => {
        const start = swipe.current
        swipe.current = null
        if (!start) return
        const dx = event.clientX - start.x
        const dy = event.clientY - start.y
        if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.8) onCycle(dx < 0 ? 1 : -1)
        else if (dy > 64 && dy > Math.abs(dx) * 1.8) onClose()
      }}
    >
      <button
        type="button"
        className="sh-grip"
        onClick={onClose}
        aria-label="Close the orders sheet"
      />

      {/* the roster rail is the way in: tap a company's name to order it */}
      <div className="sh-rail" role="tablist" aria-label="Your companies">
        {roster.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.active}
            className={[
              'sh-rail-tab',
              entry.active ? 'sh-rail-on' : '',
              !entry.active && entry.alive && entry.assigned < 3 ? 'sh-rail-need' : '',
              entry.alive ? '' : 'sh-rail-dead',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={!entry.alive}
            onClick={() => onSelectUnit(entry.id)}
          >
            <span className="sh-rail-top">
              <span className="sh-rail-badge">{entry.badge}</span>
              <span className="sh-rail-name">{entry.name.replace(' Company', '')}</span>
            </span>
            <span className="sh-rail-pips">
              {[0, 1, 2].map((pip) => (
                <i key={pip} className={pip < entry.assigned ? 'sh-on' : undefined} />
              ))}
            </span>
          </button>
        ))}
      </div>

      <div className="sh-slots">
        {slots.map((order, index) => {
          const isActive = editable && index === activeSlot && order === null
          const popping = lastPlaced?.slot === index
          return (
            <div
              key={index}
              className={[
                'sh-slot',
                order ? 'sh-slot-filled' : '',
                isActive ? 'sh-slot-active' : '',
                popping ? 'sh-slot-pop' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => editable && onPickSlot(index)}
              role="button"
              tabIndex={0}
              aria-label={`Tick ${index + 1}${order ? `: ${ORDER_LABEL[order]}` : ': empty'}`}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onPickSlot(index)
              }}
            >
              <div className="sh-slot-label">Tick {TICK_NUMERAL[index]}</div>
              {order ? (
                <>
                  <OrderGlyph order={order} size={24} />
                  <div className="sh-slot-name">{ORDER_LABEL[order]}</div>
                  {editable && (
                    <button
                      type="button"
                      className="sh-slot-x"
                      aria-label={`Remove tick ${index + 1} order`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onClearSlot(index)
                      }}
                    >
                      ×
                    </button>
                  )}
                </>
              ) : (
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 9,
                    border: `2px dotted ${isActive ? T.gold : 'rgba(43,31,22,0.25)'}`,
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      {editable ? (
        <div className="sh-orders">
          {ORDERS.map((order) => (
            <button
              key={order}
              type="button"
              className="sh-order"
              disabled={assigned >= 3}
              onClick={() => onPlace(order)}
            >
              <span className="sh-order-glyph">
                <OrderGlyph order={order} size={23} />
              </span>
              <span>
                {ORDER_LABEL[order]}
                <small>{ORDER_HINT[order]}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="sh-note">
          <b>{unit.name} — scouted intent.</b> This banner holds its ground for all three ticks. You cannot
          rewrite its orders — but you can read them, and go round its flank.
        </div>
      )}

      <div className="sh-sheet-foot">
        {editable && (
          <button type="button" className="sh-clear" disabled={assigned === 0} onClick={onClearAll}>
            Clear
          </button>
        )}
        <div style={{ flex: 1 }}>{commit}</div>
      </div>
    </div>
  )
})

export default Sheet
