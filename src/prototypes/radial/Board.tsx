import { useMemo } from 'react'

import { hexCorners, hexEquals, hexNeighbor, hexWidth, hexHeight } from '../../engine'
import type { Hex, Point } from '../../engine'
import RadialControls from './RadialControls'
import { COLORS, sideColor, MONO_STACK } from './theme'
import {
  BOARD_ROWS,
  DIRECTION_ANGLE,
  HEX_SIZE,
  TICKS,
  boardTiles,
  center,
  isOnBoard,
  spentPoints,
  unitsAt,
} from './model'
import type { Frame, OrderSlots, OrderType, RenderUnit, UnitSnapshot } from './model'

const MARGIN = 52
const TRAIL_STEPS = [0.09, 0.19, 0.3]

function key(tile: Hex): string {
  return `${tile.q},${tile.r}`
}

function polar(origin: Point, degrees: number, distance: number): Point {
  const a = (degrees * Math.PI) / 180
  return { x: origin.x + Math.cos(a) * distance, y: origin.y + Math.sin(a) * distance }
}

function cornerPoints(tile: Hex, scale = 1): string {
  return hexCorners(center(tile), HEX_SIZE * scale)
    .map((corner) => `${corner.x.toFixed(2)},${corner.y.toFixed(2)}`)
    .join(' ')
}

function noseWedge(origin: Point, angle: number, inner = 23, tip = 35, spread = 27): string {
  const a = polar(origin, angle - spread, inner)
  const b = polar(origin, angle, tip)
  const c = polar(origin, angle + spread, inner)
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)} L ${c.x.toFixed(2)} ${c.y.toFixed(2)} Z`
}

interface BoardProps {
  frames: Frame[]
  playhead: number
  orders: Record<string, OrderSlots>
  selectedId: string | null
  /** Orders may be edited (planning phase only). */
  editable: boolean
  onSelect: (id: string | null) => void
  onOrder: (order: OrderType) => void
}

function Board({
  frames,
  playhead,
  orders,
  selectedId,
  editable,
  onSelect,
  onOrder,
}: BoardProps) {
  const tiles = useMemo(() => boardTiles(), [])
  const view = useMemo(() => {
    const centers = tiles.map(center)
    const left = Math.min(...centers.map((p) => p.x)) - hexWidth(HEX_SIZE) / 2 - MARGIN
    const top = Math.min(...centers.map((p) => p.y)) - hexHeight(HEX_SIZE) / 2 - MARGIN
    const right = Math.max(...centers.map((p) => p.x)) + hexWidth(HEX_SIZE) / 2 + MARGIN
    const bottom = Math.max(...centers.map((p) => p.y)) + hexHeight(HEX_SIZE) / 2 + MARGIN
    return { left, top, width: right - left, height: bottom - top }
  }, [tiles])

  const live = unitsAt(frames, playhead)
  const trails = TRAIL_STEPS.map((back) => unitsAt(frames, Math.max(0, playhead - back)))
  const selected = live.find((unit) => unit.id === selectedId) ?? null
  const start = frames[0]

  // Every position a unit passes through this round, for traces and ghosts.
  const tracks = start.units.map((unit) => ({
    unit,
    steps: frames.map(
      (frame) => frame.units.find((candidate) => candidate.id === unit.id) ?? unit,
    ),
  }))

  const plannedTiles = new Set<string>()
  for (const track of tracks) {
    if (track.unit.side !== 'player') continue
    for (const step of track.steps) plannedTiles.add(key(step.hex))
  }

  const moveBlocked = (() => {
    if (!selected) return true
    const snapshot = start.units.find((unit) => unit.id === selected.id)
    if (!snapshot) return true
    const target = hexNeighbor(selected.hex, selected.facing)
    const occupied = live.some(
      (other) => other.id !== selected.id && hexEquals(other.hex, target),
    )
    return !isOnBoard(target) || occupied
  })()

  const selectedSpent = selectedId ? spentPoints(orders[selectedId] ?? []) : 0

  return (
    <svg
      className="rp-board"
      viewBox={`${view.left} ${view.top} ${view.width} ${view.height}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={() => onSelect(null)}
      role="group"
      aria-label="Battle board"
    >
      <defs>
        <radialGradient id="rp-token-player" cx="50%" cy="34%">
          <stop offset="0%" stopColor="#123f3c" />
          <stop offset="100%" stopColor="#061218" />
        </radialGradient>
        <radialGradient id="rp-token-enemy" cx="50%" cy="34%">
          <stop offset="0%" stopColor="#431914" />
          <stop offset="100%" stopColor="#140a0b" />
        </radialGradient>
        <filter id="rp-glow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ---- grid ---- */}
      <g>
        {tiles.map((tile) => {
          const home = tile.r === 0 ? 'enemy' : tile.r === BOARD_ROWS - 1 ? 'player' : null
          const planned = plannedTiles.has(key(tile))
          return (
            <g key={key(tile)}>
              <polygon
                points={cornerPoints(tile, 0.985)}
                fill={planned ? 'rgba(87,232,206,0.05)' : 'rgba(255,255,255,0.012)'}
                stroke={home ? sideColor(home) : COLORS.grid}
                strokeOpacity={home ? 0.22 : 1}
                strokeWidth={1}
              />
              <circle cx={center(tile).x} cy={center(tile).y} r={1.4} fill={COLORS.grid} />
            </g>
          )
        })}
      </g>

      {/* ---- planned / resolved traces ---- */}
      <g>
        {tracks.map(({ unit, steps }) => {
          const accent = sideColor(unit.side)
          const points = steps.map((step) => center(step.hex))
          const moves = points.filter(
            (point, index) =>
              index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y,
          )
          if (moves.length < 2) return null
          const d = moves
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
            .join(' ')
          return (
            <g key={`trace-${unit.id}`} opacity={unit.id === selectedId ? 1 : 0.55}>
              <path d={d} fill="none" stroke={accent} strokeOpacity={0.12} strokeWidth={9} />
              <path
                className="rp-march"
                d={d}
                fill="none"
                stroke={accent}
                strokeOpacity={0.75}
                strokeWidth={1.4}
                strokeDasharray="7 7"
              />
            </g>
          )
        })}
      </g>

      {/* ---- ghosted future states ---- */}
      <g>
        {tracks.flatMap(({ unit, steps }) =>
          steps.slice(1).map((step, index) => {
            const tick = index + 1
            const ahead = tick - playhead
            if (ahead <= 0.08) return null
            // A unit that neither moves nor turns needs no ghost of itself.
            const previous = steps[tick - 1]
            if (hexEquals(previous.hex, step.hex) && previous.facing === step.facing) return null
            const strength = Math.max(0.16, 0.62 - ahead * 0.13)
            const at = center(step.hex)
            const accent = sideColor(unit.side)
            const fan = steps
              .slice(1, tick)
              .filter((earlier) => hexEquals(earlier.hex, step.hex)).length
            const label = polar(at, -90 - fan * 26, 30)
            return (
              <g key={`ghost-${unit.id}-${tick}`} opacity={strength}>
                <polygon
                  points={cornerPoints(step.hex, 0.82)}
                  fill="none"
                  stroke={accent}
                  strokeOpacity={0.35}
                  strokeWidth={1}
                  strokeDasharray="4 6"
                />
                <circle cx={at.x} cy={at.y} r={20} fill={accent} fillOpacity={0.05} />
                <path d={noseWedge(at, DIRECTION_ANGLE[step.facing], 21, 32, 24)} fill={accent} fillOpacity={0.5} />
                <circle cx={label.x} cy={label.y} r={9} fill={COLORS.void} stroke={accent} strokeOpacity={0.6} />
                <text
                  x={label.x}
                  y={label.y + 3.4}
                  textAnchor="middle"
                  fontSize={10}
                  fill={accent}
                  fontFamily={MONO_STACK}
                >
                  {tick}
                </text>
              </g>
            )
          }),
        )}
      </g>

      {/* ---- combat beats ---- */}
      <g>
        {frames.flatMap((frame, index) =>
          frame.clashes.map((clash) => {
            const nearness = 1 - Math.min(1, Math.abs(playhead - index) / 0.75)
            if (nearness <= 0.02) return null
            const from = center(clash.attackerHex)
            const to = center(clash.defenderHex)
            const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
            const grow = 1 - nearness
            const accent = clash.flank ? COLORS.focus : '#FFD9A0'
            return (
              <g key={`clash-${index}-${clash.attackerId}-${clash.defenderId}`} opacity={nearness}>
                <circle
                  cx={mid.x}
                  cy={mid.y}
                  r={7 + grow * 54}
                  fill="none"
                  stroke={accent}
                  strokeWidth={3.2 * nearness + 0.4}
                  filter="url(#rp-glow)"
                />
                <circle
                  cx={mid.x}
                  cy={mid.y}
                  r={4 + grow * 26}
                  fill="none"
                  stroke={accent}
                  strokeOpacity={0.5}
                  strokeWidth={1.4}
                />
                {[0, 60, 120, 180, 240, 300].map((spark) => {
                  const a = polar(mid, spark + grow * 22, 12 + grow * 30)
                  const b = polar(mid, spark + grow * 22, 22 + grow * 46)
                  return (
                    <line
                      key={spark}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={accent}
                      strokeOpacity={0.75 * nearness}
                      strokeWidth={1.6}
                      strokeLinecap="round"
                    />
                  )
                })}
                <circle
                  cx={to.x}
                  cy={to.y}
                  r={24 + nearness * 5}
                  fill="none"
                  stroke={accent}
                  strokeOpacity={0.6 * nearness}
                  strokeWidth={2}
                />
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={accent}
                  strokeWidth={1.2}
                  strokeOpacity={0.55}
                  strokeDasharray="3 4"
                />
                <text
                  x={to.x}
                  y={to.y - 36 - nearness * 4}
                  textAnchor="middle"
                  fontSize={20}
                  fontFamily={MONO_STACK}
                  fill={accent}
                  stroke={COLORS.void}
                  strokeWidth={3.5}
                  paintOrder="stroke"
                >
                  -{clash.removed}
                </text>
                {clash.flank && (
                  <text
                    x={to.x}
                    y={to.y - 48}
                    textAnchor="middle"
                    fontSize={9}
                    letterSpacing={2}
                    fontFamily={MONO_STACK}
                    fill={COLORS.focus}
                  >
                    FLANK
                  </text>
                )}
              </g>
            )
          }),
        )}
      </g>

      {/* ---- motion trails ---- */}
      <g>
        {trails.flatMap((snapshot, depth) =>
          snapshot
            .filter((unit) => unit.moving)
            .map((unit) => (
              <g key={`trail-${unit.id}-${depth}`} opacity={0.3 - depth * 0.08}>
                <circle cx={unit.x} cy={unit.y} r={20 - depth} fill={sideColor(unit.side)} fillOpacity={0.12} />
                <path d={noseWedge({ x: unit.x, y: unit.y }, unit.angle, 21, 31, 22)} fill={sideColor(unit.side)} fillOpacity={0.35} />
              </g>
            )),
        )}
      </g>

      {/* ---- live tokens ---- */}
      <g>
        {live.map((unit) => {
          const snapshot = start.units.find((candidate) => candidate.id === unit.id)
          const spent = spentPoints(orders[unit.id] ?? [])
          const isSelected = unit.id === selectedId
          return (
            <Token
              key={unit.id}
              unit={unit}
              snapshot={snapshot}
              spent={spent}
              selected={isSelected}
              editable={editable}
              onSelect={() => onSelect(unit.id)}
              onHold={() => onOrder('hold')}
            />
          )
        })}
      </g>

      {/* ---- the radial order cluster ---- */}
      {selected && editable && (
        <RadialControls
          cx={selected.x}
          cy={selected.y}
          angle={selected.angle}
          accent={sideColor(selected.side)}
          bounds={{
            left: view.left,
            top: view.top,
            right: view.left + view.width,
            bottom: view.top + view.height,
          }}
          moveBlocked={moveBlocked}
          exhausted={selectedSpent >= TICKS || selected.side === 'enemy'}
          onOrder={onOrder}
          onClose={() => onSelect(null)}
        />
      )}
    </svg>
  )
}

interface TokenProps {
  unit: RenderUnit
  snapshot: UnitSnapshot | undefined
  spent: number
  selected: boolean
  editable: boolean
  onSelect: () => void
  onHold: () => void
}

function Token({ unit, snapshot, spent, selected, editable, onSelect, onHold }: TokenProps) {
  const accent = sideColor(unit.side)
  const incomplete = spent < TICKS
  const pips = Array.from({ length: TICKS }, (_, index) => index)
  const canHold = selected && editable && unit.side === 'player' && incomplete

  return (
    <g
      transform={`translate(${unit.x.toFixed(2)} ${unit.y.toFixed(2)})`}
      role="button"
      tabIndex={0}
      aria-label={
        canHold
          ? `${unit.name}, ${unit.models} models — hold this tick`
          : `${unit.name}, ${unit.models} models, ${spent} of ${TICKS} points assigned`
      }
      style={{ cursor: 'pointer' }}
      onClick={(event) => {
        event.stopPropagation()
        if (canHold) onHold()
        else onSelect()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          if (canHold) onHold()
          else onSelect()
        }
      }}
    >
      {/* unspent points still to assign */}
      {incomplete && snapshot && (
        <polygon
          className="rp-pulse"
          points={hexCorners({ x: 0, y: 0 }, HEX_SIZE * 0.95)
            .map((corner) => `${corner.x.toFixed(2)},${corner.y.toFixed(2)}`)
            .join(' ')}
          fill="none"
          stroke={COLORS.focus}
          strokeWidth={1.6}
          strokeDasharray="5 6"
        />
      )}
      <circle r={38} fill={accent} fillOpacity={selected ? 0.07 : 0.03} />
      <path
        d={noseWedge({ x: 0, y: 0 }, unit.angle, 23, 35, 27)}
        fill={accent}
        fillOpacity={0.9}
        filter={selected ? 'url(#rp-glow)' : undefined}
      />
      <circle
        r={21}
        fill={`url(#rp-token-${unit.side})`}
        stroke={accent}
        strokeWidth={selected ? 2.2 : 1.5}
      />
      <circle r={17} fill="none" stroke={accent} strokeOpacity={0.3} strokeWidth={0.8} />
      <text
        textAnchor="middle"
        y={6.5}
        fontSize={19}
        fontFamily={MONO_STACK}
        fill={COLORS.text}
        letterSpacing={-0.5}
        pointerEvents="none"
      >
        {unit.models}
      </text>
      <g
        transform={`translate(${-((TICKS - 1) * 9) / 2} 31)`}
        pointerEvents="none"
        opacity={selected ? 0 : 1}
      >
        {pips.map((index) => (
          <rect
            key={index}
            x={index * 9 - 3}
            y={-3}
            width={6}
            height={6}
            transform={`rotate(45 ${index * 9} 0)`}
            fill={index < spent ? accent : 'none'}
            stroke={index < spent ? accent : COLORS.focus}
            strokeOpacity={index < spent ? 1 : 0.75}
            strokeWidth={1}
          />
        ))}
      </g>
      <circle
        className="rp-focus-ring"
        r={26}
        fill="none"
        stroke={COLORS.text}
        strokeWidth={1.2}
        strokeDasharray="2 3"
        opacity={0}
        pointerEvents="none"
      />
      <circle r={22} fill="transparent" />
    </g>
  )
}

export default Board
