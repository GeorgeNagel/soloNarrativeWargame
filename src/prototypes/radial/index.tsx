import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Board from './Board'
import Timeline from './Timeline'
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

const PLAYER_ID = 'player-pikemen'
const ENEMY_ID = 'enemy-pikemen'

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

function freshOrders(): Record<string, OrderSlots> {
  // The enemy AI in this prototype simply holds.
  return { [PLAYER_ID]: emptySlots(), [ENEMY_ID]: ['hold', 'hold', 'hold'] }
}

function firstEmpty(slots: OrderSlots, preferred: number): number {
  if (slots[preferred] == null) return preferred
  const index = slots.findIndex((slot) => slot == null)
  return index === -1 ? preferred : index
}

function RadialPrototype() {
  const [round, setRound] = useState(1)
  const [start, setStart] = useState<UnitSnapshot[]>(() => scenarioUnits())
  const [orders, setOrders] = useState<Record<string, OrderSlots>>(() => freshOrders())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const [phase, setPhase] = useState<Phase>('planning')
  const [playhead, setPlayheadState] = useState(0)

  const playheadRef = useRef(0)
  const raf = useRef<number | null>(null)

  const setPlayhead = useCallback((value: number) => {
    playheadRef.current = value
    setPlayheadState(value)
  }, [])

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    raf.current = null
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

  useEffect(() => () => stop(), [stop])

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

  const frames = useMemo(() => simulate(start, orders), [start, orders])
  const playerSlots = orders[PLAYER_ID] ?? emptySlots()
  const spent = spentPoints(playerSlots)
  const ready = Object.values(orders).every(isComplete)

  const losses = useMemo(
    () =>
      frames.map((frame) =>
        frame.clashes.reduce((total, clash) => total + clash.removed, 0),
      ),
    [frames],
  )

  const addOrder = useCallback(
    (order: OrderType) => {
      if (phase !== 'planning' || selectedId !== PLAYER_ID) return
      const slots = orders[PLAYER_ID] ?? emptySlots()
      if (spentPoints(slots) >= TICKS) return
      const tick = firstEmpty(slots, focusTick)
      if (slots[tick] != null) return
      const next = slots.map((slot, index) => (index === tick ? order : slot))
      setOrders((previous) => ({ ...previous, [PLAYER_ID]: next }))
      setFocusTick(firstEmpty(next, Math.min(TICKS - 1, tick + 1)))
      tweenTo(tick + 1)
    },
    [focusTick, orders, phase, selectedId, tweenTo],
  )

  const removeOrder = useCallback(
    (tick: number) => {
      if (phase !== 'planning') return
      setOrders((previous) => {
        const slots = previous[PLAYER_ID] ?? emptySlots()
        if (slots[tick] == null) return previous
        return {
          ...previous,
          [PLAYER_ID]: slots.map((slot, index) => (index === tick ? null : slot)),
        }
      })
      setFocusTick(tick)
      tweenTo(tick)
    },
    [phase, tweenTo],
  )

  const scrub = useCallback(
    (value: number) => {
      stop()
      setPlayhead(value)
      if (phase === 'resolving') setPhase('review')
    },
    [phase, setPlayhead, stop],
  )

  const focusOn = useCallback(
    (tick: number) => {
      if (phase === 'planning') setFocusTick(tick)
      stop()
      tweenTo(phase === 'planning' && (orders[PLAYER_ID]?.[tick] ?? null) == null ? tick : tick + 1)
    },
    [orders, phase, stop, tweenTo],
  )

  const commit = useCallback(() => {
    if (!ready) return
    setSelectedId(null)
    setPhase('resolving')
    setPlayhead(0)
    runKeys(RESOLVE_KEYS, () => setPhase('review'))
  }, [ready, runKeys, setPlayhead])

  const replay = useCallback(() => {
    setPhase('resolving')
    setPlayhead(0)
    runKeys(RESOLVE_KEYS, () => setPhase('review'))
  }, [runKeys, setPlayhead])

  const nextRound = useCallback(() => {
    stop()
    setStart(frames[frames.length - 1].units.map((unit) => ({ ...unit })))
    setOrders(freshOrders())
    setSelectedId(null)
    setFocusTick(0)
    setPhase('planning')
    setPlayhead(0)
    setRound((value) => value + 1)
  }, [frames, setPlayhead, stop])

  const selectedUnit = start.find((unit) => unit.id === selectedId) ?? null
  const hint = (() => {
    if (phase === 'resolving') return 'resolving · drag the strip to take over'
    if (phase === 'review') return 'scrub the strip to replay the round'
    if (!selectedUnit) return 'tap a unit to bloom its orders'
    const name = selectedUnit.name.toLowerCase()
    if (selectedId === ENEMY_ID) return `${name} · locked · holds all three ticks`
    if (spent >= TICKS) return `${name} · all points spent`
    return `${name} · ${TICKS - spent} left · filling tick ${focusTick + 1}`
  })()

  return (
    <div className="rp-root" style={{ minHeight: '100dvh' }}>
      <style>{STYLES}</style>
      <div className="rp-scanlines" />

      <header className="rp-head">
        <span>
          <b>Round {round}</b> · pike skirmish
        </span>
        <span className="rp-phase">
          {phase === 'planning'
            ? `${spent}/${TICKS} points assigned`
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
          onSelect={setSelectedId}
          onOrder={addOrder}
        />
        <div className="rp-hint">{hint}</div>
      </div>

      <Timeline
        slots={playerSlots}
        focusTick={focusTick}
        playhead={playhead}
        phase={phase}
        losses={losses}
        onScrub={scrub}
        onFocus={focusOn}
        onRemove={removeOrder}
      />

      <div className="rp-actions" style={{ maxWidth: 860, width: '100%', margin: '0 auto' }}>
        {phase === 'planning' ? (
          <button
            type="button"
            className="rp-commit"
            disabled={!ready}
            onClick={commit}
            aria-label="Commit orders"
          >
            {ready ? 'Commit orders' : `Commit · ${TICKS - spent} pt${TICKS - spent === 1 ? '' : 's'} unspent`}
          </button>
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
