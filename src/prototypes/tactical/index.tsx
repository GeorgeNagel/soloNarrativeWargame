import { useEffect, useMemo, useState } from 'react'
import Board from './Board'
import OrdersConsole from './OrdersConsole'
import type { LogRow, PadAction, SlotFocus } from './OrdersConsole'
import { CSS } from './theme'
import {
  HOLD,
  boardTiles,
  canShoot,
  clampTurns,
  initialUnits,
  isReady,
  profileOf,
  turnsIn,
} from './model'
import type { OrderBook, OrderPhase, RoundOrder, UnitState } from './model'
import { d6, plannedTicks, previewAll, resolveRound, survivors } from './sim'
import type { MoveTick, PreviewMap, RoundResult } from './sim'

const SCENARIO = 'ST. AUBIN FORD'
/** A turn phase is a quick beat; giving up ground takes longer. */
const TURN_MS = 420
const MOVE_MS = 560
const SHOOT_MS = 760
const CLASH_MS = 900
/** Each extra engagement gets its own beat, so they read in order. */
const CLASH_STAGGER_MS = 260

/** A round plays out in the book's order: all the moving, then shoot, then melee. */
type PlaybackStep = 'move' | 'shoot' | 'clash'

interface Playback {
  result: RoundResult
  /** The movement ticks worth watching — turn phases nobody used are dropped. */
  ticks: MoveTick[]
  tick: number
  step: PlaybackStep
}

function freshOrders(units: UnitState[]): OrderBook {
  const next: OrderBook = {}
  for (const unit of units) {
    // The AI opponent in this prototype just stands fast.
    next[unit.id] = unit.side === 'enemy' ? HOLD : null
  }
  return next
}

function TacticalConsole() {
  const tiles = useMemo(() => boardTiles(), [])
  const [units, setUnits] = useState<UnitState[]>(() => initialUnits())
  const [orders, setOrders] = useState<OrderBook>(() => freshOrders(initialUnits()))
  const [round, setRound] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>('plr-1')
  const [focus, setFocus] = useState<SlotFocus | null>({
    unitId: 'plr-1',
    phase: 'before',
  })
  const [playback, setPlayback] = useState<Playback | null>(null)

  const playing = playback !== null
  const playerUnits = units.filter((unit) => unit.side === 'player')
  const enemyUnits = units.filter((unit) => unit.side === 'enemy')

  // ── playback clock ──────────────────────────────────────
  useEffect(() => {
    if (!playback) return
    const { result, ticks, tick, step } = playback
    const beats = Math.max(1, result.engagements.length)
    const ms =
      step === 'move'
        ? ticks[tick].kind === 'turn'
          ? TURN_MS
          : MOVE_MS
        : step === 'shoot'
          ? SHOOT_MS
          : CLASH_MS + (beats - 1) * CLASH_STAGGER_MS
    const timer = window.setTimeout(() => {
      if (step === 'move') {
        if (tick + 1 < ticks.length) {
          setPlayback({ ...playback, tick: tick + 1 })
          return
        }
        // a round with nothing loosed skips straight to the melee
        setPlayback({ ...playback, step: result.shots.length > 0 ? 'shoot' : 'clash' })
        return
      }
      if (step === 'shoot') {
        setPlayback({ ...playback, step: 'clash' })
        return
      }
      const settled = survivors(result)
      const next =
        settled.find((unit) => unit.id === selectedId) ??
        settled.find((unit) => unit.side === 'player') ??
        null
      setUnits(settled)
      setOrders(freshOrders(settled))
      setSelectedId(next ? next.id : null)
      setFocus(next && next.side === 'player' ? { unitId: next.id, phase: 'before' } : null)
      setRound((value) => value + 1)
      setPlayback(null)
    }, ms)
    return () => window.clearTimeout(timer)
  }, [playback, selectedId])

  // ── selection ───────────────────────────────────────────
  const nextUnreadyFrom = (
    afterId: string | null,
    book: OrderBook = orders,
  ): string | null => {
    const roster = playerUnits
    if (roster.length === 0) return null
    const start = afterId ? roster.findIndex((unit) => unit.id === afterId) : -1
    for (let step = 1; step <= roster.length; step += 1) {
      const unit = roster[(start + step + roster.length) % roster.length]
      if (!isReady(book[unit.id])) return unit.id
    }
    return null
  }

  const select = (id: string) => {
    setSelectedId(id)
    const unit = units.find((candidate) => candidate.id === id)
    if (!unit || unit.side === 'enemy') {
      setFocus(null)
      return
    }
    setFocus({ unitId: id, phase: 'before' })
  }

  const cycle = (delta: number) => {
    if (playing || units.length === 0) return
    const index = units.findIndex((unit) => unit.id === selectedId)
    const next = units[(index + delta + units.length) % units.length]
    select(next.id)
  }

  // ── order editing ───────────────────────────────────────
  /**
   * The pad writes the round in the sequence the rules resolve it, and the focus
   * follows forward: a wheel pressed while writing the advance starts the turns
   * that come after it. Pressing the opposite wheel steps a turn phase back, so
   * an over-turned phase is corrected rather than wiped. Writing anything at all
   * arms the unit — an order is committed whole at the end of planning.
   */
  const order = (action: PadAction) => {
    if (playing || !focus) return
    const unit = units.find((candidate) => candidate.id === focus.unitId)
    if (!unit || unit.side === 'enemy') return

    const current: RoundOrder = orders[unit.id] ?? HOLD
    let phase: OrderPhase = focus.phase
    let next: RoundOrder = current

    if (action === 'hold') {
      next = HOLD
      phase = 'advance'
    } else if (action === 'advance') {
      if (current.advance >= profileOf(unit).movement) return
      next = { ...current, advance: current.advance + 1 }
      phase = 'advance'
    } else {
      const target: OrderPhase = phase === 'advance' ? 'after' : phase
      const turns = clampTurns(turnsIn(current, target) + (action === 'left' ? -1 : 1))
      next = target === 'before' ? { ...current, before: turns } : { ...current, after: turns }
      phase = target
    }

    setOrders({ ...orders, [unit.id]: next })
    setFocus({ unitId: unit.id, phase })
  }

  /** Clearing one phase leaves the rest of the order written. */
  const clearPhase = (unitId: string, phase: OrderPhase) => {
    if (playing) return
    const current = orders[unitId] ?? HOLD
    const next: RoundOrder =
      phase === 'advance' ? { ...current, advance: 0 } : { ...current, [phase]: 0 }
    setOrders({ ...orders, [unitId]: next })
    setSelectedId(unitId)
    setFocus({ unitId, phase })
  }

  /** WIPE takes the whole order away, so the unit reads as unordered again. */
  const clearUnit = (unitId: string) => {
    if (playing) return
    setOrders({ ...orders, [unitId]: null })
    setSelectedId(unitId)
    setFocus({ unitId, phase: 'before' })
  }

  // ── commit gate: every friendly unit ordered ────────────
  const armedCount = playerUnits.filter((unit) => isReady(orders[unit.id])).length
  const ready = playerUnits.length > 0 && armedCount === playerUnits.length

  const commit = () => {
    if (!ready || playing) return
    setFocus(null)
    const result = resolveRound(units, orders, d6)
    const ticks = result.ticks.filter((tick) => !tick.idle)
    setPlayback({
      result,
      ticks,
      tick: 0,
      step: ticks.length > 0 ? 'move' : result.shots.length > 0 ? 'shoot' : 'clash',
    })
  }

  // ── what the board shows right now ──────────────────────
  const result = playback ? playback.result : null
  const liveTick =
    playback && playback.step === 'move' ? playback.ticks[playback.tick] : null
  const showClash = playback?.step === 'clash'
  const showShots = playback?.step === 'shoot'
  const shown = result
    ? showClash
      ? result.units
      : (liveTick?.units ?? result.moved)
    : units
  /** The last movement tick is where a refused advance becomes the truth. */
  const lastMoveTick = Boolean(
    playback && playback.step === 'move' && playback.tick === playback.ticks.length - 1,
  )

  // Every friendly order is dry-run together, so traces account for each other.
  const previews: PreviewMap | null = playing ? null : previewAll(units, orders)
  const ticks = playback
    ? playback.ticks.length
    : playing
      ? 0
      : plannedTicks(units, orders)
  const tickIndex = playback && playback.step === 'move' ? playback.tick : null

  /**
   * The field of fire to draw while planning. Turns only live in the order until
   * the round resolves, so the cone has to come from the dry-run: it shows where
   * the unit will be pointing once the round's moving is done. A unit that gives
   * up ground buys no shot, so it shows no cone at all.
   */
  const arcUnit: UnitState | null = (() => {
    const selected = units.find((unit) => unit.id === selectedId) ?? null
    if (playing || !selected || !canShoot(selected)) return null
    const preview = previews?.[selected.id]
    if (!preview) return selected
    if (preview.advanced) return null
    return { ...selected, pos: preview.pos, facing: preview.facing }
  })()

  // ── live round log ──────────────────────────────────────
  const log: LogRow[] = []
  if (result) {
    const tagOf = (id: string) => shown.find((unit) => unit.id === id)?.tag ?? id
    const sideOf = (id: string) => shown.find((unit) => unit.id === id)?.side
    if (showShots) {
      result.shots.forEach((shot) => {
        log.push({
          k: `${tagOf(shot.shooterId)} ⇢ ${tagOf(shot.targetId)}`,
          v: `d${shot.roll} · +${shot.hits}`,
          tone: sideOf(shot.targetId) === 'player' ? 'hot' : 'ok',
        })
      })
    }
    if (showClash) {
      result.engagements.forEach((fight, i) => {
        const beat = result.engagements.length > 1 ? `${i + 1} · ` : ''
        // one row per blow, so both halves of the engagement are readable
        for (const [blow, targetId] of [
          [fight.a, fight.bId],
          [fight.b, fight.aId],
        ] as const) {
          log.push({
            k: `${beat}${tagOf(
              targetId === fight.bId ? fight.aId : fight.bId,
            )} → ${tagOf(targetId)}${blow.rear ? ' REAR' : ''}`,
            v: `d${blow.roll} · +${blow.hits}`,
            tone: sideOf(targetId) === 'player' ? 'hot' : 'ok',
          })
        }
      })
      for (const id of result.eliminatedIds) {
        log.push({ k: `${tagOf(id)}`, v: 'ELIMINATED', tone: 'warn' })
      }
    }
    if (lastMoveTick || showShots || showClash) {
      for (const id of result.blockedIds) {
        log.push({ k: `${tagOf(id)} ADV`, v: 'BLOCKED', tone: 'warn' })
      }
      for (const id of result.lockedIds) {
        log.push({ k: `${tagOf(id)}`, v: 'HELD IN MELEE', tone: 'warn' })
      }
    }
  }

  const fights = result && showClash ? result.engagements.length : 0
  const over = !playing && (playerUnits.length === 0 || enemyUnits.length === 0)
  const phase = over
    ? playerUnits.length === 0
      ? 'LINE BROKEN — FIELD LOST'
      : 'FIELD HELD — OPFOR BROKEN'
    : playing
      ? showShots
        ? result && result.shots.length > 1
          ? `${result.shots.length} VOLLEYS`
          : 'SHOOTING'
        : showClash
          ? fights > 0
            ? fights > 1
              ? `${fights} ENGAGEMENTS`
              : 'CONTACT — MELEE'
            : 'MOVING DONE — FIELD CLEAR'
          : liveTick?.kind === 'advance'
            ? `TICK ${(tickIndex ?? 0) + 1} — ADVANCE ${liveTick.step}`
            : `TICK ${(tickIndex ?? 0) + 1} — WHEELING`
      : ready
        ? 'ORDERS READY'
        : 'PLANNING'

  return (
    <div className="tc-root">
      <style>{CSS}</style>

      <div className="tc-head">
        <div className="tc-head-cell tc-head-grow">
          <span className="tc-k">Scenario</span>
          <span className="tc-v">{SCENARIO}</span>
        </div>
        <div className="tc-head-cell">
          <span className="tc-k">Round</span>
          <span className="tc-v">{String(round).padStart(2, '0')}</span>
        </div>
        <div className="tc-head-cell">
          <span className="tc-k">Ticks</span>
          <span className="tc-pips">
            {Array.from({ length: ticks }, (_, tick) => (
              <span
                key={tick}
                className={`tc-pip${
                  tickIndex === tick
                    ? ' on'
                    : tickIndex !== null && tick < tickIndex
                      ? ' done'
                      : ''
                }`}
              />
            ))}
          </span>
        </div>
        <div className="tc-head-cell tc-head-phase">
          <span className="tc-k">Phase</span>
          <span
            className={`tc-v tc-phase${playing ? ' live' : ''}${
              !playing && ready ? ' set' : ''
            }`}
          >
            {phase}
          </span>
        </div>
      </div>

      <div className="tc-body">
        <div className="tc-stage">
          <div className="tc-stage-rail">
            <span>
              GRID 7×7 · {playerUnits.length} v {enemyUnits.length}
            </span>
            <span>
              {playing && tickIndex !== null
                ? `RESOLVE ${tickIndex + 1}/${ticks}`
                : playing
                  ? 'RESOLVE — FIGHTING'
                  : `${armedCount}/${playerUnits.length} ARMED`}
            </span>
          </div>
          <div className="tc-boardwrap">
            <Board
              tiles={tiles}
              units={shown}
              selectedId={selectedId}
              onSelect={select}
              previews={previews}
              orders={orders}
              engagements={result && showClash ? result.engagements : []}
              arcUnit={arcUnit}
              shots={result && showShots ? result.shots : []}
              showShots={Boolean(showShots)}
              blockedIds={result && lastMoveTick ? result.blockedIds : []}
              lockedIds={result && lastMoveTick ? result.lockedIds : []}
              showClash={Boolean(showClash)}
              beatKey={round}
              playing={playing}
            />
          </div>
          <div className="tc-stage-rail foot">
            <span>
              TURN · ADVANCE STRAIGHT · TURN · THEN SHOOT AND FIGHT · SHOOT 4 HEXES IN A
              45° CONE, IF YOU DID NOT ADVANCE · REAR 3 EDGES DOUBLE HITS
            </span>
          </div>
        </div>

        <OrdersConsole
          units={shown}
          log={log}
          orders={orders}
          selectedId={selectedId}
          focus={focus}
          playing={playing}
          livePhase={liveTick ? liveTick.phase : null}
          armedCount={armedCount}
          playerCount={playerUnits.length}
          nextUnorderedId={nextUnreadyFrom(selectedId)}
          onSelect={select}
          onFocus={(next) => {
            setSelectedId(next.unitId)
            setFocus(next)
          }}
          onCycle={cycle}
          onOrder={order}
          onClearPhase={clearPhase}
          onClearUnit={clearUnit}
        />
      </div>

      <div className="tc-foot">
        <div className="tc-foot-info">
          <span className="tc-k">Orders</span>
          <span className="tc-v">
            {playing
              ? tickIndex !== null
                ? `RESOLVING TICK ${tickIndex + 1} OF ${ticks}`
                : 'RESOLVING — SHOOTING AND MELEE'
              : `${armedCount}/${playerUnits.length} ORDERED · ${
                  ready
                    ? 'ALL UNITS ARMED'
                    : `${playerUnits.length - armedCount} UNIT${
                        playerUnits.length - armedCount === 1 ? '' : 'S'
                      } SHORT`
                }`}
          </span>
        </div>
        <button type="button" className="tc-commit" disabled={!ready || playing} onClick={commit}>
          {playing ? 'RESOLVING…' : 'COMMIT ORDERS'}
        </button>
      </div>
    </div>
  )
}

export default TacticalConsole
