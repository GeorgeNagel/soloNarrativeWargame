import { forwardRef } from 'react'
import type { ReactNode } from 'react'

import { CloseGlyph, OrderGlyph } from './Glyphs'
import {
  ORDER_LABEL,
  PIKEMEN,
  TICK_NUMERAL,
  assignedCount,
  directionName,
} from './rules'
import type { OrderType, Slots, UnitState } from './rules'
import { T } from './theme'

const ORDER_HINT: Record<OrderType, string> = {
  move: 'one hex ahead',
  left: 'turn 60° left',
  right: 'turn 60° right',
  hold: 'stand fast',
}

const ORDERS: OrderType[] = ['move', 'left', 'right', 'hold']

interface SheetProps {
  unit: UnitState
  slots: Slots
  activeSlot: number
  editable: boolean
  closing: boolean
  lastPlaced: { slot: number; stamp: number } | null
  commit: ReactNode
  onPlace: (order: OrderType) => void
  onClearSlot: (slot: number) => void
  onClearAll: () => void
  onPickSlot: (slot: number) => void
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
    commit,
    onPlace,
    onClearSlot,
    onClearAll,
    onPickSlot,
    onClose,
  },
  ref,
) {
  const assigned = assignedCount(slots)
  const remaining = PIKEMEN.movement - assigned
  const accent = unit.id === 'player' ? T.player : T.enemy
  const deep = unit.id === 'player' ? T.playerDeep : T.enemyDeep

  return (
    <div
      ref={ref}
      className={`sh-sheet${closing ? ' sh-sheet-out' : ''}`}
      role="dialog"
      aria-label={`${unit.name} orders`}
    >
      <div className="sh-grip" />
      <div className="sh-sheet-head">
        <div
          className="sh-crest"
          style={{ background: `linear-gradient(160deg, ${accent} 0%, ${deep} 100%)` }}
        >
          {unit.models}
        </div>
        <div>
          <div className="sh-sheet-title">{unit.name}</div>
          <div className="sh-sheet-sub">
            {unit.models} models · facing {directionName(unit.dir)} · Atk {PIKEMEN.attack} / Def{' '}
            {PIKEMEN.defense}
          </div>
        </div>
        <button type="button" className="sh-close" onClick={onClose} aria-label="Back to board">
          <CloseGlyph />
        </button>
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
                  <OrderGlyph order={order} size={26} />
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
                    width: 26,
                    height: 26,
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
        <>
          <div className="sh-orders-head">
            <span>Spend a point</span>
            <span className="sh-points">
              {remaining > 0 ? `${remaining} left` : 'all assigned'}
            </span>
          </div>
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
        </>
      ) : (
        <div className="sh-note">
          <b>Scouted intent.</b> The enemy captain holds his line for all three ticks. You cannot
          rewrite his orders — but you can read them, and go round his flank.
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
