import { useEffect, useMemo, useState } from 'react'
import Board from './Board'
import OrdersConsole from './OrdersConsole'
import type { ForecastRow, LogRow, SlotFocus } from './OrdersConsole'
import { CSS } from './theme'
import { hexDistance } from '../../engine'
import {
  TICKS_PER_ROUND,
  assignedPoints,
  boardTiles,
  emptySlots,
  initialUnits,
  isFlankAttack,
} from './model'
import type { OrderKind, OrderSlots, UnitState } from './model'
import { previewAll, resolveRound } from './sim'
import type { PreviewMap, TickFrame } from './sim'

const SCENARIO = 'ST. AUBIN FORD'
const MOVE_MS = 640
const CLASH_MS = 900
/** Each extra melee in the same tick gets its own beat, so they read in order. */
const CLASH_STAGGER_MS = 260

interface Playback {
  frames: TickFrame[]
  index: number
  step: 'move' | 'clash'
}

function freshSlots(units: UnitState[]): Record<string, OrderSlots> {
  const next: Record<string, OrderSlots> = {}
  for (const unit of units) {
    // The AI opponent in this prototype just stands fast.
    next[unit.id] =
      unit.side === 'enemy'
        ? Array.from({ length: TICKS_PER_ROUND }, () => 'hold' as OrderKind)
        : emptySlots()
  }
  return next
}

function firstEmpty(queue: OrderSlots): number | null {
  for (let i = 0; i < queue.length; i += 1) if (!queue[i]) return i
  return null
}

function isArmed(unit: UnitState, slots: Record<string, OrderSlots>): boolean {
  return assignedPoints(slots[unit.id] ?? []) >= unit.stats.movement
}

/** Models a defender loses to one attack, with the flank halving already applied. */
function killsFrom(attacker: UnitState, defender: UnitState, flank: boolean): number {
  const defense = flank ? Math.floor(defender.stats.defense / 2) : defender.stats.defense
  const wounds = Math.max(
    0,
    attacker.stats.attack * attacker.models - defense * defender.models,
  )
  return Math.min(defender.models, Math.floor(wounds / defender.stats.hp))
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

  // ── playback clock ──────────────────────────────────────
  useEffect(() => {
    if (!playback) return
    const frame = playback.frames[playback.index]
    const pairs = Math.max(1, Math.ceil(frame.clashes.length / 2))
    const ms =
      playback.step === 'move' ? MOVE_MS : CLASH_MS + (pairs - 1) * CLASH_STAGGER_MS
    const timer = window.setTimeout(() => {
      if (playback.step === 'move') {
        setPlayback({ ...playback, step: 'clash' })
        return
      }
      if (playback.index + 1 < playback.frames.length) {
        setPlayback({ ...playback, index: playback.index + 1, step: 'move' })
        return
      }
      const settled = playback.frames[playback.frames.length - 1].units.filter(
        (unit) => unit.models > 0,
      )
      const survivor =
        settled.find((unit) => unit.id === selectedId) ??
        settled.find((unit) => unit.side === 'player') ??
        null
      setUnits(settled)
      setSlots(freshSlots(settled))
      setSelectedId(survivor ? survivor.id : null)
      setFocus(survivor && survivor.side === 'player' ? { unitId: survivor.id, tick: 0 } : null)
      setRound((value) => value + 1)
      setPlayback(null)
    }, ms)
    return () => window.clearTimeout(timer)
  }, [playback, selectedId])

  // ── selection ───────────────────────────────────────────
  const nextUnorderedFrom = (
    afterId: string | null,
    map: Record<string, OrderSlots> = slots,
  ): string | null => {
    const roster = playerUnits
    if (roster.length === 0) return null
    const start = afterId ? roster.findIndex((unit) => unit.id === afterId) : -1
    for (let step = 1; step <= roster.length; step += 1) {
      const unit = roster[(start + step + roster.length) % roster.length]
      if (!isArmed(unit, map)) return unit.id
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
    const empty = firstEmpty(slots[id] ?? emptySlots())
    setFocus({ unitId: id, tick: empty ?? 0 })
  }

  const cycle = (delta: number) => {
    if (playing || units.length === 0) return
    const index = units.findIndex((unit) => unit.id === selectedId)
    const next = units[(index + delta + units.length) % units.length]
    select(next.id)
  }

  // ── order editing ───────────────────────────────────────
  const addOrder = (kind: OrderKind) => {
    if (playing || !focus) return
    const unit = units.find((candidate) => candidate.id === focus.unitId)
    if (!unit || unit.side === 'enemy') return
    const queue = [...(slots[unit.id] ?? emptySlots())]
    queue[focus.tick] = kind
    const merged = { ...slots, [unit.id]: queue }
    setSlots(merged)

    const empty = firstEmpty(queue)
    if (empty !== null) {
      setFocus({ unitId: unit.id, tick: empty })
      return
    }
    // Queue just filled: hop to the next unit still short of points.
    const next = nextUnorderedFrom(unit.id, merged)
    if (!next) {
      setFocus(null)
      return
    }
    setSelectedId(next)
    setFocus({ unitId: next, tick: firstEmpty(merged[next] ?? emptySlots()) ?? 0 })
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

  // ── commit gate: every friendly unit, every point ───────
  const armedCount = playerUnits.filter((unit) => isArmed(unit, slots)).length
  const playerAssigned = playerUnits.reduce(
    (sum, unit) => sum + assignedPoints(slots[unit.id] ?? []),
    0,
  )
  const playerTotal = playerUnits.reduce((sum, unit) => sum + unit.stats.movement, 0)
  const ready = playerUnits.length > 0 && armedCount === playerUnits.length

  const commit = () => {
    if (!ready || playing) return
    setFocus(null)
    setPlayback({ frames: resolveRound(units, slots), index: 0, step: 'move' })
  }

  // ── what the board shows right now ──────────────────────
  const frame = playback ? playback.frames[playback.index] : null
  const shown = frame ? (playback?.step === 'move' ? frame.moved : frame.units) : units
  const showClash = playback?.step === 'clash'
  const liveTick = frame ? frame.tick : null

  // Every friendly queue is dry-run together, so traces account for each other.
  const previews: PreviewMap | null = playing ? null : previewAll(units, slots)

  // ── engagement forecast, per unit, against the AI's stand-fast ──
  const forecast: ForecastRow[] = []
  if (previews) {
    const foes = units.filter((unit) => unit.side === 'enemy')
    for (const unit of playerUnits) {
      const steps = previews[unit.id] ?? []
      const end = steps[steps.length - 1]
      const endPos = end ? end.pos : unit.pos
      const endFacing = end ? end.facing : unit.facing
      const nearestNow = foes.reduce<number>(
        (best, foe) => Math.min(best, hexDistance(unit.pos, foe.pos)),
        99,
      )
      let target: UnitState | null = null
      let rangeEnd = 99
      for (const foe of foes) {
        const foeSteps = previews[foe.id] ?? []
        const foeEnd = foeSteps[foeSteps.length - 1]
        const foeAt = { ...foe, pos: foeEnd ? foeEnd.pos : foe.pos }
        const distance = hexDistance(endPos, foeAt.pos)
        if (distance < rangeEnd) {
          rangeEnd = distance
          target = foeAt
        }
      }
      const contact = Boolean(target) && rangeEnd === 1
      const me = { ...unit, pos: endPos, facing: endFacing }
      const flanking = contact && target ? isFlankAttack(target, endPos) : false
      const flanked = contact && target ? isFlankAttack(me, target.pos) : false
      forecast.push({
        id: unit.id,
        tag: unit.tag,
        foeTag: target ? target.tag : '—',
        rangeNow: nearestNow === 99 ? 0 : nearestNow,
        rangeEnd: rangeEnd === 99 ? 0 : rangeEnd,
        contact,
        flanking,
        flanked,
        killsFoe: contact && target ? killsFrom(me, target, flanking) : 0,
        killsUs: contact && target ? killsFrom(target, me, flanked) : 0,
        blocked: steps.some((step) => step.blocked),
      })
    }
  }

  // ── live tick log: several melees in one tick, listed ───
  const log: LogRow[] = []
  if (frame) {
    const tagOf = (id: string) => shown.find((unit) => unit.id === id)?.tag ?? id
    if (showClash) {
      frame.clashes.forEach((clash, i) => {
        const defender = shown.find((unit) => unit.id === clash.defenderId)
        log.push({
          k: `${i + 1} · ${tagOf(clash.attackerId)} → ${tagOf(clash.defenderId)}${
            clash.flank ? ' FLANK' : ''
          }`,
          v: `-${clash.kills} MDL`,
          tone: defender?.side === 'player' ? 'hot' : 'ok',
        })
      })
    }
    for (const id of frame.blockedIds) {
      log.push({ k: `${tagOf(id)} ADV`, v: 'BLOCKED', tone: 'warn' })
    }
  }

  const melees = frame ? Math.ceil(frame.clashes.length / 2) : 0
  const wiped =
    !playing && (playerUnits.length === 0 || units.every((unit) => unit.side === 'player'))
  const phase = wiped
    ? playerUnits.length === 0
      ? 'LINE BROKEN — FIELD LOST'
      : 'FIELD HELD — OPFOR BROKEN'
    : playing
    ? showClash
      ? frame?.contact
        ? melees > 1
          ? `${melees} MELEES`
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
              GRID 7×7 · {playerUnits.length} v{' '}
              {units.length - playerUnits.length} PIKE
            </span>
            <span>
              {playing
                ? `RESOLVE ${(liveTick ?? 0) + 1}/3`
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
              clashes={frame?.clashes ?? []}
              blockedIds={frame && !showClash ? frame.blockedIds : []}
              showClash={Boolean(showClash)}
              beatKey={(playback?.index ?? 0) + round * 10}
              playing={playing}
            />
          </div>
          <div className="tc-stage-rail foot">
            <span>ADV = INTO FACED HEX · L60/R60 = WHEEL · REAR 3 EDGES = FLANK, DEF ÷2</span>
          </div>
        </div>

        <OrdersConsole
          units={shown}
          forecast={forecast}
          log={log}
          slots={slots}
          selectedId={selectedId}
          focus={focus}
          playing={playing}
          liveTick={playing ? liveTick : null}
          armedCount={armedCount}
          playerCount={playerUnits.length}
          nextUnorderedId={nextUnorderedFrom(selectedId)}
          onSelect={select}
          onFocus={(next) => {
            setSelectedId(next.unitId)
            setFocus(next)
          }}
          onCycle={cycle}
          onAdd={addOrder}
          onClearSlot={clearSlot}
          onClearUnit={clearUnit}
        />
      </div>

      <div className="tc-foot">
        <div className="tc-foot-info">
          <span className="tc-k">Movement points</span>
          <span className="tc-v">
            {playing
              ? `RESOLVING TICK ${(liveTick ?? 0) + 1} OF ${TICKS_PER_ROUND}`
              : `${playerAssigned}/${playerTotal} ASSIGNED · ${
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
