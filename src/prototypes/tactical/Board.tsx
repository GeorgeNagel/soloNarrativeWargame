import { hexCorners, hexHeight, hexNeighbor, hexToPixel, hexWidth } from '../../engine'
import type { Hex, Point } from '../../engine'
import { C } from './theme'
import {
  HITS_TO_ELIMINATE,
  ORDER_PHASES,
  canShoot,
  canShootAt,
  hexKey,
  phaseCode,
  profileOf,
  queueState,
} from './model'
import type { OrderBook, UnitState } from './model'
import { isOnBoard } from './sim'
import type { Engagement, Preview, PreviewMap, Shot } from './sim'

const S = 30
const MARGIN = 7
/** Matches the console's stagger: one beat per engagement in the round. */
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
  /** Joint dry-run of every order; null while a round is resolving. */
  previews: PreviewMap | null
  orders: OrderBook
  engagements: Engagement[]
  /**
   * The shooter whose field of fire to draw, already resolved to the position
   * and facing its plan leaves it in. Null when there is nothing to aim.
   */
  arcUnit: UnitState | null
  /** Units melee refused — drawn like a blocked advance, worded apart. */
  lockedIds: string[]
  shots: Shot[]
  /** Shots are drawn in their own beat, before the melee. */
  showShots: boolean
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
  marks,
  ring,
  playing,
  onSelect,
  hit,
}: {
  unit: UnitState
  accent: string
  selected: boolean
  /** One box per part of the order — turns, advance, turns — lit if it does something. */
  marks: boolean[]
  ring: 'empty' | null
  playing: boolean
  onSelect: (id: string) => void
  hit: boolean
}) {
  const center = px(unit.pos)
  const frac = Math.max(0, 1 - unit.hits / HITS_TO_ELIMINATE)
  const ringR = S * 0.72
  const circ = 2 * Math.PI * ringR

  return (
    <g
      className="tc-tok"
      style={{ transform: `translate(${center.x}px, ${center.y}px)` }}
      onClick={() => onSelect(unit.id)}
      role="button"
      tabIndex={0}
      aria-label={`${unit.tag}, ${profileOf(unit).label}, ${unit.hits} of ${HITS_TO_ELIMINATE} hits`}
    >
      <g className={hit ? 'tc-shake' : undefined}>
        {/* a unit nobody has ordered yet wears an amber hex */}
        {ring && (
          <polygon
            points={poly({ x: 0, y: 0 }, S * 0.97)}
            fill="none"
            stroke={C.warn}
            strokeWidth={1.3}
            strokeDasharray="2 4"
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
          y={-S * 0.3}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={S * 0.22}
          letterSpacing={S * 0.02}
          fill={accent}
          opacity={0.85}
        >
          {unit.tag}
        </text>
        <text
          y={-S * 0.05}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={S * 0.26}
          fontWeight={700}
          letterSpacing={S * 0.04}
          fill={accent}
        >
          {profileOf(unit).code}
        </text>
        {/* hits climb towards 15; a clean unit keeps its box quiet */}
        <text
          y={S * 0.32}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={S * 0.42}
          fontWeight={700}
          fill={unit.hits > 0 ? C.warn : C.dim}
          opacity={unit.hits > 0 ? 1 : 0.65}
        >
          {`${unit.hits}/${HITS_TO_ELIMINATE}`}
        </text>

        {!playing && (
          <g transform={`translate(${-S * 0.3}, ${S * 0.62})`}>
            {marks.map((on, i) => (
              <rect
                key={i}
                x={i * (S * 0.22)}
                y={0}
                width={S * 0.16}
                height={S * 0.1}
                fill={on ? accent : 'none'}
                stroke={on ? accent : C.lineHot}
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
 * One unit's planned round: a dashed trace with a node per hex advanced and a
 * labelled END ghost showing where it finishes and which way it points. The
 * selected unit draws bright; everyone else draws thin and quiet, so four
 * orders at once stay legible instead of turning into spaghetti. No phase
 * badges — the turn-advance-turn reading lives in the console's order matrix,
 * and the board stays a map.
 */
function Trace({
  unit,
  preview,
  lead,
}: {
  unit: UnitState
  preview: Preview
  lead: boolean
}) {
  const accent = accentOf(unit)
  const points: Point[] = [px(unit.pos), ...preview.path.map(px)]
  const moved = preview.path.length > 0
  const end = px(preview.pos)

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

      {points.slice(1).map((p, i) => (
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
      {preview.blocked && (
        <g transform={`translate(${end.x + S * 0.66}, ${end.y - S * 0.66})`}>
          <path
            d={`M ${-S * 0.13} ${-S * 0.13} L ${S * 0.13} ${S * 0.13} M ${S * 0.13} ${-S * 0.13} L ${-S * 0.13} ${S * 0.13}`}
            stroke={C.warn}
            strokeWidth={1.4}
            strokeLinecap="round"
            opacity={0.9}
          />
        </g>
      )}

      {/* melee refused the order outright: two bars, not the blocked cross */}
      {preview.locked && (
        <g transform={`translate(${end.x + S * 0.66}, ${end.y - S * 0.66})`}>
          <path
            d={`M ${-S * 0.07} ${-S * 0.14} L ${-S * 0.07} ${S * 0.14} M ${S * 0.07} ${-S * 0.14} L ${S * 0.07} ${S * 0.14}`}
            stroke={C.warn}
            strokeWidth={1.6}
            strokeLinecap="round"
            opacity={0.9}
          />
        </g>
      )}

      {moved && (
        <g transform={`translate(${end.x}, ${end.y})`} opacity={lead ? 0.6 : 0.34}>
          <polygon
            points={poly({ x: 0, y: 0 }, S * 0.8)}
            fill="none"
            stroke={accent}
            strokeWidth={lead ? 1.2 : 1}
            strokeDasharray="4 3"
          />
          <g style={{ transform: `rotate(${preview.angle}deg)` }}>
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
  orders,
  engagements,
  arcUnit,
  lockedIds,
  shots,
  showShots,
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
  const hitIds = new Set<string>()
  if (showClash) {
    for (const fight of engagements) {
      if (fight.a.hits > 0) hitIds.add(fight.bId)
      if (fight.b.hits > 0) hitIds.add(fight.aId)
    }
  }

  const forward = selected && !playing ? hexNeighbor(selected.pos, selected.facing) : null

  // While planning, show a shooter what it can actually reach: wheels are free,
  // so this cone is the thing the player is really steering. It follows the
  // planned facing, not the committed one, or it would never move.
  const arc =
    arcUnit && !playing && canShoot(arcUnit)
      ? tiles.filter((tile) => canShootAt(arcUnit, tile))
      : []

  // One beat per engagement, numbered to match the console's round log.
  const beatOf = new Map<string, number>()
  engagements.forEach((fight, i) => beatOf.set(`${fight.aId}|${fight.bId}`, i))

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
      {arc.map((tile) => (
        <polygon
          key={`arc-${hexKey(tile)}`}
          points={poly(px(tile), S * 0.93)}
          fill={accentOf(arcUnit!)}
          opacity={0.09}
          stroke={accentOf(arcUnit!)}
          strokeWidth={0.6}
          strokeDasharray="2 5"
          pointerEvents="none"
        />
      ))}

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

      {/* every ordered path at once — quiet ones first, the selected one on top */}
      {previews &&
        [...units]
          .sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))
          .map((unit) => {
            const preview = previews[unit.id]
            if (!preview?.order) return null
            return (
              <Trace
                key={`trace-${unit.id}`}
                unit={unit}
                preview={preview}
                lead={unit.id === selectedId}
              />
            )
          })}

      {/* units */}
      {units.map((unit) => {
        const order = orders[unit.id] ?? null
        const unordered = queueState(order) === 'empty'
        return (
          <Token
            key={unit.id}
            unit={unit}
            accent={accentOf(unit)}
            selected={unit.id === selectedId}
            marks={ORDER_PHASES.map(
              (phase) => order != null && !['—', 'HLD'].includes(phaseCode(order, phase)),
            )}
            ring={!playing && unit.side === 'player' && unordered ? 'empty' : null}
            playing={playing}
            onSelect={onSelect}
            hit={hitIds.has(unit.id)}
          />
        )
      })}

      {/* a refused ADV, called out where it happened */}
      {[
        ...blockedIds.map((id) => [id, 'BLOCKED'] as const),
        ...lockedIds.map((id) => [id, 'LOCKED'] as const),
      ].map(([id, word]) => {
        const unit = units.find((candidate) => candidate.id === id)
        if (!unit) return null
        const p = px(unit.pos)
        return (
          <g key={`${word}-${id}`} transform={`translate(${p.x}, ${p.y - S * 0.98})`}>
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
                {word}
              </text>
            </g>
          </g>
        )
      })}

      {/* shooting resolves on its own beat, ahead of the melee */}
      {showShots && shots.length > 0 && (
        <g key={`shots-${beatKey}`} pointerEvents="none">
          {shots.map((shot, i) => {
            const shooter = units.find((u) => u.id === shot.shooterId)
            const target = units.find((u) => u.id === shot.targetId)
            if (!shooter || !target) return null
            const from = px(shooter.pos)
            const to = px(target.pos)
            const accent = accentOf(shooter)
            const delay = { animationDelay: `${i * 110}ms` }
            // stop the flight short of the token so the arrow stays readable
            const span = Math.hypot(to.x - from.x, to.y - from.y) || 1
            const trim = (S * 0.78) / span
            const tip = {
              x: to.x - (to.x - from.x) * trim,
              y: to.y - (to.y - from.y) * trim,
            }
            return (
              <g key={`shot-${shot.shooterId}-${shot.targetId}-${i}`}>
                <g className="tc-shot" style={delay}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={tip.x}
                    y2={tip.y}
                    stroke={accent}
                    strokeWidth={1.6}
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                  />
                  <circle cx={tip.x} cy={tip.y} r={S * 0.14} fill={accent} />
                </g>
                <g
                  transform={`translate(${to.x}, ${to.y - S * 0.95})`}
                >
                  <g className="tc-float" style={delay}>
                    <text
                      textAnchor="middle"
                      fontSize={S * 0.38}
                      fontWeight={700}
                      fill={accentOf(target)}
                      stroke={C.paper}
                      strokeWidth={0.8}
                      paintOrder="stroke"
                    >
                      {`+${shot.hits}`}
                    </text>
                    <text textAnchor="middle" y={S * 0.32} fontSize={S * 0.2} fill={accent}>
                      SHOT
                    </text>
                  </g>
                </g>
              </g>
            )
          })}
        </g>
      )}

      {/* end-of-round contact scan + clash beats */}
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
          {engagements.map((fight) => {
            const a = units.find((u) => u.id === fight.aId)
            const b = units.find((u) => u.id === fight.bId)
            if (!a || !b) return null
            const pa = px(a.pos)
            const pb = px(b.pos)
            const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
            const edge = sharedEdge(pa, pb)
            const beat = beatOf.get(`${fight.aId}|${fight.bId}`) ?? 0
            const delay = { animationDelay: `${beat * CLASH_STAGGER_MS}ms` }
            // a rear blow either way paints the whole engagement hot
            const rear = fight.a.rear || fight.b.rear
            const tone = rear ? C.warn : C.bright

            // one tally per side: what that unit acquired in this engagement
            const tallies: { unit: UnitState; at: Point; hits: number; rear: boolean }[] = [
              { unit: b, at: pb, hits: fight.a.hits, rear: fight.a.rear },
              { unit: a, at: pa, hits: fight.b.hits, rear: fight.b.rear },
            ]

            return (
              <g key={`fight-${fight.aId}-${fight.bId}`}>
                {edge && (
                  <g className="tc-edge" style={delay}>
                    <line
                      x1={edge[0].x}
                      y1={edge[0].y}
                      x2={edge[1].x}
                      y2={edge[1].y}
                      stroke={tone}
                      strokeWidth={4}
                      strokeLinecap="round"
                    />
                  </g>
                )}

                {/* the animation drives `transform`, so placement sits on a wrapper */}
                <g transform={`translate(${mid.x}, ${mid.y})`}>
                  <g className="tc-burst" style={delay}>
                    <circle r={S * 0.3} fill={C.paper} opacity={0.9} />
                    <path
                      d={`M ${-S * 0.19} ${-S * 0.19} L ${S * 0.19} ${S * 0.19} M ${S * 0.19} ${-S * 0.19} L ${-S * 0.19} ${S * 0.19}`}
                      stroke={tone}
                      strokeWidth={2.2}
                    />
                    <circle r={S * 0.3} fill="none" stroke={tone} strokeWidth={1} opacity={0.85} />
                    {engagements.length > 1 && (
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
                        {beat + 1}
                      </text>
                    )}
                  </g>
                </g>

                {tallies.map(({ unit, at, hits, rear: viaRear }) => {
                  const rises = unit.pos.r > 1
                  const away = at.x >= mid.x ? 1 : -1
                  return (
                    <g
                      key={`tally-${fight.aId}-${fight.bId}-${unit.id}`}
                      transform={`translate(${at.x + away * S * 0.95}, ${
                        at.y + (rises ? -S * 0.7 : S * 0.7)
                      })`}
                    >
                      <g className={rises ? 'tc-float' : 'tc-floatd'} style={delay}>
                        <text
                          textAnchor="middle"
                          fontSize={S * 0.42}
                          fontWeight={700}
                          fill={accentOf(unit)}
                          stroke={C.paper}
                          strokeWidth={0.8}
                          paintOrder="stroke"
                        >
                          {`+${hits}`}
                        </text>
                        {viaRear && (
                          <text textAnchor="middle" y={S * 0.34} fontSize={S * 0.2} fill={C.warn}>
                            REAR
                          </text>
                        )}
                      </g>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </g>
      )}
    </svg>
  )
}

export default Board
