import { useEffect, useMemo, useState } from 'react'
import Board from './Board'
import OrdersConsole from './OrdersConsole'
import type { ReadoutRow, SlotFocus } from './OrdersConsole'
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
import { previewPath, resolveRound } from './sim'
import type { TickFrame } from './sim'

const SCENARIO = 'ST. AUBIN FORD'
const MOVE_MS = 640
const CLASH_MS = 940

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

  // ── playback clock ──────────────────────────────────────
  useEffect(() => {
    if (!playback) return
    const ms = playback.step === 'move' ? MOVE_MS : CLASH_MS
    const timer = window.setTimeout(() => {
      if (playback.step === 'move') {
        setPlayback({ ...playback, step: 'clash' })
        return
      }
      if (playback.index + 1 < playback.frames.length) {
        setPlayback({ ...playback, index: playback.index + 1, step: 'move' })
        return
      }
      const settled = playback.frames[playback.frames.length - 1].units
      setUnits(settled)
      setSlots(freshSlots(settled))
      setFocus({ unitId: 'plr-1', tick: 0 })
      setRound((value) => value + 1)
      setPlayback(null)
    }, ms)
    return () => window.clearTimeout(timer)
  }, [playback])

  // ── order editing ───────────────────────────────────────
  const select = (id: string) => {
    setSelectedId(id)
    const unit = units.find((candidate) => candidate.id === id)
    if (!unit || unit.side === 'enemy') {
      setFocus(null)
      return
    }
    const empty = firstEmpty(slots[id] ?? emptySlots())
    setFocus(empty === null ? null : { unitId: id, tick: empty })
  }

  const addOrder = (kind: OrderKind) => {
    if (playing || !selectedId) return
    const queue = slots[selectedId] ?? emptySlots()
    const target =
      focus && focus.unitId === selectedId ? focus.tick : (firstEmpty(queue) ?? null)
    if (target === null) return
    const next = [...queue]
    next[target] = kind
    setSlots({ ...slots, [selectedId]: next })
    const empty = firstEmpty(next)
    setFocus(empty === null ? null : { unitId: selectedId, tick: empty })
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

  // ── commit gate ─────────────────────────────────────────
  const unspent = units.reduce(
    (sum, unit) => sum + (unit.stats.movement - assignedPoints(slots[unit.id] ?? [])),
    0,
  )
  const playerUnits = units.filter((unit) => unit.side === 'player')
  const playerAssigned = playerUnits.reduce(
    (sum, unit) => sum + assignedPoints(slots[unit.id] ?? []),
    0,
  )
  const playerTotal = playerUnits.reduce((sum, unit) => sum + unit.stats.movement, 0)
  const ready = unspent === 0

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

  const selected = shown.find((unit) => unit.id === selectedId) ?? null
  const preview =
    !playing && selected
      ? previewPath(selected, slots[selected.id] ?? emptySlots(), shown)
      : null

  // ── engagement forecast (end of T3, against the AI's stand-fast) ──
  const you = shown.find((unit) => unit.side === 'player') ?? null
  const foe = shown.find((unit) => unit.side === 'enemy') ?? null
  const projected = you && preview && preview.length > 0 ? preview[preview.length - 1] : null
  const readout: ReadoutRow[] = []
  if (you && foe) {
    const now = hexDistance(you.pos, foe.pos)
    const then = projected ? hexDistance(projected.pos, foe.pos) : now
    const contact = then === 1
    const flanking =
      contact && projected ? isFlankAttack(foe, projected.pos) : false
    const flanked =
      contact && projected
        ? isFlankAttack({ ...you, pos: projected.pos, facing: projected.facing }, foe.pos)
        : false
    const wound = (atk: typeof you, def: typeof foe, flank: boolean) =>
      Math.max(
        0,
        atk.stats.attack * atk.models -
          (flank ? Math.floor(def.stats.defense / 2) : def.stats.defense) * def.models,
      )
    readout.push(
      { k: 'RANGE NOW', v: `${now} HEX` },
      { k: 'RANGE @ T3', v: `${then} HEX`, tone: then < now ? 'ok' : undefined },
      {
        k: 'CONTACT',
        v: contact ? 'YES — MELEE' : 'NO',
        tone: contact ? 'warn' : undefined,
      },
      {
        k: 'OUR ARC ON FOE',
        v: !contact ? '—' : flanking ? 'FLANK · DEF ÷2' : 'FRONT',
        tone: contact ? (flanking ? 'ok' : undefined) : undefined,
      },
      {
        k: 'FOE ARC ON US',
        v: !contact ? '—' : flanked ? 'FLANK · DEF ÷2' : 'FRONT',
        tone: contact ? (flanked ? 'hot' : undefined) : undefined,
      },
      {
        k: 'EST. LOSS FOE',
        v: contact
          ? `-${Math.floor(wound(you, foe, flanking) / foe.stats.hp)} MDL`
          : '—',
        tone: contact ? 'ok' : undefined,
      },
      {
        k: 'EST. LOSS OURS',
        v: contact
          ? `-${Math.floor(wound(foe, you, flanked) / you.stats.hp)} MDL`
          : '—',
        tone: contact ? 'hot' : undefined,
      },
    )
  }

  const phase = playing
    ? showClash
      ? frame?.contact
        ? 'CONTACT — MELEE'
        : 'TICK BOUNDARY — NO CONTACT'
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
            <span>GRID 7×7 · POINTY-TOP · AXIAL</span>
            <span>{playing ? `RESOLVE ${(liveTick ?? 0) + 1}/3` : 'PREVIEW LIVE'}</span>
          </div>
          <div className="tc-boardwrap">
            <Board
              tiles={tiles}
              units={shown}
              selectedId={selectedId}
              onSelect={select}
              preview={preview}
              previewUnit={selected}
              slots={slots}
              clashes={frame?.clashes ?? []}
              showClash={Boolean(showClash)}
              beatKey={(playback?.index ?? 0) + round * 10}
              playing={playing}
            />
          </div>
          <div className="tc-stage-rail foot">
            <span>
              ADV = INTO FACED HEX · L60/R60 = WHEEL · REAR 3 EDGES = FLANK, DEF ÷2
            </span>
          </div>
        </div>

        <OrdersConsole
          units={shown}
          readout={readout}
          slots={slots}
          selectedId={selectedId}
          focus={focus}
          playing={playing}
          liveTick={playing ? liveTick : null}
          onSelect={select}
          onFocus={(next) => {
            setSelectedId(next.unitId)
            setFocus(next)
          }}
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
                  unspent === 0 ? 'ALL UNITS ARMED' : `${unspent} UNSPENT`
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
