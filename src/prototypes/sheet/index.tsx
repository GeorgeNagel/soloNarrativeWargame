import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import Board from './Board'
import type { BoardFx } from './Board'
import Sheet from './Sheet'
import type { RosterEntry } from './Sheet'
import {
  BOARD_RATIO,
  ENEMY_IDS,
  INITIAL_UNITS,
  PLAYER_IDS,
  TICK_NUMERAL,
  assignedCount,
  freshOrders,
  playerReady,
  pointsLeft,
  previewAll,
  resolveRound,
  unorderedIds,
} from './rules'
import type { OrderBook, OrderType, UnitId, Units } from './rules'
import { SHEET_CSS } from './styles'
import { SHEET_HEIGHT, T } from './theme'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const shortName = (name: string) => name.replace(/ (Company|Banner)$/, '')

/** Big board, focused bottom sheet: one company in the thumb zone at a time. */
export default function SheetPrototype() {
  const [units, setUnits] = useState<Units>(INITIAL_UNITS)
  const [orders, setOrders] = useState<OrderBook>(freshOrders)
  const [round, setRound] = useState(1)
  const [phase, setPhase] = useState<'planning' | 'resolving'>('planning')

  const [selected, setSelected] = useState<UnitId | null>(null)
  const [sheetUnit, setSheetUnit] = useState<UnitId | null>(null)
  const [closing, setClosing] = useState(false)
  const [activeSlot, setActiveSlot] = useState(0)
  const [lastPlaced, setLastPlaced] = useState<{ slot: number; stamp: number } | null>(null)

  const [tickLabel, setTickLabel] = useState<string | null>(null)
  const [fx, setFx] = useState<BoardFx | null>(null)
  const [bumped, setBumped] = useState<UnitId[]>([])

  const [sheetH, setSheetH] = useState(SHEET_HEIGHT)
  const [barH, setBarH] = useState(148)
  const [boardWidth, setBoardWidth] = useState(0)
  /** Whatever chrome sits above us (the prototype nav) is measured, not assumed. */
  const [topInset, setTopInset] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const closeTimer = useRef<number | null>(null)
  /** Target bottom padding of the stage; read instead of the mid-transition value. */
  const stagePad = useRef(6)
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

  const stagePadding = sheetUnit && !closing ? Math.max(10, sheetH - barH + 8) : 6
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
    const measureInset = () => {
      const root = rootRef.current
      if (!root) return
      setTopInset(Math.max(0, Math.round(root.getBoundingClientRect().top + window.scrollY)))
    }
    measureInset()
    window.addEventListener('resize', measureInset)
    return () => window.removeEventListener('resize', measureInset)
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
  const ready = playerReady(units, orders)
  const waiting = useMemo(() => unorderedIds(units, orders), [units, orders])
  const unspent = pointsLeft(units, orders)

  // Every company's plan is simulated together, so blocked steps show up in the
  // preview exactly as they will when the round runs.
  const previews = useMemo(
    () => previewAll(units, planning ? orders : freshOrders()),
    [units, orders, planning],
  )

  const closeSheet = useCallback(() => {
    if (!sheetUnit || closing) return
    // The board and the stage behind it both dismiss, so never stack two timers.
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    setClosing(true)
    setSelected(null)
    closeTimer.current = window.setTimeout(() => {
      if (!alive.current) return
      setSheetUnit(null)
      setClosing(false)
    }, 240)
  }, [sheetUnit, closing])

  const showUnit = useCallback(
    (id: UnitId) => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
      setClosing(false)
      setSelected(id)
      setSheetUnit(id)
      const slots = orders[id]
      const firstEmpty = slots.findIndex((slot) => slot === null)
      setActiveSlot(firstEmpty === -1 ? 2 : firstEmpty)
      setLastPlaced(null)
    },
    [orders],
  )

  const openSheet = useCallback(
    (id: UnitId) => {
      if (!planning) return
      if (sheetUnit === id && !closing) {
        closeSheet()
        return
      }
      showUnit(id)
    },
    [planning, sheetUnit, closing, closeSheet, showUnit],
  )

  /** The board is a dismiss surface while the sheet is up: any tap drops it. */
  const tapBoard = useCallback(
    (id: UnitId) => {
      if (sheetUnit && !closing) {
        closeSheet()
        return
      }
      openSheet(id)
    },
    [sheetUnit, closing, closeSheet, openSheet],
  )

  /** Swiping the sheet sideways walks your own line, left to right. */
  const cycleUnit = useCallback(
    (step: number) => {
      const from = sheetUnit && PLAYER_IDS.includes(sheetUnit) ? PLAYER_IDS.indexOf(sheetUnit) : 0
      for (let hop = 1; hop <= PLAYER_IDS.length; hop += 1) {
        const id =
          PLAYER_IDS[
            (((from + step * hop) % PLAYER_IDS.length) + PLAYER_IDS.length) % PLAYER_IDS.length
          ]
        if (units[id].models > 0) {
          showUnit(id)
          return
        }
      }
    },
    [sheetUnit, units, showUnit],
  )

  const placeOrder = useCallback(
    (order: OrderType) => {
      const id = sheetUnit
      if (!id || !PLAYER_IDS.includes(id)) return
      const slots = [...orders[id]]
      const target = slots[activeSlot] === null ? activeSlot : slots.findIndex((slot) => slot === null)
      if (target === -1) return
      slots[target] = order
      const nextOrders = { ...orders, [id]: slots }
      setOrders(nextOrders)
      setLastPlaced({ slot: target, stamp: Date.now() })
      const next = slots.findIndex((slot) => slot === null)
      setActiveSlot(next === -1 ? target : next)
      // The sheet has nothing left to ask for once the whole line is ordered:
      // drop it and hand the screen back to the board and the commit bar.
      if (playerReady(units, nextOrders)) closeSheet()
    },
    [sheetUnit, activeSlot, orders, units, closeSheet],
  )

  const clearSlot = useCallback(
    (slot: number) => {
      const id = sheetUnit
      if (!id) return
      setOrders((previous) => {
        const slots = [...previous[id]]
        slots[slot] = null
        return { ...previous, [id]: slots }
      })
      setActiveSlot(slot)
      setLastPlaced(null)
    },
    [sheetUnit],
  )

  const reset = useCallback(() => {
    run.current += 1
    setUnits(INITIAL_UNITS)
    setOrders(freshOrders())
    setRound(1)
    setPhase('planning')
    setFx(null)
    setBumped([])
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
      setBumped(frame.blocked)
      await sleep(820)
      if (!live()) return
      setBumped([])
      if (frame.contact) {
        setFx({ id: frame.tick, strikes: frame.strikes, clashes: frame.clashes })
        // Give each extra clash a beat of its own before the losses land.
        await sleep(420 + frame.clashes.length * 110)
        if (!live()) return
        setUnits(frame.afterCombat)
        await sleep(820)
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

  const commitButton = () => {
    // Strict gate: no commit until every living company has spent all three points.
    const label = !planning
      ? 'Resolving the round…'
      : ready
        ? 'Commit orders'
        : waiting.length > 1
          ? `${waiting.length} companies need orders`
          : `${unspent} point${unspent === 1 ? '' : 's'} unspent`
    return (
      <button
        type="button"
        className={`sh-commit${ready && planning ? ' sh-commit-ready' : ''}`}
        disabled={!ready || !planning}
        onClick={commit}
      >
        {label}
      </button>
    )
  }

  const roster: RosterEntry[] = PLAYER_IDS.map((id) => ({
    id,
    badge: units[id].badge,
    name: units[id].name,
    assigned: assignedCount(orders[id]),
    alive: units[id].models > 0,
    active: sheetUnit === id,
  }))

  const clashLine = fx
    ? fx.clashes
        .map(
          (clash) =>
            `${shortName(units[clash.player].name)} × ${shortName(units[clash.enemy].name)}`,
        )
        .join(' · ')
    : null

  return (
    <div
      ref={rootRef}
      className="sh-root"
      style={topInset ? { height: `calc(100dvh - ${topInset}px)`, maxHeight: `calc(100dvh - ${topInset}px)` } : undefined}
    >
      <style>{SHEET_CSS}</style>
      <div className="sh-column">
        <header className="sh-header">
          <div className="sh-round">
            <small>Elmsford Ford</small>
            Round {round}
          </div>
          <div className="sh-phase">
            <span className="sh-dot" />
            {planning
              ? ready
                ? 'Ready'
                : `${waiting.length} to order`
              : `Tick ${tickLabel ?? TICK_NUMERAL[0]}`}
          </div>
          <button type="button" className="sh-reset" onClick={reset}>
            Reset
          </button>
        </header>

        <div
          ref={stageRef}
          className="sh-stage"
          style={{ paddingBottom: stagePadding }}
          onPointerDown={closeSheet}
        >
          <Board
            units={units}
            orders={orders}
            selected={selected}
            previews={previews}
            planning={planning}
            fx={fx}
            bumped={bumped}
            width={boardWidth}
            onSelect={tapBoard}
            onBackdrop={closeSheet}
          />
        </div>

        <div ref={barRef} className={`sh-bar${sheetUnit ? ' sh-bar-hidden' : ''}`}>
          <div className="sh-chips">
            {PLAYER_IDS.map((id) => {
              const unit = units[id]
              const assigned = assignedCount(orders[id])
              const done = assigned === 3 || unit.models <= 0
              return (
                <button
                  key={id}
                  type="button"
                  className={`sh-chip${done ? '' : ' sh-chip-need'}`}
                  onClick={() => openSheet(id)}
                  disabled={!planning || unit.models <= 0}
                >
                  <span className="sh-chip-badge" style={{ background: T.player }}>
                    {unit.badge}
                  </span>
                  <span className="sh-chip-body">
                    <b>{shortName(unit.name)}</b>
                    <em>{unit.models <= 0 ? 'routed' : done ? 'ordered' : `${assigned}/3`}</em>
                  </span>
                  <span className="sh-chip-pips">
                    {[0, 1, 2].map((pip) => (
                      <i key={pip} className={pip < assigned ? 'sh-on' : undefined} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
          {/* one status line: the enemy while you plan, the blow-by-blow while it runs */}
          <div className="sh-foe">
            {planning ? (
              <>
                <span className="sh-foe-swatch" style={{ background: T.enemy }} />
                {ENEMY_IDS.filter((id) => units[id].models > 0).length} enemy banners ·{' '}
                {ENEMY_IDS.reduce((total, id) => total + units[id].models, 0)} models · holding
              </>
            ) : clashLine ? (
              <>
                <span className="sh-foe-swatch" style={{ background: T.gold }} />
                Tick {tickLabel} · {clashLine}
              </>
            ) : (
              <>
                <span className="sh-foe-swatch" style={{ background: T.gold }} />
                Tick {tickLabel ?? TICK_NUMERAL[0]} · orders locked
              </>
            )}
          </div>
          {commitButton()}
        </div>

        {sheetUnit && (
          <Sheet
            ref={sheetRef}
            unit={units[sheetUnit]}
            slots={orders[sheetUnit]}
            activeSlot={activeSlot}
            editable={units[sheetUnit].side === 'player'}
            closing={closing}
            lastPlaced={lastPlaced}
            roster={roster}
            onPlace={placeOrder}
            onClearSlot={clearSlot}
            onPickSlot={setActiveSlot}
            onSelectUnit={showUnit}
            onCycle={cycleUnit}
            onClose={closeSheet}
          />
        )}
      </div>
    </div>
  )
}
