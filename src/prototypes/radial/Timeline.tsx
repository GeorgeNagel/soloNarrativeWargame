import { useRef } from 'react'

import { OrderGlyphBox } from './Glyphs'
import { COLORS } from './theme'
import { ORDER_LABEL, TICKS } from './model'
import type { OrderSlots, Phase } from './model'

/** One player file as the strip shows it: a row of three order cells. */
export interface StripUnit {
  readonly id: string
  readonly sigil: string
  readonly name: string
  readonly slots: OrderSlots
  /** Per tick: this unit's advance fails, it stays put. */
  readonly blocked: readonly boolean[]
}

/** What happens at a tick boundary, summarised for the strip. */
export interface TickReport {
  readonly clashes: number
  readonly playerLoss: number
  readonly enemyLoss: number
}

interface TimelineProps {
  units: readonly StripUnit[]
  selectedId: string | null
  focusTick: number
  playhead: number
  phase: Phase
  report: readonly TickReport[]
  onScrub: (playhead: number) => void
  onFocus: (tick: number) => void
  /** Pick a unit and a tick at once, from its cell. */
  onPick: (unitId: string, tick: number) => void
  onRemove: (unitId: string, tick: number) => void
}

const TICK_NAMES = ['Tick I', 'Tick II', 'Tick III']

/**
 * The three ticks live here as one draggable strip: scrub it to see the board
 * at that moment, whether that is a plan you are still writing or a round that
 * already resolved. Each tick carries a row per file, so the whole roster's
 * orders are one glance wide and any file is one tap away.
 */
function Timeline({
  units,
  selectedId,
  focusTick,
  playhead,
  phase,
  report,
  onScrub,
  onFocus,
  onPick,
  onRemove,
}: TimelineProps) {
  const stripRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const dragged = useRef(false)
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
      dragged.current = false
      if (!lazy) {
        event.currentTarget.setPointerCapture(event.pointerId)
        onScrub(fromClientX(event.clientX, lazy))
      }
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (!dragging.current) {
        if (!lazy || Math.abs(event.clientX - downX.current) < 7) return
        dragging.current = true
        dragged.current = true
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
          const past = playhead >= tick + 1
          const beat = report[tick]
          const focused = focusTick === tick && phase === 'planning'
          return (
            <div
              key={tick}
              className={`rp-slot${focused ? ' rp-focus' : ''}${past ? ' rp-past' : ''}`}
            >
              <div className="rp-slot-head">
                <button
                  type="button"
                  className="rp-slot-name"
                  aria-label={`Scrub to ${TICK_NAMES[tick]}`}
                  onClick={() => {
                    if (!dragged.current) onFocus(tick)
                  }}
                >
                  {TICK_NAMES[tick]}
                </button>
              </div>

              <div className="rp-rows">
                {units.map((unit) => {
                  const order = unit.slots[tick] ?? null
                  const mine = unit.id === selectedId
                  const blocked = unit.blocked[tick] ?? false
                  return (
                    <div
                      key={unit.id}
                      className={`rp-cell${mine ? ' rp-sel' : ''}${order ? ' rp-on' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${unit.name}, ${TICK_NAMES[tick]}: ${
                        order ? ORDER_LABEL[order] : 'unspent'
                      }${blocked ? ', blocked' : ''}`}
                      onClick={() => {
                        if (!dragged.current) onPick(unit.id, tick)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onPick(unit.id, tick)
                        }
                      }}
                    >
                      <span className="rp-cell-sigil">{unit.sigil}</span>
                      {order ? (
                        <>
                          <span className="rp-cell-glyph">
                            <OrderGlyphBox type={order} size={16} />
                          </span>
                          <span className="rp-cell-label">{ORDER_LABEL[order]}</span>
                          {blocked && (
                            <span className="rp-cell-flag" title="Blocked: the unit stays put">
                              !
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="rp-cell-dot" />
                          <span className="rp-cell-label rp-cell-unspent">unspent</span>
                        </>
                      )}
                      {/* editable when this file has the bloom, or when
                          nothing is selected and the whole plan is on show */}
                      {order && (mine || selectedId === null) && phase === 'planning' && (
                        <button
                          type="button"
                          className="rp-cell-x"
                          aria-label={`Remove ${ORDER_LABEL[order]} from ${unit.name}, ${TICK_NAMES[tick]}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            onRemove(unit.id, tick)
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="rp-slot-beat">
                {beat && beat.clashes > 0 ? (
                  <>
                    <span className="rp-beat-mark" />
                    <span style={{ color: COLORS.focus }}>
                      {beat.clashes > 1 ? `CLASH ×${beat.clashes}` : 'CLASH'}
                    </span>
                    <span style={{ color: COLORS.player }}>−{beat.playerLoss}</span>
                    <span style={{ color: COLORS.muted }}>/</span>
                    <span style={{ color: COLORS.enemy }}>−{beat.enemyLoss}</span>
                  </>
                ) : (
                  <span style={{ color: COLORS.muted, opacity: 0.55 }}>no contact</span>
                )}
              </div>
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
              {mark > 0 && (report[mark - 1]?.clashes ?? 0) > 0 && (
                <div className="rp-notch-clash" title={`${report[mark - 1].clashes} clash`}>
                  <span className="rp-beat-mark" />
                  {report[mark - 1].clashes > 1 ? `×${report[mark - 1].clashes}` : ''}
                </div>
              )}
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
