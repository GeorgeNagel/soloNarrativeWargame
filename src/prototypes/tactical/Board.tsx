import { hexCorners, hexHeight, hexNeighbor, hexToPixel, hexWidth } from '../../engine'
import type { Hex, Point } from '../../engine'
import { C } from './theme'
import { ORDER_META, hexKey } from './model'
import type { OrderSlots, UnitState } from './model'
import { isOnBoard } from './sim'
import type { ClashEvent, PreviewStep } from './sim'

const S = 30
const MARGIN = 7

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
  preview: PreviewStep[] | null
  previewUnit: UnitState | null
  slots: Record<string, OrderSlots>
  clashes: ClashEvent[]
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
  playing,
  onSelect,
  hit,
}: {
  unit: UnitState
  accent: string
  selected: boolean
  filled: number
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
        <g className="tc-rot" style={{ transform: `rotate(${unit.angle}deg)` }}>
          <path d={WEDGE} fill={accent} opacity={0.95} />
          <path
            d={FRONT_ARC}
            fill="none"
            stroke={accent}
            strokeWidth={1.6}
            opacity={0.5}
          />
        </g>

        <polygon
          points={poly({ x: 0, y: 0 }, S * 0.8)}
          fill={unit.side === 'player' ? '#061c1c' : '#200906'}
          stroke={accent}
          strokeWidth={selected ? 2 : 1.1}
          opacity={0.98}
        />
        <circle
          r={ringR}
          fill="none"
          stroke={C.line}
          strokeWidth={2.2}
          opacity={0.9}
        />
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

function Board({
  tiles,
  units,
  selectedId,
  onSelect,
  preview,
  previewUnit,
  slots,
  clashes,
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
  const hitIds = new Set(showClash ? clashes.filter((c) => c.kills > 0).map((c) => c.defenderId) : [])

  // Trace: distinct positions the previewed unit passes through.
  const tracePoints: Point[] = []
  if (preview && previewUnit) {
    tracePoints.push(px(previewUnit.pos))
    for (const step of preview) {
      const p = px(step.pos)
      const last = tracePoints[tracePoints.length - 1]
      if (last.x !== p.x || last.y !== p.y) tracePoints.push(p)
    }
  }
  const ghost = preview && preview.length > 0 ? preview[preview.length - 1] : null
  const ghostAccent = previewUnit ? accentOf(previewUnit) : C.plr
  const ghostMoved =
    ghost && previewUnit
      ? ghost.pos.q !== previewUnit.pos.q || ghost.pos.r !== previewUnit.pos.r
      : false

  const forward = selected && !playing ? hexNeighbor(selected.pos, selected.facing) : null

  return (
    <svg
      className="tc-board"
      viewBox={`${left} ${top} ${width} ${height}`}
      role="img"
      aria-label="Tactical board"
    >
      <defs>
        <pattern id="tc-hatch" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 6 L6 0" stroke={C.line} strokeWidth={0.8} />
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
          stroke={C.plr}
          strokeWidth={1.4}
          fill="none"
          opacity={0.55}
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
              fill={deployment ? 'url(#tc-hatch)' : '#0a121a'}
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
                opacity={0.4}
              >
                {label(tile)}
              </text>
            )}
          </g>
        )
      })}

      {/* selected unit reticle + forward hex */}
      {selected && !playing && (
        <g>
          {hexCorners(px(selected.pos), S * 1.02).map((corner, i, all) => {
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

      {/* preview trace */}
      {tracePoints.length > 1 && (
        <polyline
          points={tracePoints.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}
          fill="none"
          stroke={ghostAccent}
          strokeWidth={1.6}
          strokeDasharray="5 4"
          opacity={0.75}
        />
      )}

      {/* per-tick preview badges */}
      {preview &&
        previewUnit &&
        preview.map((step) => {
          if (!step.order) return null
          const p = px(step.pos)
          const meta = ORDER_META[step.order]
          const nudge = S * 0.5
          return (
            <g key={step.tick} transform={`translate(${p.x + nudge}, ${p.y - nudge})`}>
              <rect
                x={-S * 0.36}
                y={-S * 0.17}
                width={S * 0.72}
                height={S * 0.34}
                fill="#061119"
                stroke={step.blocked ? C.warn : ghostAccent}
                strokeWidth={0.9}
              />
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={S * 0.21}
                fill={step.blocked ? C.warn : ghostAccent}
                letterSpacing={S * 0.01}
              >
                {`${step.tick + 1}${meta.code[0]}`}
              </text>
            </g>
          )
        })}

      {/* ghost end position */}
      {ghost && previewUnit && ghostMoved && (
        <g transform={`translate(${px(ghost.pos).x}, ${px(ghost.pos).y})`} opacity={0.55}>
          <polygon
            points={poly({ x: 0, y: 0 }, S * 0.8)}
            fill="none"
            stroke={ghostAccent}
            strokeWidth={1.2}
            strokeDasharray="4 3"
          />
          <g style={{ transform: `rotate(${ghost.angle}deg)` }}>
            <path d={WEDGE} fill="none" stroke={ghostAccent} strokeWidth={1.2} />
          </g>
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            y={S * 0.04}
            fontSize={S * 0.28}
            fontWeight={700}
            fill={ghostAccent}
            letterSpacing={S * 0.05}
          >
            END
          </text>
        </g>
      )}

      {/* units */}
      {units.map((unit) => (
        <Token
          key={unit.id}
          unit={unit}
          accent={accentOf(unit)}
          selected={unit.id === selectedId}
          filled={(slots[unit.id] ?? []).filter(Boolean).length}
          playing={playing}
          onSelect={onSelect}
          hit={hitIds.has(unit.id)}
        />
      ))}

      {/* tick-boundary contact scan + clash beat */}
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
            return (
              <g key={`clash-${i}`}>
                {first && edge && (
                  <g className="tc-edge">
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
                    <g className="tc-burst">
                      <circle r={S * 0.3} fill={C.bg} opacity={0.85} />
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
                    </g>
                  </g>
                )}
                <g
                  transform={`translate(${d.x + away * S * 0.95}, ${
                    d.y + (rises ? -S * 0.7 : S * 0.7)
                  })`}
                >
                  <g className={rises ? 'tc-float' : 'tc-floatd'}>
                    <text
                      textAnchor="middle"
                      fontSize={S * 0.42}
                      fontWeight={700}
                      fill={accentOf(defender)}
                      stroke={C.bg}
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
