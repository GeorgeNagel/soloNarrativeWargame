import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import Board from './Board'
import type { BoardFx } from './Board'
import Sheet from './Sheet'
import {
  BOARD_RATIO,
  INITIAL_UNITS,
  PIKEMEN,
  TICK_NUMERAL,
  assignedCount,
  emptySlots,
  holdSlots,
  previewOrders,
  resolveRound,
  slotsComplete,
} from './rules'
import type { OrderType, Slots, UnitId, Units } from './rules'
import { SHEET_CSS } from './styles'
import { SHEET_HEIGHT, T } from './theme'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const freshOrders = (): Record<UnitId, Slots> => ({ player: emptySlots(), enemy: holdSlots() })

/** Big board, focused bottom sheet: one unit in the thumb zone at a time. */
export default function SheetPrototype() {
  const [units, setUnits] = useState<Units>(INITIAL_UNITS)
  const [orders, setOrders] = useState<Record<UnitId, Slots>>(freshOrders)
  const [round, setRound] = useState(1)
  const [phase, setPhase] = useState<'planning' | 'resolving'>('planning')

  const [selected, setSelected] = useState<UnitId | null>(null)
  const [sheetUnit, setSheetUnit] = useState<UnitId | null>(null)
  const [closing, setClosing] = useState(false)
  const [activeSlot, setActiveSlot] = useState(0)
  const [lastPlaced, setLastPlaced] = useState<{ slot: number; stamp: number } | null>(null)

  const [tickLabel, setTickLabel] = useState<string | null>(null)
  const [fx, setFx] = useState<BoardFx | null>(null)

  const [sheetH, setSheetH] = useState(SHEET_HEIGHT)
  const [barH, setBarH] = useState(148)
  const [boardWidth, setBoardWidth] = useState(0)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const closeTimer = useRef<number | null>(null)
  /** Target bottom padding of the stage; read instead of the mid-transition value. */
  const stagePad = useRef(78)
  const alive = useRef(true)
  const run = useRef(0)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      run.current += 1
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
    }
  }, [])

  const stagePadding = sheetUnit && !closing ? Math.max(10, sheetH - barH + 10) : 78
  stagePad.current = stagePadding

  // The board is the hero: it always takes the largest rectangle the stage allows.
  const measureBoard = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const style = window.getComputedStyle(stage)
    const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const height = stage.clientHeight - parseFloat(style.paddingTop) - stagePad.current
    setBoardWidth(Math.max(0, Math.min(width, height * BOARD_RATIO)))
  }, [])

  useLayoutEffect(() => {
    measureBoard()
    const stage = stageRef.current
    if (!stage) return undefined
    const observer = new ResizeObserver(measureBoard)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [measureBoard])

  useLayoutEffect(() => {
    if (sheetRef.current) setSheetH(sheetRef.current.offsetHeight)
    if (barRef.current) setBarH(barRef.current.offsetHeight)
  }, [sheetUnit, phase])

  // The stage's padding changes when the sheet rises, so re-fit the board with it.
  useLayoutEffect(() => {
    measureBoard()
    // The bar and sheet settle over a frame or two, so re-fit once they have.
    const frame = window.requestAnimationFrame(measureBoard)
    const settle = window.setTimeout(measureBoard, 520)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(settle)
    }
  }, [measureBoard, stagePadding, sheetH, barH])

  const planning = phase === 'planning'
  const playerSlots = orders.player
  const playerAssigned = assignedCount(playerSlots)
  const remaining = PIKEMEN.movement - playerAssigned
  const ready = units.player.models <= 0 || slotsComplete(playerSlots)

  const preview = useMemo(() => {
    if (!planning || selected !== 'player' || units.player.models <= 0) return null
    return previewOrders(units.player, playerSlots, [units.enemy.tile])
  }, [planning, selected, units, playerSlots])

  const closeSheet = useCallback(() => {
    if (!sheetUnit || closing) return
    setClosing(true)
    setSelected(null)
    closeTimer.current = window.setTimeout(() => {
      if (!alive.current) return
      setSheetUnit(null)
      setClosing(false)
    }, 240)
  }, [sheetUnit, closing])

  const openSheet = useCallback(
    (id: UnitId) => {
      if (!planning) return
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
      if (sheetUnit === id && !closing) {
        closeSheet()
        return
      }
      setClosing(false)
      setSelected(id)
      setSheetUnit(id)
      const slots = id === 'player' ? orders.player : orders.enemy
      const firstEmpty = slots.findIndex((slot) => slot === null)
      setActiveSlot(firstEmpty === -1 ? 2 : firstEmpty)
      setLastPlaced(null)
    },
    [planning, sheetUnit, closing, orders, closeSheet],
  )

  const placeOrder = useCallback(
    (order: OrderType) => {
      if (sheetUnit !== 'player') return
      const slots = [...orders.player]
      const target = slots[activeSlot] === null ? activeSlot : slots.findIndex((slot) => slot === null)
      if (target === -1) return
      slots[target] = order
      setOrders((previous) => ({ ...previous, player: slots }))
      setLastPlaced({ slot: target, stamp: Date.now() })
      const next = slots.findIndex((slot) => slot === null)
      setActiveSlot(next === -1 ? target : next)
    },
    [sheetUnit, activeSlot, orders],
  )

  const clearSlot = useCallback((slot: number) => {
    setOrders((previous) => {
      const slots = [...previous.player]
      slots[slot] = null
      return { ...previous, player: slots }
    })
    setActiveSlot(slot)
    setLastPlaced(null)
  }, [])

  const clearAll = useCallback(() => {
    setOrders((previous) => ({ ...previous, player: emptySlots() }))
    setActiveSlot(0)
    setLastPlaced(null)
  }, [])

  const reset = useCallback(() => {
    run.current += 1
    setUnits(INITIAL_UNITS)
    setOrders(freshOrders())
    setRound(1)
    setPhase('planning')
    setFx(null)
    setTickLabel(null)
    setActiveSlot(0)
    setSelected(null)
    setSheetUnit(null)
    setClosing(false)
  }, [])

  const commit = useCallback(async () => {
    if (!ready || !planning) return
    const frames = resolveRound(units, orders)
    const token = (run.current += 1)
    const live = () => alive.current && run.current === token

    setPhase('resolving')
    setSelected(null)
    setSheetUnit(null)
    setClosing(false)
    setLastPlaced(null)

    for (const frame of frames) {
      if (!live()) return
      setTickLabel(TICK_NUMERAL[frame.tick - 1])
      setUnits(frame.afterMove)
      await sleep(820)
      if (!live()) return
      if (frame.contact) {
        setFx({ id: frame.tick, strikes: frame.strikes })
        await sleep(420)
        if (!live()) return
        setUnits(frame.afterCombat)
        await sleep(760)
        if (!live()) return
        setFx(null)
        await sleep(160)
      } else {
        await sleep(200)
      }
      if (!live()) return
      await sleep(120)
    }
    if (!live()) return
    setOrders(freshOrders())
    setActiveSlot(0)
    setRound((value) => value + 1)
    setTickLabel(null)
    setPhase('planning')
  }, [ready, planning, units, orders])

  const commitLabel = !planning
    ? 'Resolving the round…'
    : ready
      ? 'Commit orders'
      : `${remaining} point${remaining === 1 ? '' : 's'} unspent`

  const commitButton = (
    <button
      type="button"
      className={`sh-commit${ready && planning ? ' sh-commit-ready' : ''}`}
      disabled={!ready || !planning}
      onClick={commit}
    >
      {commitLabel}
    </button>
  )

  const chip = (id: UnitId) => {
    const unit = units[id]
    const assigned = assignedCount(orders[id])
    const complete = assigned === 3 || unit.models <= 0
    return (
      <button
        type="button"
        className={`sh-chip${complete ? '' : ' sh-chip-need'}`}
        onClick={() => openSheet(id)}
        disabled={!planning || unit.models <= 0}
      >
        <span
          className="sh-swatch"
          style={{ background: id === 'player' ? T.player : T.enemy }}
        />
        <span>
          <b>{unit.name}</b>
          <em>
            {unit.models <= 0
              ? 'routed'
              : complete
                ? id === 'enemy'
                  ? 'holding · 3/3'
                  : 'orders set · 3/3'
                : `${assigned}/3 points · tap to order`}
          </em>
        </span>
      </button>
    )
  }

  return (
    <div className="sh-root">
      <style>{SHEET_CSS}</style>
      <div className="sh-column">
        <header className="sh-header">
          <div className="sh-round">
            <small>Elmsford Ford</small>
            Round {round}
          </div>
          <div className="sh-phase">
            <span className="sh-dot" />
            {planning ? 'Orders' : `Tick ${tickLabel ?? TICK_NUMERAL[0]}`}
          </div>
          <button type="button" className="sh-reset" onClick={reset}>
            Reset
          </button>
        </header>

        <div ref={stageRef} className="sh-stage" style={{ paddingBottom: stagePadding }}>
          <Board
            units={units}
            orders={orders}
            selected={selected}
            preview={preview}
            planning={planning}
            fx={fx}
            width={boardWidth}
            onSelect={openSheet}
            onBackdrop={closeSheet}
          />
          <p className={`sh-caption${sheetUnit ? ' sh-caption-hidden' : ''}`}>
            {planning ? (
              <>
                Two companies of pikemen, three ticks to the round.
                <br />
                <b>Tap a unit</b> to spend its movement points.
              </>
            ) : (
              <>
                Orders are locked. Watching tick <b>{tickLabel ?? TICK_NUMERAL[0]}</b> play out…
              </>
            )}
          </p>
        </div>

        <div ref={barRef} className={`sh-bar${sheetUnit ? ' sh-bar-hidden' : ''}`}>
          <div className="sh-chips">
            {chip('player')}
            {chip('enemy')}
          </div>
          {commitButton}
        </div>

        {sheetUnit && (
          <Sheet
            ref={sheetRef}
            unit={units[sheetUnit]}
            slots={orders[sheetUnit]}
            activeSlot={activeSlot}
            editable={sheetUnit === 'player'}
            closing={closing}
            lastPlaced={lastPlaced}
            commit={commitButton}
            onPlace={placeOrder}
            onClearSlot={clearSlot}
            onClearAll={clearAll}
            onPickSlot={setActiveSlot}
            onClose={closeSheet}
          />
        )}
      </div>
    </div>
  )
}
