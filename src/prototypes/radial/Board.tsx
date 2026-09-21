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
import type { Frame, OrderSlots, OrderType, RenderUnit } from './model'

const MARGIN_X = 38
const MARGIN_Y = 44
const TRAIL_STEPS = [0.09, 0.19, 0.3]
/** Radius of the three order-point arcs drawn around every unit. */
const POINT_RING = 33

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

/** Arc around the origin, for the order-point ring on each token. */
function arc(radius: number, from: number, to: number): string {
  const a = polar({ x: 0, y: 0 }, from, radius)
  const b = polar({ x: 0, y: 0 }, to, radius)
  const large = Math.abs(to - from) > 180 ? 1 : 0
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

function unitVector(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  return { x: dx / length, y: dy / length }
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
    const left = Math.min(...centers.map((p) => p.x)) - hexWidth(HEX_SIZE) / 2 - MARGIN_X
    const top = Math.min(...centers.map((p) => p.y)) - hexHeight(HEX_SIZE) / 2 - MARGIN_Y
    const right = Math.max(...centers.map((p) => p.x)) + hexWidth(HEX_SIZE) / 2 + MARGIN_X
    const bottom = Math.max(...centers.map((p) => p.y)) + hexHeight(HEX_SIZE) / 2 + MARGIN_Y
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

  /**
   * Off the board an advance can never happen, so it is struck out. A hex
   * somebody is standing on might still clear this tick if they move too, so
   * that order stays takeable and is flagged as contested instead.
   */
  const advance: 'open' | 'edge' | 'contested' = (() => {
    if (!selected) return 'edge'
    const target = hexNeighbor(selected.hex, selected.facing)
    if (!isOnBoard(target)) return 'edge'
    const occupied = live.some(
      (other) => other.id !== selected.id && hexEquals(other.hex, target),
    )
    return occupied ? 'contested' : 'open'
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
        <radialGradient id="rp-cluster-well">
          <stop offset="0%" stopColor={COLORS.void} stopOpacity={0.72} />
          <stop offset="62%" stopColor={COLORS.void} stopOpacity={0.55} />
          <stop offset="100%" stopColor={COLORS.void} stopOpacity={0} />
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

      {/* ---- planned / resolved traces ----
          Six units would be spaghetti at full strength, so only the selected
          file marches; the rest keep a hairline. */}
      <g>
        {tracks.map(({ unit, steps }) => {
          const accent = sideColor(unit.side)
          const lead = unit.id === selectedId
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
            <g key={`trace-${unit.id}`}>
              {lead && (
                <path d={d} fill="none" stroke={accent} strokeOpacity={0.12} strokeWidth={9} />
              )}
              <path
                className={lead ? 'rp-march' : undefined}
                d={d}
                fill="none"
                stroke={accent}
                strokeOpacity={lead ? 0.8 : 0.42}
                strokeWidth={lead ? 1.4 : 1}
                strokeDasharray={lead ? '7 7' : '3 5'}
              />
            </g>
          )
        })}
      </g>

      {/* ---- ghosted future states ----
          The selected unit ghosts every tick it changes on; everybody else
          shows only where they end up, so the board stays legible. */}
      <g>
        {tracks.flatMap(({ unit, steps }) => {
          const lead = unit.id === selectedId
          const accent = sideColor(unit.side)
          return steps.slice(1).map((step, index) => {
            const tick = index + 1
            const ahead = tick - playhead
            if (ahead <= 0.08) return null
            // A unit that neither moves nor turns needs no ghost of itself.
            const previous = steps[tick - 1]
            if (hexEquals(previous.hex, step.hex) && previous.facing === step.facing) return null
            const settled =
              !lead &&
              steps.slice(tick + 1).some(
                (later) => !hexEquals(later.hex, step.hex) || later.facing !== step.facing,
              )
            if (settled) return null
            const strength = lead
              ? Math.max(0.24, 0.72 - ahead * 0.12)
              : Math.max(0.24, 0.48 - ahead * 0.05)
            const at = center(step.hex)
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
          })
        })}
      </g>

      {/* ---- blocked moves ---- */}
      <g>
        {frames.flatMap((frame, index) =>
          frame.blocked.map((block) => {
            const nearness = Math.max(
              editable ? 0.34 : 0,
              1 - Math.min(1, Math.abs(playhead - index) / 0.8),
            )
            if (nearness <= 0.02) return null
            const from = center(block.hex)
            const to = center(block.into)
            const step = unitVector(from, to)
            const wall = { x: from.x + step.x * 33, y: from.y + step.y * 33 }
            const across = { x: -step.y, y: step.x }
            return (
              <g key={`block-${index}-${block.id}`} opacity={nearness}>
                <line
                  x1={wall.x - across.x * 19}
                  y1={wall.y - across.y * 19}
                  x2={wall.x + across.x * 19}
                  y2={wall.y + across.y * 19}
                  stroke={COLORS.enemy}
                  strokeWidth={3.2}
                  strokeLinecap="round"
                  strokeDasharray="5 4"
                />
                <line
                  x1={wall.x - across.x * 10 - step.x * 10}
                  y1={wall.y - across.y * 10 - step.y * 10}
                  x2={wall.x + across.x * 10 + step.x * 10}
                  y2={wall.y + across.y * 10 + step.y * 10}
                  stroke={COLORS.enemy}
                  strokeOpacity={0.75}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <text
                  x={wall.x + across.x * 30}
                  y={wall.y + across.y * 30 + 3.2}
                  textAnchor="middle"
                  fontSize={10}
                  letterSpacing={1.4}
                  fontFamily={MONO_STACK}
                  fill={COLORS.enemy}
                  stroke={COLORS.void}
                  strokeWidth={3.2}
                  paintOrder="stroke"
                >
                  {block.reason === 'edge' ? 'EDGE' : 'BLOCKED'}
                </text>
              </g>
            )
          }),
        )}
      </g>

      {/* ---- combat beats ----
          One beat per pair, and when several land on the same tick they are
          strung together so the simultaneity reads while scrubbing. */}
      <g>
        {frames.flatMap((frame, index) => {
          const nearness = 1 - Math.min(1, Math.abs(playhead - index) / 0.75)
          if (nearness <= 0.02 || frame.clashes.length === 0) return []
          const crowd = 1 / (1 + 0.34 * (frame.clashes.length - 1))
          const mids = frame.clashes.map((clash) => {
            const from = center(clash.playerHex)
            const to = center(clash.enemyHex)
            return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
          })
          const chain =
            mids.length > 1
              ? mids
                  .map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
                  .join(' ')
              : null

          return [
            chain && (
              // several fights landing on the same tick, strung together
              <g key={`chain-${index}`} opacity={nearness}>
                <path
                  d={chain}
                  fill="none"
                  stroke={COLORS.focus}
                  strokeOpacity={0.34}
                  strokeWidth={0.9}
                  strokeDasharray="1 6"
                />
                {mids.map((point, i) => (
                  <rect
                    key={i}
                    x={point.x - 4}
                    y={point.y - 4}
                    width={8}
                    height={8}
                    transform={`rotate(45 ${point.x} ${point.y})`}
                    fill={COLORS.focus}
                    fillOpacity={0.85}
                  />
                ))}
              </g>
            ),
            ...frame.clashes.map((clash, order) => {
              const from = center(clash.playerHex)
              const to = center(clash.enemyHex)
              const mid = mids[order]
              const grow = 1 - nearness
              const flank = clash.playerFlanked || clash.enemyFlanked
              const accent = flank ? COLORS.focus : '#FFD9A0'
              const outward = unitVector(mid, from)
              const sideways = { x: -outward.y, y: outward.x }
              const playerTag = {
                x: from.x + outward.x * 38 + sideways.x * 9,
                y: from.y + outward.y * 38 + sideways.y * 9,
              }
              const enemyTag = {
                x: to.x - outward.x * 38 + sideways.x * 9,
                y: to.y - outward.y * 38 + sideways.y * 9,
              }
              return (
                <g key={`clash-${index}-${clash.playerId}-${clash.enemyId}`} opacity={nearness}>
                  <circle
                    cx={mid.x}
                    cy={mid.y}
                    r={(10 + grow * 52) * crowd}
                    fill="none"
                    stroke={accent}
                    strokeWidth={3.2 * nearness + 0.4}
                    filter="url(#rp-glow)"
                  />
                  <circle
                    cx={mid.x}
                    cy={mid.y}
                    r={(4 + grow * 26) * crowd}
                    fill="none"
                    stroke={accent}
                    strokeOpacity={0.5}
                    strokeWidth={1.4}
                  />
                  {[0, 60, 120, 180, 240, 300].map((spark) => {
                    const a = polar(mid, spark + grow * 22, (12 + grow * 30) * crowd)
                    const b = polar(mid, spark + grow * 22, (22 + grow * 46) * crowd)
                    return (
                      <line
                        key={spark}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={accent}
                        strokeOpacity={0.7 * nearness}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                      />
                    )
                  })}
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
                  <LossTag
                    at={playerTag}
                    amount={clash.playerLoss}
                    color={COLORS.player}
                    flank={clash.playerFlanked}
                  />
                  <LossTag
                    at={enemyTag}
                    amount={clash.enemyLoss}
                    color={COLORS.enemy}
                    flank={clash.enemyFlanked}
                  />
                </g>
              )
            }),
          ]
        })}
      </g>

      {/* ---- motion trails ---- */}
      <g>
        {trails.flatMap((snapshot, depth) =>
          snapshot
            .filter((unit) => unit.moving)
            .map((unit) => (
              <g key={`trail-${unit.id}-${depth}`} opacity={0.26 - depth * 0.07}>
                <circle cx={unit.x} cy={unit.y} r={20 - depth} fill={sideColor(unit.side)} fillOpacity={0.12} />
                <path d={noseWedge({ x: unit.x, y: unit.y }, unit.angle, 21, 31, 22)} fill={sideColor(unit.side)} fillOpacity={0.35} />
              </g>
            )),
        )}
      </g>

      {/* a soft well of darkness under the cluster, so it reads over a
          crowded board without swallowing the unit it belongs to */}
      {selected && editable && selected.side === 'player' && (
        <circle
          cx={selected.x}
          cy={selected.y}
          r={104}
          fill="url(#rp-cluster-well)"
          pointerEvents="none"
        />
      )}

      {/* ---- live tokens ---- */}
      <g>
        {/* the selected file paints last, so a crowded neighbour never
            covers the unit you are giving orders to */}
        {[...live]
          .sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))
          .map((unit) => {
            const spent = spentPoints(orders[unit.id] ?? [])
            const isSelected = unit.id === selectedId
            return (
              <Token
                key={unit.id}
                unit={unit}
                spent={spent}
                selected={isSelected}
                dimmed={selectedId !== null && !isSelected}
                editable={editable}
                showPoints={editable && unit.side === 'player'}
                // Tapping a file that has nothing left to spend puts the
                // cluster away again: no dismiss plate needed.
                onSelect={() => onSelect(isSelected && spent >= TICKS ? null : unit.id)}
                onHold={() => onOrder('hold')}
              />
            )
          })}
      </g>

      {/* ---- the radial order cluster ---- */}
      {selected && editable && selected.side === 'player' && (
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
          avoid={live
            .filter((unit) => unit.id !== selected.id)
            .map((unit) => ({ x: unit.x, y: unit.y }))}
          advance={advance}
          exhausted={selectedSpent >= TICKS}
          onOrder={onOrder}
        />
      )}
    </svg>
  )
}

function LossTag({
  at,
  amount,
  color,
  flank,
}: {
  at: Point
  amount: number
  color: string
  flank: boolean
}) {
  return (
    <g>
      <text
        x={at.x}
        y={at.y + 5}
        textAnchor="middle"
        fontSize={17}
        fontFamily={MONO_STACK}
        fill={color}
        stroke={COLORS.void}
        strokeWidth={3.5}
        paintOrder="stroke"
      >
        -{amount}
      </text>
      {flank && (
        <text
          x={at.x}
          y={at.y + 16}
          textAnchor="middle"
          fontSize={8}
          letterSpacing={1.8}
          fontFamily={MONO_STACK}
          fill={COLORS.focus}
          stroke={COLORS.void}
          strokeWidth={2.6}
          paintOrder="stroke"
        >
          FLANKED
        </text>
      )}
    </g>
  )
}

interface TokenProps {
  unit: RenderUnit
  spent: number
  selected: boolean
  dimmed: boolean
  editable: boolean
  /** Draw the three order-point arcs (planning, player side). */
  showPoints: boolean
  onSelect: () => void
  onHold: () => void
}

function Token({
  unit,
  spent,
  selected,
  dimmed,
  editable,
  showPoints,
  onSelect,
  onHold,
}: TokenProps) {
  const accent = sideColor(unit.side)
  const incomplete = spent < TICKS
  const canHold = selected && editable && unit.side === 'player' && incomplete
  // The three point arcs sit around the token with their gaps on the facing,
  // so the nose wedge always shows through.
  const points = Array.from({ length: TICKS }, (_, index) => ({
    index,
    from: unit.angle + 7 + index * 120,
    to: unit.angle + 113 + index * 120,
    filled: index < spent,
  }))

  return (
    <g
      transform={`translate(${unit.x.toFixed(2)} ${unit.y.toFixed(2)})`}
      opacity={dimmed ? 0.62 : 1}
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
      {/* three order points, spent arcs solid and unspent arcs amber:
          the whole roster's state readable from the board alone */}
      {showPoints && (
        <g className={spent === 0 ? 'rp-pulse-soft' : undefined}>
          {points.map((point) => (
            <path
              key={point.index}
              d={arc(POINT_RING, point.from, point.to)}
              fill="none"
              stroke={point.filled ? accent : COLORS.focus}
              strokeOpacity={point.filled ? 0.95 : 0.7}
              strokeWidth={point.filled ? 3.2 : 1.6}
              strokeDasharray={point.filled ? undefined : '3 4'}
              strokeLinecap="round"
              filter={point.filled && selected ? 'url(#rp-glow)' : undefined}
            />
          ))}
        </g>
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
        strokeWidth={selected ? 2.6 : 1.5}
      />
      <circle r={17} fill="none" stroke={accent} strokeOpacity={0.3} strokeWidth={0.8} />
      <text
        textAnchor="middle"
        y={-5}
        fontSize={9}
        letterSpacing={1.4}
        fontFamily={MONO_STACK}
        fill={accent}
        fillOpacity={0.95}
        pointerEvents="none"
      >
        {unit.sigil}
      </text>
      <text
        textAnchor="middle"
        y={12}
        fontSize={16}
        fontFamily={MONO_STACK}
        fill={COLORS.text}
        letterSpacing={-0.5}
        pointerEvents="none"
      >
        {unit.models}
      </text>
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
