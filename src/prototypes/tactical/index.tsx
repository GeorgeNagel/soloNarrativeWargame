import { useEffect, useMemo, useState } from 'react'
import Board from './Board'
import OrdersConsole from './OrdersConsole'
import type { LogRow, PadAction, SlotFocus } from './OrdersConsole'
import { CSS } from './theme'
import {
  HOLD,
  canShoot,
  MAX_ADVANCES_PER_TICK,
  TICKS_PER_ROUND,
  boardTiles,
  decidedTicks,
  emptySlots,
  initialUnits,
  isReady,
  profileOf,
  spentAdvances,
} from './model'
import type { OrderSlots, TickOrder, UnitState } from './model'
import { d6, previewAll, resolveRound, survivors } from './sim'
import type { PreviewMap, TickFrame } from './sim'

const SCENARIO = 'ST. AUBIN FORD'
const MOVE_MS = 640
const SHOOT_MS = 760
const CLASH_MS = 900
/** Each extra engagement in the same tick gets its own beat, so they read in order. */
const CLASH_STAGGER_MS = 260

/** A tick plays out in the book's order: move, then shoot, then melee. */
type PlaybackStep = 'move' | 'shoot' | 'clash'

interface Playback {
  frames: TickFrame[]
  index: number
  step: PlaybackStep
}

function freshSlots(units: UnitState[]): Record<string, OrderSlots> {
  const next: Record<string, OrderSlots> = {}
  for (const unit of units) {
    // The AI opponent in this prototype just stands fast.
    next[unit.id] =
      unit.side === 'enemy'
        ? Array.from({ length: TICKS_PER_ROUND }, () => HOLD)
        : emptySlots()
  }
  return next
}

/** The first tick this unit has not decided yet. */
function firstUndecided(queue: OrderSlots): number | null {
  for (let i = 0; i < queue.length; i += 1) if (!queue[i]) return i
  return null
}

function TacticalConsole() {
  const tiles = useMemo(() => boardTiles(), [])
  const [units, setUnits] = useState<UnitState[]>(() => initialUnits())
  const [slots, setSlots] = useState<Record<string, OrderSlots>>(() =>
    freshSlots(initialUnits()),
  )
  const [round, setRound] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>('plr-1')
  const [focus, setFocus] = useState<SlotFocus | null>({ unitId: 'plr-1', tick: 0 })
  const [playback, setPlayback] = useState<Playback | null>(null)

  const playing = playback !== null
  const playerUnits = units.filter((unit) => unit.side === 'player')
  const enemyUnits = units.filter((unit) => unit.side === 'enemy')

  // ── playback clock ──────────────────────────────────────
  useEffect(() => {
    if (!playback) return
    const frame = playback.frames[playback.index]
    const beats = Math.max(1, frame.engagements.length)
    const ms =
      playback.step === 'move'
        ? MOVE_MS
        : playback.step === 'shoot'
          ? SHOOT_MS
          : CLASH_MS + (beats - 1) * CLASH_STAGGER_MS
    const timer = window.setTimeout(() => {
      if (playback.step === 'move') {
        // a tick with nothing loosed skips straight to the melee
        setPlayback({ ...playback, step: frame.shots.length > 0 ? 'shoot' : 'clash' })
        return
      }
      if (playback.step === 'shoot') {
        setPlayback({ ...playback, step: 'clash' })
        return
      }
      if (playback.index + 1 < playback.frames.length) {
        setPlayback({ ...playback, index: playback.index + 1, step: 'move' })
        return
      }
      const settled = survivors(playback.frames)
      const next =
        settled.find((unit) => unit.id === selectedId) ??
        settled.find((unit) => unit.side === 'player') ??
        null
      setUnits(settled)
      setSlots(freshSlots(settled))
      setSelectedId(next ? next.id : null)
      setFocus(next && next.side === 'player' ? { unitId: next.id, tick: 0 } : null)
      setRound((value) => value + 1)
      setPlayback(null)
    }, ms)
    return () => window.clearTimeout(timer)
  }, [playback, selectedId])

  // ── selection ───────────────────────────────────────────
  const nextUnreadyFrom = (
    afterId: string | null,
    map: Record<string, OrderSlots> = slots,
  ): string | null => {
    const roster = playerUnits
    if (roster.length === 0) return null
    const start = afterId ? roster.findIndex((unit) => unit.id === afterId) : -1
    for (let step = 1; step <= roster.length; step += 1) {
      const unit = roster[(start + step + roster.length) % roster.length]
      if (!isReady(map[unit.id] ?? [])) return unit.id
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
    const open = firstUndecided(slots[id] ?? emptySlots())
    setFocus({ unitId: id, tick: open ?? 0 })
  }

  const cycle = (delta: number) => {
    if (playing || units.length === 0) return
    const index = units.findIndex((unit) => unit.id === selectedId)
    const next = units[(index + delta + units.length) % units.length]
    select(next.id)
  }

  // ── order editing ───────────────────────────────────────
  /**
   * Wheels are free, so they set the facing on the focused tick and leave the
   * focus where it is — you will usually want to advance out of the turn. An
   * advance or a hold decides the tick, so the focus moves on.
   */
  const order = (action: PadAction) => {
    if (playing || !focus) return
    const unit = units.find((candidate) => candidate.id === focus.unitId)
    if (!unit || unit.side === 'enemy') return

    const queue = [...(slots[unit.id] ?? emptySlots())]
    const current: TickOrder = queue[focus.tick] ?? { wheel: null, advances: 0 }

    if (action === 'left' || action === 'right') {
      queue[focus.tick] = { ...current, wheel: action }
      setSlots({ ...slots, [unit.id]: queue })
      return
    }

    if (action === 'advance') {
      const left = profileOf(unit).movement - spentAdvances(queue)
      if (left <= 0) return
      queue[focus.tick] = {
        ...current,
        advances: Math.min(current.advances + 1, MAX_ADVANCES_PER_TICK),
      }
    } else {
      queue[focus.tick] = { wheel: null, advances: 0 }
    }

    const merged = { ...slots, [unit.id]: queue }
    setSlots(merged)

    const open = firstUndecided(queue)
    if (open !== null) {
      setFocus({ unitId: unit.id, tick: open })
      return
    }
    // Queue just filled: hop to the next unit with ticks still open.
    const next = nextUnreadyFrom(unit.id, merged)
    if (!next) {
      setFocus(null)
      return
    }
    setSelectedId(next)
    setFocus({ unitId: next, tick: firstUndecided(merged[next] ?? emptySlots()) ?? 0 })
  }

  const clearSlot = (unitId: string, tick: number) => {
    if (playing) return
    const next = [...(slots[unitId] ?? emptySlots())]
    next[tick] = null
    setSlots({ ...slots, [unitId]: next })
    setSelectedId(unitId)
    setFocus({ unitId, tick })
  }

  const clearUnit = (unitId: string) => {
    if (playing) return
    setSlots({ ...slots, [unitId]: emptySlots() })
    setSelectedId(unitId)
    setFocus({ unitId, tick: 0 })
  }

  // ── commit gate: every friendly unit, every tick decided ─
  const armedCount = playerUnits.filter((unit) => isReady(slots[unit.id] ?? [])).length
  const decided = playerUnits.reduce(
    (sum, unit) => sum + decidedTicks(slots[unit.id] ?? []),
    0,
  )
  const ready = playerUnits.length > 0 && armedCount === playerUnits.length

  const commit = () => {
    if (!ready || playing) return
    setFocus(null)
    setPlayback({ frames: resolveRound(units, slots, d6), index: 0, step: 'move' })
  }

  // ── what the board shows right now ──────────────────────
  const frame = playback ? playback.frames[playback.index] : null
  const shown = frame ? (playback?.step === 'clash' ? frame.units : frame.moved) : units
  const showClash = playback?.step === 'clash'
  const showShots = playback?.step === 'shoot'
  const liveTick = frame ? frame.tick : null

  // Every friendly queue is dry-run together, so traces account for each other.
  const previews: PreviewMap | null = playing ? null : previewAll(units, slots)

  /**
   * The field of fire to draw while planning. Wheels only live in the queue
   * until the round resolves, so the cone has to come from the dry-run: it
   * shows where this unit points at the tick being written. A tick spent
   * advancing buys no shot, so that tick shows no cone at all.
   */
  const arcUnit: UnitState | null = (() => {
    const selected = units.find((unit) => unit.id === selectedId) ?? null
    if (playing || !selected || !canShoot(selected)) return null
    if (!focus || focus.unitId !== selected.id) return selected
    const step = previews?.[selected.id]?.[focus.tick]
    if (!step) return selected
    if ((slots[selected.id]?.[focus.tick]?.advances ?? 0) > 0) return null
    return { ...selected, pos: step.pos, facing: step.facing }
  })()

  // ── live tick log ───────────────────────────────────────
  const log: LogRow[] = []
  if (frame) {
    const tagOf = (id: string) => shown.find((unit) => unit.id === id)?.tag ?? id
    const sideOf = (id: string) => shown.find((unit) => unit.id === id)?.side
    if (showShots) {
      frame.shots.forEach((shot) => {
        log.push({
          k: `${tagOf(shot.shooterId)} ⇢ ${tagOf(shot.targetId)}`,
          v: `d${shot.roll} · +${shot.hits}`,
          tone: sideOf(shot.targetId) === 'player' ? 'hot' : 'ok',
        })
      })
    }
    if (showClash) {
      frame.engagements.forEach((fight, i) => {
        const beat = frame.engagements.length > 1 ? `${i + 1} · ` : ''
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
      for (const id of frame.eliminatedIds) {
        log.push({ k: `${tagOf(id)}`, v: 'ELIMINATED', tone: 'warn' })
      }
    }
    for (const id of frame.blockedIds) {
      log.push({ k: `${tagOf(id)} ADV`, v: 'BLOCKED', tone: 'warn' })
    }
  }

  const fights = frame ? frame.engagements.length : 0
  const over = !playing && (playerUnits.length === 0 || enemyUnits.length === 0)
  const phase = over
    ? playerUnits.length === 0
      ? 'LINE BROKEN — FIELD LOST'
      : 'FIELD HELD — OPFOR BROKEN'
    : playing
      ? showShots
        ? frame && frame.shots.length > 1
          ? `${frame.shots.length} VOLLEYS`
          : 'SHOOTING'
        : showClash
        ? fights > 0
          ? fights > 1
            ? `${fights} ENGAGEMENTS`
            : 'CONTACT — MELEE'
          : 'TICK BOUNDARY — CLEAR'
        : `TICK ${(liveTick ?? 0) + 1} — MANOEUVRE`
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
          <span className="tc-k">Tick</span>
          <span className="tc-pips">
            {[0, 1, 2].map((tick) => (
              <span
                key={tick}
                className={`tc-pip${
                  liveTick === tick ? ' on' : liveTick !== null && tick < liveTick ? ' done' : ''
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
              {playing
                ? `RESOLVE ${(liveTick ?? 0) + 1}/${TICKS_PER_ROUND}`
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
              slots={slots}
              engagements={frame && showClash ? frame.engagements : []}
              arcUnit={arcUnit}
              shots={frame && showShots ? frame.shots : []}
              showShots={Boolean(showShots)}
              blockedIds={frame && playback?.step === 'move' ? frame.blockedIds : []}
              showClash={Boolean(showClash)}
              beatKey={(playback?.index ?? 0) + round * 10}
              playing={playing}
            />
          </div>
          <div className="tc-stage-rail foot">
            <span>
              WHEELS FREE · ADV COSTS A HEX · SHOOT 4 HEXES IN A 45° CONE, IF YOU DID NOT
              ADVANCE · REAR 3 EDGES DOUBLE HITS
            </span>
          </div>
        </div>

        <OrdersConsole
          units={shown}
          log={log}
          slots={slots}
          selectedId={selectedId}
          focus={focus}
          playing={playing}
          liveTick={playing ? liveTick : null}
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
          onClearSlot={clearSlot}
          onClearUnit={clearUnit}
        />
      </div>

      <div className="tc-foot">
        <div className="tc-foot-info">
          <span className="tc-k">Orders</span>
          <span className="tc-v">
            {playing
              ? `RESOLVING TICK ${(liveTick ?? 0) + 1} OF ${TICKS_PER_ROUND}`
              : `${decided}/${playerUnits.length * TICKS_PER_ROUND} TICKS SET · ${
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
