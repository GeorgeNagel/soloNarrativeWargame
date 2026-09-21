import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import Board from './Board'
import Timeline from './Timeline'
import type { StripUnit, TickReport } from './Timeline'
import { COLORS, STYLES } from './theme'
import {
  TICKS,
  emptySlots,
  isComplete,
  scenarioUnits,
  simulate,
  spentPoints,
} from './model'
import type { OrderSlots, OrderType, Phase, UnitSnapshot } from './model'

interface Key {
  p: number
  t: number
}

/** Motion, then a held beat at each tick boundary for the clash. */
const RESOLVE_KEYS: Key[] = [
  { p: 0, t: 0 },
  { p: 1, t: 820 },
  { p: 1, t: 1260 },
  { p: 2, t: 2080 },
  { p: 2, t: 2520 },
  { p: 3, t: 3340 },
  { p: 3, t: 3860 },
]

/** Beat held on the resolved board before the next round opens itself. */
const ADVANCE_HOLD = 950

/** A round that has already resolved, kept so the strip can replay it. */
interface Resolved {
  round: number
  start: UnitSnapshot[]
  orders: Record<string, OrderSlots>
}

/** The enemy AI in this prototype simply holds. */
function freshOrders(units: readonly UnitSnapshot[]): Record<string, OrderSlots> {
  const orders: Record<string, OrderSlots> = {}
  for (const unit of units) {
    orders[unit.id] = unit.side === 'player' ? emptySlots() : ['hold', 'hold', 'hold']
  }
  return orders
}

function firstEmpty(slots: OrderSlots, preferred = 0): number {
  if ((slots[preferred] ?? null) == null) return preferred
  const index = slots.findIndex((slot) => slot == null)
  return index === -1 ? preferred : index
}

function RadialPrototype() {
  const [round, setRound] = useState(1)
  const [start, setStart] = useState<UnitSnapshot[]>(() => scenarioUnits())
  const [orders, setOrders] = useState<Record<string, OrderSlots>>(() =>
    freshOrders(scenarioUnits()),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const [phase, setPhase] = useState<Phase>('planning')
  const [playhead, setPlayheadState] = useState(0)
  // The round that just resolved, and whether the strip is showing it
  // instead of the round now being planned.
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [viewingPast, setViewingPast] = useState(false)

  const playheadRef = useRef(0)
  const raf = useRef<number | null>(null)
  const advanceTimer = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Fill exactly what is left under whatever shell renders us, so the board
  // never pushes the page into a scroll on a phone.
  useLayoutEffect(() => {
    const fit = () => {
      const node = rootRef.current
      if (!node) return
      const top = node.getBoundingClientRect().top + window.scrollY
      node.style.height = `${Math.max(460, window.innerHeight - top)}px`
    }
    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('orientationchange', fit)
    return () => {
      window.removeEventListener('resize', fit)
      window.removeEventListener('orientationchange', fit)
    }
  }, [])

  const setPlayhead = useCallback((value: number) => {
    playheadRef.current = value
    setPlayheadState(value)
  }, [])

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    raf.current = null
  }, [])

  /** Drop a pending auto-advance: the player has taken the round over. */
  const cancelAdvance = useCallback(() => {
    if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current)
    advanceTimer.current = null
  }, [])

  const runKeys = useCallback(
    (keys: Key[], done?: () => void) => {
      stop()
      const began = performance.now()
      const last = keys[keys.length - 1]
      const step = (now: number) => {
        const elapsed = now - began
        if (elapsed >= last.t) {
          setPlayhead(last.p)
          raf.current = null
          done?.()
          return
        }
        let index = 0
        while (index < keys.length - 2 && keys[index + 1].t <= elapsed) index += 1
        const a = keys[index]
        const b = keys[index + 1]
        const span = Math.max(1, b.t - a.t)
        const fraction = Math.max(0, Math.min(1, (elapsed - a.t) / span))
        setPlayhead(a.p + (b.p - a.p) * fraction)
        raf.current = requestAnimationFrame(step)
      }
      raf.current = requestAnimationFrame(step)
    },
    [setPlayhead, stop],
  )

  useEffect(
    () => () => {
      stop()
      cancelAdvance()
    },
    [cancelAdvance, stop],
  )

  const tweenTo = useCallback(
    (target: number) => {
      const from = playheadRef.current
      const distance = Math.abs(target - from)
      runKeys([
        { p: from, t: 0 },
        { p: target, t: 220 + distance * 260 },
      ])
    },
    [runKeys],
  )

  // While replaying the last round the board and the strip run off that
  // round's snapshot; planning state underneath is untouched.
  const past = viewingPast ? resolved : null
  const viewStart = past ? past.start : start
  const viewOrders = past ? past.orders : orders

  const frames = useMemo(() => simulate(viewStart, viewOrders), [viewStart, viewOrders])
  const playerUnits = useMemo(() => start.filter((unit) => unit.side === 'player'), [start])
  const viewPlayerUnits = useMemo(
    () => (past ? past.start.filter((unit) => unit.side === 'player') : playerUnits),
    [past, playerUnits],
  )
  const totalPoints = playerUnits.length * TICKS
  const spent = playerUnits.reduce(
    (total, unit) => total + spentPoints(orders[unit.id] ?? emptySlots()),
    0,
  )
  const unitsReady = playerUnits.filter((unit) =>
    isComplete(orders[unit.id] ?? emptySlots()),
  ).length
  // Strict gate: every file spends all three points or nothing is committed.
  const ready = unitsReady === playerUnits.length

  const strip: StripUnit[] = useMemo(
    () =>
      viewPlayerUnits.map((unit) => ({
        id: unit.id,
        sigil: unit.sigil,
        name: unit.name,
        slots: viewOrders[unit.id] ?? emptySlots(),
        blocked: Array.from({ length: TICKS }, (_, tick) =>
          (frames[tick + 1]?.blocked ?? []).some((block) => block.id === unit.id),
        ),
      })),
    [frames, viewOrders, viewPlayerUnits],
  )

  const report: TickReport[] = useMemo(
    () =>
      Array.from({ length: TICKS }, (_, tick) => {
        const clashes = frames[tick + 1]?.clashes ?? []
        return {
          clashes: clashes.length,
          playerLoss: clashes.reduce((total, clash) => total + clash.playerLoss, 0),
          enemyLoss: clashes.reduce((total, clash) => total + clash.enemyLoss, 0),
        }
      }),
    [frames],
  )

  /** The next file with points left, walking round the roster from `afterId`. */
  const nextUnordered = useCallback(
    (state: Record<string, OrderSlots>, afterId: string | null): UnitSnapshot | null => {
      const from = afterId ? playerUnits.findIndex((unit) => unit.id === afterId) : -1
      for (let step = 1; step <= playerUnits.length; step += 1) {
        const unit = playerUnits[(from + step + playerUnits.length) % playerUnits.length]
        if (!isComplete(state[unit.id] ?? emptySlots())) return unit
      }
      return null
    },
    [playerUnits],
  )

  const selectUnit = useCallback(
    (id: string | null, tick?: number) => {
      setSelectedId(id)
      if (!id) return
      const slots = orders[id] ?? emptySlots()
      const wanted = tick ?? firstEmpty(slots)
      if (isComplete(slots) && tick == null) {
        setFocusTick(TICKS - 1)
        return
      }
      setFocusTick(Math.min(TICKS - 1, wanted))
      tweenTo(Math.min(TICKS, (slots[wanted] ?? null) == null ? wanted : wanted + 1))
    },
    [orders, tweenTo],
  )

  const addOrder = useCallback(
    (order: OrderType) => {
      if (phase !== 'planning' || !selectedId) return
      const unit = playerUnits.find((candidate) => candidate.id === selectedId)
      if (!unit) return
      const slots = orders[selectedId] ?? emptySlots()
      if (spentPoints(slots) >= TICKS) return
      const tick = firstEmpty(slots, focusTick)
      if (slots[tick] != null) return
      const next = slots.map((slot, index) => (index === tick ? order : slot))
      const updated = { ...orders, [selectedId]: next }
      setOrders(updated)

      if (isComplete(next)) {
        // The file is done: hand the bloom to the next one that still owes
        // points, so you never have to go hunting for it.
        const following = nextUnordered(updated, selectedId)
        if (following) {
          const followingSlots = updated[following.id] ?? emptySlots()
          const followingTick = firstEmpty(followingSlots)
          setSelectedId(following.id)
          setFocusTick(followingTick)
          tweenTo(followingTick)
        } else {
          setSelectedId(null)
          tweenTo(TICKS)
        }
        return
      }

      setFocusTick(firstEmpty(next, Math.min(TICKS - 1, tick + 1)))
      tweenTo(tick + 1)
    },
    [focusTick, nextUnordered, orders, phase, playerUnits, selectedId, tweenTo],
  )

  const removeOrder = useCallback(
    (unitId: string, tick: number) => {
      if (phase !== 'planning') return
      setOrders((previous) => {
        const slots = previous[unitId] ?? emptySlots()
        if (slots[tick] == null) return previous
        return {
          ...previous,
          [unitId]: slots.map((slot, index) => (index === tick ? null : slot)),
        }
      })
      setSelectedId(unitId)
      setFocusTick(tick)
      tweenTo(tick)
    },
    [phase, tweenTo],
  )

  const scrub = useCallback(
    (value: number) => {
      stop()
      // Taking hold of the strip cancels the hand-off to the next round.
      cancelAdvance()
      setPlayhead(value)
      if (phase === 'resolving') setPhase('review')
    },
    [cancelAdvance, phase, setPlayhead, stop],
  )

  const focusOn = useCallback(
    (tick: number) => {
      stop()
      cancelAdvance()
      if (phase !== 'planning') {
        tweenTo(tick + 1)
        return
      }
      setFocusTick(tick)
      const slots = selectedId ? orders[selectedId] ?? emptySlots() : emptySlots()
      tweenTo((slots[tick] ?? null) == null ? tick : tick + 1)
    },
    [cancelAdvance, orders, phase, selectedId, stop, tweenTo],
  )

  const pickCell = useCallback(
    (unitId: string, tick: number) => {
      if (phase !== 'planning') {
        cancelAdvance()
        tweenTo(tick + 1)
        return
      }
      selectUnit(unitId, tick)
    },
    [cancelAdvance, phase, selectUnit, tweenTo],
  )

  /**
   * Hand the board to the next round: the round just fought is kept whole so
   * the strip can still be scrubbed back through it.
   */
  const nextRound = useCallback(() => {
    stop()
    cancelAdvance()
    const survivors = frames[frames.length - 1].units.map((unit) => ({ ...unit }))
    setResolved({ round, start, orders })
    setViewingPast(false)
    setStart(survivors)
    setOrders(freshOrders(survivors))
    setSelectedId(null)
    setFocusTick(0)
    setPhase('planning')
    setPlayhead(0)
    setRound((value) => value + 1)
  }, [cancelAdvance, frames, orders, round, setPlayhead, start, stop])

  const commit = useCallback(() => {
    if (!ready) return
    cancelAdvance()
    setSelectedId(null)
    setPhase('resolving')
    setPlayhead(0)
    runKeys(RESOLVE_KEYS, () => {
      setPhase('review')
      // The round resolves and then opens the next one by itself; a beat is
      // held first so the last clash reads.
      advanceTimer.current = window.setTimeout(nextRound, ADVANCE_HOLD)
    })
  }, [cancelAdvance, nextRound, ready, runKeys, setPlayhead])

  const replay = useCallback(() => {
    cancelAdvance()
    setPhase('resolving')
    setPlayhead(0)
    runKeys(RESOLVE_KEYS, () => setPhase('review'))
  }, [cancelAdvance, runKeys, setPlayhead])

  /** Step back into the round that has already been fought. */
  const openPast = useCallback(() => {
    if (!resolved) return
    cancelAdvance()
    setSelectedId(null)
    setViewingPast(true)
    setPhase('resolving')
    setPlayhead(0)
    runKeys(RESOLVE_KEYS, () => setPhase('review'))
  }, [cancelAdvance, resolved, runKeys, setPlayhead])

  const closePast = useCallback(() => {
    stop()
    setViewingPast(false)
    setSelectedId(null)
    setPhase('planning')
    setPlayhead(0)
  }, [setPlayhead, stop])

  const selectedUnit = start.find((unit) => unit.id === selectedId) ?? null
  const hint = (() => {
    if (past) return `round ${past.round} · scrub the strip · resume when you like`
    if (phase === 'resolving') return 'resolving · drag the strip to take over'
    if (phase === 'review') return 'resolved · scrub the strip, or wait for the next round'
    if (!selectedUnit) {
      if (ready) return 'every file ordered · commit when you like'
      if (spent === 0 && resolved) return 'new round · tap a pulsing ring to order a file'
      const owing = playerUnits.length - unitsReady
      return `${owing} file${owing === 1 ? '' : 's'} still owe points · tap a pulsing ring`
    }
    const name = selectedUnit.name.toLowerCase()
    if (selectedUnit.side === 'enemy') return `${name} · locked · holds all three ticks`
    const left = TICKS - spentPoints(orders[selectedUnit.id] ?? emptySlots())
    if (left <= 0) return `${name} · ordered · tap a cell to change a tick`
    return `${name} · ${left} left · filling tick ${focusTick + 1}`
  })()

  return (
    <div className="rp-root" ref={rootRef} style={{ height: '100dvh' }}>
      <style>{STYLES}</style>
      <div className="rp-scanlines" />

      <header className="rp-head">
        <span>
          <b>Round {past ? past.round : round}</b> · pike skirmish
        </span>
        <span className="rp-phase">
          {past
            ? 'replay'
            : phase === 'planning'
              ? `${spent}/${totalPoints} pts · ${unitsReady}/${playerUnits.length} files`
              : phase === 'resolving'
                ? 'resolving'
                : 'resolved · replayable'}
        </span>
      </header>

      <div className="rp-boardwrap">
        <Board
          frames={frames}
          playhead={playhead}
          orders={orders}
          selectedId={selectedId}
          editable={phase === 'planning'}
          onSelect={(id) => selectUnit(id)}
          onOrder={addOrder}
        />
        <div className="rp-hint">{hint}</div>
      </div>

      <Timeline
        units={strip}
        selectedId={selectedId}
        focusTick={focusTick}
        playhead={playhead}
        phase={phase}
        report={report}
        onScrub={scrub}
        onFocus={focusOn}
        onPick={pickCell}
        onRemove={removeOrder}
      />

      <div className="rp-actions" style={{ maxWidth: 860, width: '100%', margin: '0 auto' }}>
        {past ? (
          <>
            <button
              type="button"
              className="rp-ghostbtn"
              onClick={phase === 'resolving' ? () => scrub(TICKS) : openPast}
            >
              {phase === 'resolving' ? 'Skip' : 'Replay'}
            </button>
            <button
              type="button"
              className="rp-commit"
              onClick={closePast}
              style={{ color: COLORS.player, borderColor: COLORS.player }}
            >
              Back to round {round}
            </button>
          </>
        ) : phase === 'planning' ? (
          <>
            {resolved && (
              <button type="button" className="rp-ghostbtn" onClick={openPast}>
                Replay round {resolved.round}
              </button>
            )}
            <button
              type="button"
              className="rp-commit"
              disabled={!ready}
              onClick={commit}
              aria-label="Commit orders"
            >
              {ready
                ? 'Commit orders'
                : `Commit · ${totalPoints - spent} pt${totalPoints - spent === 1 ? '' : 's'} unspent`}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="rp-ghostbtn"
              onClick={phase === 'resolving' ? () => scrub(TICKS) : replay}
            >
              {phase === 'resolving' ? 'Skip' : 'Replay'}
            </button>
            <button
              type="button"
              className="rp-commit"
              onClick={nextRound}
              style={{ color: COLORS.player, borderColor: COLORS.player }}
            >
              Order next round
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default RadialPrototype
