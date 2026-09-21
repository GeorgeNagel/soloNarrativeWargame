import { hexCorners, hexHeight, hexNeighbor, hexToPixel, hexWidth } from '../../engine'
import type { Hex, Point } from '../../engine'
import { C } from './theme'
import { assignedPoints, hexKey, queueState } from './model'
import type { OrderSlots, UnitState } from './model'
import { isOnBoard } from './sim'
import type { ClashEvent, PreviewMap, PreviewStep } from './sim'

const S = 30
const MARGIN = 7
/** Matches the console's clash stagger: one beat per melee in the tick. */
const CLASH_STAGGER_MS = 260

const FILES = 'ABCDEFG'

function px(tile: Hex): Point {
  return hexToPixel(tile, S)
}

function poly(center: Point, size: number): string {
  return hexCorners(center, size)
    .map((corner) => `${corner.x.toFixed(2)},${corner.y.toFixed(2)}`)
    .join(' ')
}

/** The two corners the hexes `a` and `b` share, i.e. the edge they fight across. */
function sharedEdge(a: Point, b: Point): [Point, Point] | null {
  const ca = hexCorners(a, S)
  const cb = hexCorners(b, S)
  const shared = ca.filter((p) => cb.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.5))
  return shared.length === 2 ? [shared[0], shared[1]] : null
}

function label(tile: Hex): string {
  const file = tile.q + Math.floor(tile.r / 2)
  return `${FILES[file] ?? '?'}${tile.r + 1}`
}

/** Outward-pointing wedge marking the facing edge, drawn at angle 0 (east). */
const WEDGE = `M ${S * 1.04} 0 L ${S * 0.42} ${S * 0.3} L ${S * 0.42} ${-S * 0.3} Z`
/** Arc across the three front edges (±90° of facing). */
const FRONT_ARC = `M 0 ${-S * 0.9} A ${S * 0.9} ${S * 0.9} 0 0 1 0 ${S * 0.9}`

export interface BoardProps {
  tiles: Hex[]
  units: UnitState[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Joint dry-run of every queue; null while a round is resolving. */
  previews: PreviewMap | null
  slots: Record<string, OrderSlots>
  clashes: ClashEvent[]
  blockedIds: string[]
  showClash: boolean
  beatKey: number
  playing: boolean
}

function accentOf(unit: UnitState): string {
  return unit.side === 'player' ? C.plr : C.enm
}

function Token({
  unit,
  accent,
  selected,
  filled,
  ring,
  playing,
  onSelect,
  hit,
}: {
  unit: UnitState
  accent: string
  selected: boolean
  filled: number
  ring: 'empty' | 'part' | null
  playing: boolean
  onSelect: (id: string) => void
  hit: boolean
}) {
  const center = px(unit.pos)
  const frac = unit.models / unit.startModels
  const ringR = S * 0.72
  const circ = 2 * Math.PI * ringR

  return (
    <g
      className="tc-tok"
      style={{ transform: `translate(${center.x}px, ${center.y}px)` }}
      onClick={() => onSelect(unit.id)}
      role="button"
      tabIndex={0}
      aria-label={`${unit.tag}, ${unit.models} models`}
    >
      <g className={hit ? 'tc-shake' : undefined}>
        {/* unordered / part-ordered units wear an amber hex until their queue is full */}
        {ring && (
          <polygon
            points={poly({ x: 0, y: 0 }, S * 0.97)}
            fill="none"
            stroke={C.warn}
            strokeWidth={1.3}
            strokeDasharray={ring === 'empty' ? '2 4' : '7 4'}
            opacity={0.85}
          />
        )}

        <g className="tc-rot" style={{ transform: `rotate(${unit.angle}deg)` }}>
          <path d={WEDGE} fill={accent} opacity={0.95} />
          <path d={FRONT_ARC} fill="none" stroke={accent} strokeWidth={1.6} opacity={0.5} />
        </g>

        <polygon
          points={poly({ x: 0, y: 0 }, S * 0.8)}
          fill={unit.side === 'player' ? '#dbe5f0' : '#f3ddd8'}
          stroke={accent}
          strokeWidth={selected ? 2 : 1.1}
          opacity={0.98}
        />
        <circle r={ringR} fill="none" stroke={C.line} strokeWidth={2.2} opacity={0.9} />
        <circle
          r={ringR}
          fill="none"
          stroke={accent}
          strokeWidth={2.2}
          strokeDasharray={`${(circ * frac).toFixed(2)} ${circ.toFixed(2)}`}
          transform="rotate(-90)"
          opacity={0.95}
        />

        <text
          y={-S * 0.26}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={S * 0.24}
          letterSpacing={S * 0.02}
          fill={accent}
          opacity={0.85}
        >
          {unit.tag}
        </text>
        <text
          y={S * 0.2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={S * 0.6}
          fontWeight={700}
          fill={C.bright}
        >
          {unit.models}
        </text>

        {!playing && (
          <g transform={`translate(${-S * 0.3}, ${S * 0.62})`}>
            {[0, 1, 2].map((i) => (
              <rect
                key={i}
                x={i * (S * 0.22)}
                y={0}
                width={S * 0.16}
                height={S * 0.1}
                fill={i < filled ? accent : 'none'}
                stroke={i < filled ? accent : C.lineHot}
                strokeWidth={0.8}
              />
            ))}
          </g>
        )}
      </g>
    </g>
  )
}

/**
 * One unit's planned path: a dashed trace with a node per step and a labelled
 * END ghost. The selected unit draws bright; everyone else draws thin and
 * quiet, so three queues at once stay legible instead of turning into
 * spaghetti. No per-tick badges — the tick-by-tick reading lives in the
 * console's order matrix, and the board stays a map.
 */
function Trace({
  unit,
  steps,
  lead,
}: {
  unit: UnitState
  steps: PreviewStep[]
  lead: boolean
}) {
  const accent = accentOf(unit)
  const points: Point[] = [px(unit.pos)]
  for (const step of steps) {
    const p = px(step.pos)
    const last = points[points.length - 1]
    if (last.x !== p.x || last.y !== p.y) points.push(p)
  }
  const end = steps[steps.length - 1] ?? null
  const moved = end ? end.pos.q !== unit.pos.q || end.pos.r !== unit.pos.r : false
  const blocked = steps.find((step) => step.blocked) ?? null

  return (
    <g>
      {points.length > 1 && (
        <polyline
          points={points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}
          fill="none"
          stroke={accent}
          strokeWidth={lead ? 2 : 1.1}
          strokeDasharray={lead ? '5 4' : '2 5'}
          opacity={lead ? 0.85 : 0.4}
        />
      )}

      {points.length > 1 &&
        points.slice(1).map((p, i) => (
          <circle
            key={`node-${i}`}
            cx={p.x}
            cy={p.y}
            r={lead ? 2.4 : 1.6}
            fill={accent}
            opacity={lead ? 0.85 : 0.4}
          />
        ))}

      {/* a refused ADV still has to show, but as one quiet mark, not a badge */}
      {blocked && (
        <g transform={`translate(${px(blocked.pos).x + S * 0.66}, ${px(blocked.pos).y - S * 0.66})`}>
          <path
            d={`M ${-S * 0.13} ${-S * 0.13} L ${S * 0.13} ${S * 0.13} M ${S * 0.13} ${-S * 0.13} L ${-S * 0.13} ${S * 0.13}`}
            stroke={C.warn}
            strokeWidth={1.4}
            strokeLinecap="round"
            opacity={0.9}
          />
        </g>
      )}

      {end && moved && (
        <g
          transform={`translate(${px(end.pos).x}, ${px(end.pos).y})`}
          opacity={lead ? 0.6 : 0.34}
        >
          <polygon
            points={poly({ x: 0, y: 0 }, S * 0.8)}
            fill="none"
            stroke={accent}
            strokeWidth={lead ? 1.2 : 1}
            strokeDasharray="4 3"
          />
          <g style={{ transform: `rotate(${end.angle}deg)` }}>
            <path d={WEDGE} fill="none" stroke={accent} strokeWidth={1.2} />
          </g>
          {/* the label sits low in the ghost so the facing wedge stays clear of it */}
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            y={S * 0.46}
            fontSize={lead ? S * 0.26 : S * 0.21}
            fontWeight={700}
            fill={accent}
            letterSpacing={S * 0.05}
          >
            {lead ? 'END' : unit.tag}
          </text>
        </g>
      )}
    </g>
  )
}

function Board({
  tiles,
  units,
  selectedId,
  onSelect,
  previews,
  slots,
  clashes,
  blockedIds,
  showClash,
  beatKey,
  playing,
}: BoardProps) {
  const centers = tiles.map(px)
  const left = Math.min(...centers.map((c) => c.x)) - hexWidth(S) / 2 - MARGIN
  const top = Math.min(...centers.map((c) => c.y)) - hexHeight(S) / 2 - MARGIN
  const width = Math.max(...centers.map((c) => c.x)) + hexWidth(S) / 2 + MARGIN - left
  const height = Math.max(...centers.map((c) => c.y)) + hexHeight(S) / 2 + MARGIN - top

  const occupied = new Map(units.map((unit) => [hexKey(unit.pos), unit]))
  const selected = units.find((unit) => unit.id === selectedId) ?? null
  const hitIds = new Set(
    showClash ? clashes.filter((c) => c.kills > 0).map((c) => c.defenderId) : [],
  )

  const forward = selected && !playing ? hexNeighbor(selected.pos, selected.facing) : null

  // One beat per contacting pair, numbered to match the console's tick log.
  const pairIndex = new Map<string, number>()
  for (const clash of clashes) {
    const key = [clash.attackerId, clash.defenderId].sort().join('|')
    if (!pairIndex.has(key)) pairIndex.set(key, pairIndex.size)
  }

  return (
    <svg
      className="tc-board"
      viewBox={`${left} ${top} ${width} ${height}`}
      role="img"
      aria-label="Tactical board"
    >
      <defs>
        <pattern id="tc-hatch" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill={C.hex} />
          <path d="M0 6 L6 0" stroke={C.line} strokeWidth={0.7} />
        </pattern>
      </defs>

      <rect
        x={left}
        y={top}
        width={width}
        height={height}
        fill="none"
        stroke={C.lineHot}
        strokeWidth={1}
      />
      {[
        [left, top, 1, 1],
        [left + width, top, -1, 1],
        [left, top + height, 1, -1],
        [left + width, top + height, -1, -1],
      ].map(([x, y, sx, sy], i) => (
        <path
          key={i}
          d={`M ${x} ${y + sy * 12} L ${x} ${y} L ${x + sx * 12} ${y}`}
          stroke={C.lineHot}
          strokeWidth={1.4}
          fill="none"
          opacity={0.8}
        />
      ))}

      {/* tiles */}
      {tiles.map((tile, i) => {
        const center = centers[i]
        const here = occupied.get(hexKey(tile))
        const deployment = tile.r === 0 || tile.r === 6
        return (
          <g key={hexKey(tile)}>
            <polygon
              points={poly(center, S * 0.97)}
              fill={deployment ? 'url(#tc-hatch)' : C.hex}
              stroke={C.line}
              strokeWidth={0.9}
            />
            {!here && (
              <text
                x={center.x}
                y={center.y - S * 0.52}
                textAnchor="middle"
                fontSize={S * 0.2}
                fill={C.dim}
                opacity={0.75}
              >
                {label(tile)}
              </text>
            )}
          </g>
        )
      })}

      {/* selected unit reticle + forward hex */}
      {selected && !playing && (
        <g transform={`translate(${px(selected.pos).x} ${px(selected.pos).y})`}>
          <circle
            className="tc-retpulse"
            r={S * 1.16}
            fill="none"
            stroke={accentOf(selected)}
            strokeWidth={2.4}
          />
          <g className="tc-retspin">
            {hexCorners({ x: 0, y: 0 }, S * 1.02).map((corner, i, all) => {
              const next = all[(i + 1) % all.length]
              const mx = corner.x + (next.x - corner.x) * 0.28
              const my = corner.y + (next.y - corner.y) * 0.28
              return (
                <path
                  key={i}
                  d={`M ${mx} ${my} L ${corner.x} ${corner.y}`}
                  stroke={accentOf(selected)}
                  strokeWidth={1.6}
                  opacity={0.9}
                />
              )
            })}
          </g>
        </g>
      )}
      {forward && isOnBoard(forward) && (
        <polygon
          points={poly(px(forward), S * 0.92)}
          fill="none"
          stroke={selected ? accentOf(selected) : C.plr}
          strokeWidth={1}
          strokeDasharray="3 4"
          opacity={0.5}
        />
      )}

      {/* every queued path at once — quiet ones first, the selected one on top */}
      {previews &&
        [...units]
          .sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))
          .map((unit) => {
            const steps = previews[unit.id] ?? []
            if (steps.every((step) => !step.order)) return null
            return (
              <Trace
                key={`trace-${unit.id}`}
                unit={unit}
                steps={steps}
                lead={unit.id === selectedId}
              />
            )
          })}

      {/* units */}
      {units.map((unit) => {
        const queue = slots[unit.id] ?? []
        const state = queueState(queue, unit.stats.movement)
        return (
          <Token
            key={unit.id}
            unit={unit}
            accent={accentOf(unit)}
            selected={unit.id === selectedId}
            filled={assignedPoints(queue)}
            ring={!playing && unit.side === 'player' && state !== 'armed' ? state : null}
            playing={playing}
            onSelect={onSelect}
            hit={hitIds.has(unit.id)}
          />
        )
      })}

      {/* a refused ADV, called out where it happened */}
      {blockedIds.map((id) => {
        const unit = units.find((candidate) => candidate.id === id)
        if (!unit) return null
        const p = px(unit.pos)
        return (
          <g key={`blocked-${id}`} transform={`translate(${p.x}, ${p.y - S * 0.98})`}>
            <g className="tc-blocked">
              <rect
                x={-S * 0.62}
                y={-S * 0.2}
                width={S * 1.24}
                height={S * 0.4}
                fill="#f7e7bf"
                stroke={C.warn}
                strokeWidth={1}
              />
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={S * 0.22}
                fill={C.warn}
                letterSpacing={S * 0.03}
              >
                BLOCKED
              </text>
            </g>
          </g>
        )
      })}

      {/* tick-boundary contact scan + clash beats */}
      {showClash && (
        <g key={beatKey} pointerEvents="none">
          {units.map((unit) => (
            <circle
              key={`scan-${unit.id}`}
              className="tc-scan"
              cx={px(unit.pos).x}
              cy={px(unit.pos).y}
              r={S * 1.5}
              fill="none"
              stroke={accentOf(unit)}
              strokeWidth={1.2}
              strokeDasharray="4 5"
            />
          ))}
          {clashes.map((clash, i) => {
            const attacker = units.find((u) => u.id === clash.attackerId)
            const defender = units.find((u) => u.id === clash.defenderId)
            if (!attacker || !defender) return null
            const a = px(attacker.pos)
            const d = px(defender.pos)
            const mid = { x: (a.x + d.x) / 2, y: (a.y + d.y) / 2 }
            // one burst per contacting pair, but a loss tally per defender
            const first = clash.attackerId < clash.defenderId
            const edge = sharedEdge(a, d)
            const rises = defender.pos.r > 1
            const away = d.x >= a.x ? 1 : -1
            const order = pairIndex.get([clash.attackerId, clash.defenderId].sort().join('|')) ?? 0
            const delay = { animationDelay: `${order * CLASH_STAGGER_MS}ms` }
            return (
              <g key={`clash-${i}`}>
                {first && edge && (
                  <g className="tc-edge" style={delay}>
                    <line
                      x1={edge[0].x}
                      y1={edge[0].y}
                      x2={edge[1].x}
                      y2={edge[1].y}
                      stroke={clash.flank ? C.warn : C.bright}
                      strokeWidth={4}
                      strokeLinecap="round"
                    />
                  </g>
                )}
                {first && (
                  /* the animation drives `transform`, so placement sits on a wrapper */
                  <g transform={`translate(${mid.x}, ${mid.y})`}>
                    <g className="tc-burst" style={delay}>
                      <circle r={S * 0.3} fill={C.paper} opacity={0.9} />
                      <path
                        d={`M ${-S * 0.19} ${-S * 0.19} L ${S * 0.19} ${S * 0.19} M ${S * 0.19} ${-S * 0.19} L ${-S * 0.19} ${S * 0.19}`}
                        stroke={clash.flank ? C.warn : C.bright}
                        strokeWidth={2.2}
                      />
                      <circle
                        r={S * 0.3}
                        fill="none"
                        stroke={clash.flank ? C.warn : C.bright}
                        strokeWidth={1}
                        opacity={0.85}
                      />
                      {pairIndex.size > 1 && (
                        <text
                          x={S * 0.42}
                          y={-S * 0.3}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={S * 0.26}
                          fontWeight={700}
                          fill={C.bright}
                          stroke={C.paper}
                          strokeWidth={0.8}
                          paintOrder="stroke"
                        >
                          {order + 1}
                        </text>
                      )}
                    </g>
                  </g>
                )}
                <g
                  transform={`translate(${d.x + away * S * 0.95}, ${
                    d.y + (rises ? -S * 0.7 : S * 0.7)
                  })`}
                >
                  <g className={rises ? 'tc-float' : 'tc-floatd'} style={delay}>
                    <text
                      textAnchor="middle"
                      fontSize={S * 0.42}
                      fontWeight={700}
                      fill={accentOf(defender)}
                      stroke={C.paper}
                      strokeWidth={0.8}
                      paintOrder="stroke"
                    >
                      {`-${clash.kills}`}
                    </text>
                    {clash.flank && (
                      <text textAnchor="middle" y={S * 0.34} fontSize={S * 0.2} fill={C.warn}>
                        FLANK
                      </text>
                    )}
                  </g>
                </g>
              </g>
            )
          })}
        </g>
      )}
    </svg>
  )
}

export default Board
