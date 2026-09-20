import { useRef } from 'react'

import { OrderGlyphBox } from './Glyphs'
import { COLORS } from './theme'
import { ORDER_LABEL, TICKS } from './model'
import type { OrderSlots, Phase } from './model'

interface TimelineProps {
  slots: OrderSlots
  focusTick: number
  playhead: number
  phase: Phase
  /** Models lost at each tick boundary, index 1..3. */
  losses: number[]
  onScrub: (playhead: number) => void
  onFocus: (tick: number) => void
  onRemove: (tick: number) => void
}

const TICK_NAMES = ['Tick I', 'Tick II', 'Tick III']

/**
 * The three ticks live here as one draggable strip: scrub it to see the board
 * at that moment, whether that is a plan you are still writing or a round that
 * already resolved.
 */
function Timeline({
  slots,
  focusTick,
  playhead,
  phase,
  losses,
  onScrub,
  onFocus,
  onRemove,
}: TimelineProps) {
  const stripRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const downX = useRef(0)

  const fromClientX = (clientX: number, useStrip = false): number => {
    const element = (useStrip ? stripRef.current : innerRef.current) ?? stripRef.current
    if (!element) return playhead
    const box = element.getBoundingClientRect()
    const ratio = (clientX - box.left) / Math.max(1, box.width)
    return Math.max(0, Math.min(TICKS, ratio * TICKS))
  }

  const scrubHandlers = (lazy: boolean) => ({
    onPointerDown: (event: React.PointerEvent) => {
      downX.current = event.clientX
      dragging.current = !lazy
      if (!lazy) {
        event.currentTarget.setPointerCapture(event.pointerId)
        onScrub(fromClientX(event.clientX, lazy))
      }
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (!dragging.current) {
        if (!lazy || Math.abs(event.clientX - downX.current) < 7) return
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      onScrub(fromClientX(event.clientX, lazy))
    },
    onPointerUp: (event: React.PointerEvent) => {
      dragging.current = false
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    onPointerCancel: () => {
      dragging.current = false
    },
  })

  const percent = (playhead / TICKS) * 100

  return (
    <div className="rp-timeline">
      <div className="rp-slots" ref={stripRef} {...scrubHandlers(true)}>
        {Array.from({ length: TICKS }, (_, tick) => {
          const order = slots[tick] ?? null
          const past = playhead >= tick + 1
          return (
            <div
              key={tick}
              className={`rp-slot${focusTick === tick && phase === 'planning' ? ' rp-focus' : ''}${past ? ' rp-past' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${TICK_NAMES[tick]}: ${order ? ORDER_LABEL[order] : 'empty'}`}
              onClick={() => onFocus(tick)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onFocus(tick)
                }
              }}
            >
              <span className="rp-slot-name">{TICK_NAMES[tick]}</span>
              {order ? (
                <span className="rp-slot-chip" style={{ color: COLORS.player }}>
                  <OrderGlyphBox type={order} size={20} />
                  <span>{ORDER_LABEL[order]}</span>
                </span>
              ) : (
                <span className="rp-slot-empty">· unspent ·</span>
              )}
              <span
                style={{
                  fontSize: 8.5,
                  letterSpacing: '0.14em',
                  color: losses[tick + 1] > 0 ? COLORS.focus : COLORS.muted,
                  opacity: losses[tick + 1] > 0 ? 1 : 0.5,
                }}
              >
                {losses[tick + 1] > 0 ? `CLASH −${losses[tick + 1]}` : 'ENEMY HOLDS'}
              </span>
              {order && phase === 'planning' && (
                <button
                  type="button"
                  className="rp-x"
                  aria-label={`Remove ${ORDER_LABEL[order]} from ${TICK_NAMES[tick]}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemove(tick)
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div
        className="rp-track"
        role="slider"
        tabIndex={0}
        aria-label="Scrub the round"
        aria-valuemin={0}
        aria-valuemax={TICKS}
        aria-valuenow={Number(playhead.toFixed(2))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') onScrub(Math.max(0, playhead - 0.25))
          if (event.key === 'ArrowRight') onScrub(Math.min(TICKS, playhead + 0.25))
        }}
        {...scrubHandlers(false)}
      >
        <div className="rp-track-inner" ref={innerRef}>
          <div className="rp-track-line" />
          <div className="rp-track-fill" style={{ width: `${percent}%` }} />
          {Array.from({ length: TICKS + 1 }, (_, mark) => (
            <div key={mark} style={{ position: 'absolute', left: `${(mark / TICKS) * 100}%` }}>
              <div className="rp-notch" />
              <div
                className="rp-notch-label"
                style={{
                  left: 0,
                  transform: `translateX(${mark === 0 ? '-12%' : mark === TICKS ? '-88%' : '-50%'})`,
                }}
              >
                {mark === 0 ? 'NOW' : `T${mark}`}
              </div>
            </div>
          ))}
          <div className="rp-head-handle" style={{ left: `${percent}%` }}>
            <i />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Timeline
