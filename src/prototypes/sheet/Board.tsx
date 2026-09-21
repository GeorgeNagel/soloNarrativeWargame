import { hexCorners } from '../../engine'
import type { Point } from '../../engine'
import {
  BOARD_VIEW,
  HEX_SIZE,
  PLAYER_IDS,
  UNIT_IDS,
  assignedCount,
  boardTiles,
  center,
} from './rules'
import type { Clash, OrderBook, Preview, Side, Strike, UnitId, UnitState, Units } from './rules'
import { T } from './theme'

const TILES = boardTiles().map((tile) => ({ tile, at: center(tile), key: `${tile.q},${tile.r}` }))
const VIEW = BOARD_VIEW

const polygon = (at: Point, size: number) =>
  hexCorners(at, size)
    .map((corner) => `${corner.x.toFixed(2)},${corner.y.toFixed(2)}`)
    .join(' ')

const sideColor = (side: Side) => (side === 'player' ? T.player : T.enemy)
const sideDeep = (side: Side) => (side === 'player' ? T.playerDeep : T.enemyDeep)

/** A wedge pointing east, to be rotated to the unit's facing. */
function Wedge({ fill, stroke, opacity = 1 }: { fill: string; stroke: string; opacity?: number }) {
  return (
    <path
      d="M3.4,-5.9 L9.9,0 L3.4,5.9 Z"
      fill={fill}
      stroke={stroke}
      strokeWidth={0.7}
      strokeLinejoin="round"
      opacity={opacity}
    />
  )
}

export interface BoardFx {
  readonly id: number
  readonly strikes: Strike[]
  readonly clashes: Clash[]
}

interface BoardProps {
  units: Units
  orders: OrderBook
  selected: UnitId | null
  previews: Record<UnitId, Preview>
  planning: boolean
  fx: BoardFx | null
  /** Companies whose advance stalled against someone this tick. */
  bumped: UnitId[]
  width: number
  onSelect: (id: UnitId) => void
  onBackdrop: () => void
}

const pathPoints = (unit: UnitState, preview: Preview) =>
  [unit.tile, ...preview.steps.map((step) => step.tile)]
    .map((tile) => {
      const at = center(tile)
      return `${at.x.toFixed(2)},${at.y.toFixed(2)}`
    })
    .join(' ')

function Board({
  units,
  orders,
  selected,
  previews,
  planning,
  fx,
  bumped,
  width,
  onSelect,
  onBackdrop,
}: BoardProps) {
  // The selected company is drawn last so it sits above its neighbours.
  const drawOrder = UNIT_IDS.filter((id) => id !== selected).concat(selected ? [selected] : [])

  const selectedPreview = planning && selected ? previews[selected] : null
  const showGhost = selectedPreview && selectedPreview.distance > 0 ? selectedPreview.end : null

  // Every other company's plan stays on the board, but thin and quiet, so three
  // plans at once read as a formation rather than spaghetti.
  const quietPaths = planning
    ? PLAYER_IDS.filter((id) => id !== selected && previews[id].distance > 0).map((id) => ({
        id,
        unit: units[id],
        preview: previews[id],
      }))
    : []

  // Several ticks can land on the same hex (holds and turns), so fan their pips out.
  const pipTotals = new Map<string, number>()
  selectedPreview?.steps.forEach((step) => {
    const key = `${step.tile.q},${step.tile.r}`
    pipTotals.set(key, (pipTotals.get(key) ?? 0) + 1)
  })
  const pipSeen = new Map<string, number>()
  const pips = (selectedPreview?.steps ?? []).map((step) => {
    const key = `${step.tile.q},${step.tile.r}`
    const total = pipTotals.get(key) ?? 1
    const index = pipSeen.get(key) ?? 0
    pipSeen.set(key, index + 1)
    const at = center(step.tile)
    return {
      tick: step.tick,
      blocked: step.blocked,
      x: at.x + (index - (total - 1) / 2) * 7.2,
      y: at.y - HEX_SIZE * 0.56,
    }
  })

  // One float per company, however many spears came at it this tick.
  const damage = new Map<UnitId, { removed: number; flank: boolean }>()
  fx?.strikes.forEach((strike) => {
    const previous = damage.get(strike.to) ?? { removed: 0, flank: false }
    damage.set(strike.to, {
      removed: previous.removed + strike.removed,
      flank: previous.flank || strike.flank,
    })
  })

  return (
    <div
      className={`sh-slab${fx && fx.clashes.length > 0 ? ' sh-slab-clash' : ''}`}
      style={{ width: width > 0 ? `${width}px` : undefined }}
    >
      <svg
        viewBox={`${VIEW.left} ${VIEW.top} ${VIEW.width} ${VIEW.height}`}
        role="img"
        aria-label="Skirmish board"
      >
        <defs>
          <radialGradient id="sh-tokenlight" cx="35%" cy="28%" r="78%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.45)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        {/* backdrop: tapping empty board dismisses the sheet */}
        <rect
          x={VIEW.left}
          y={VIEW.top}
          width={VIEW.width}
          height={VIEW.height}
          fill="transparent"
          onPointerDown={onBackdrop}
        />

        {/* tiles */}
        {TILES.map(({ at, key }, index) => (
          <polygon
            key={key}
            points={polygon(at, HEX_SIZE - 0.35)}
            fill={index % 2 === 0 ? T.hexA : T.hexB}
            stroke={T.hexLine}
            strokeWidth={0.4}
            pointerEvents="none"
          />
        ))}

        {/* selected unit's tile */}
        {planning && selected && (
          <polygon
            className="sh-pulse"
            points={polygon(center(units[selected].tile), HEX_SIZE - 0.9)}
            fill="none"
            stroke={T.gold}
            strokeWidth={1.4}
            style={{
              transformOrigin: `${center(units[selected].tile).x}px ${center(units[selected].tile).y}px`,
            }}
            pointerEvents="none"
          />
        )}

        {/* the other companies' plans, kept quiet */}
        {quietPaths.map(({ id, unit, preview }) => {
          const end = center(preview.end.tile)
          return (
            <g key={`quiet-${id}`} pointerEvents="none" className="sh-quiet">
              <polyline
                points={pathPoints(unit, preview)}
                fill="none"
                stroke={T.player}
                strokeOpacity={0.5}
                strokeWidth={1.1}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="2.4 3"
              />
              <circle
                cx={end.x}
                cy={end.y}
                r={5.4}
                fill="none"
                stroke={preview.blocked ? '#c4462f' : T.player}
                strokeOpacity={0.72}
                strokeWidth={1.1}
                strokeDasharray="2 2"
              />
              <text
                x={end.x}
                y={end.y + 1.9}
                textAnchor="middle"
                fontSize={5}
                fontFamily={T.serif}
                fill={preview.blocked ? '#a8382a' : T.player}
                opacity={0.8}
              >
                {preview.blocked ? '!' : unit.badge}
              </text>
            </g>
          )
        })}

        {/* order preview: trace, tick pips, ghost */}
        {selected && selectedPreview && selectedPreview.steps.length > 0 && (
          <g pointerEvents="none" className="sh-ghost-in">
            <polyline
              points={pathPoints(units[selected], selectedPreview)}
              fill="none"
              stroke={T.gold}
              strokeOpacity={0.85}
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4 4"
              className="sh-ants"
            />
          </g>
        )}
        {pips.map((pip, index) => (
          <g key={`pip-${index}`} pointerEvents="none" className="sh-ghost-in">
            <circle
              cx={pip.x}
              cy={pip.y}
              r={3.2}
              fill={pip.blocked ? '#c4462f' : T.cream}
              stroke={T.ink}
              strokeWidth={0.55}
            />
            <text
              x={pip.x}
              y={pip.y + 1.5}
              textAnchor="middle"
              fontSize={4}
              fontFamily={T.serif}
              fill={pip.blocked ? T.cream : T.ink}
            >
              {pip.blocked ? '!' : pip.tick}
            </text>
          </g>
        ))}
        {showGhost && selected && (
          <g
            className="sh-ghost-in"
            pointerEvents="none"
            transform={`translate(${center(showGhost.tile).x} ${center(showGhost.tile).y})`}
            opacity={0.72}
          >
            <g style={{ transform: `rotate(${showGhost.angle}deg)`, transformOrigin: '0 0' }}>
              <Wedge fill={sideColor(units[selected].side)} stroke={T.cream} opacity={0.75} />
            </g>
            <circle r={6.6} fill={T.cream} opacity={0.5} />
            <circle
              r={6.6}
              fill="none"
              stroke={sideColor(units[selected].side)}
              strokeWidth={1.5}
              strokeDasharray="2.6 2.3"
            />
          </g>
        )}

        {/* units */}
        {drawOrder.map((id) => {
          const unit = units[id]
          if (unit.models <= 0) return null
          const at = center(unit.tile)
          const isSelected = selected === unit.id
          const mine = unit.side === 'player'
          const assigned = assignedCount(orders[unit.id])
          const waiting = planning && mine && assigned < 3
          const shaking = fx?.strikes.some((strike) => strike.to === unit.id) ?? false
          const stalled = bumped.includes(unit.id)
          return (
            <g
              key={unit.id}
              className="sh-token-shift"
              style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
            >
              <g
                key={shaking ? `shake-${fx?.id}` : 'calm'}
                className={shaking ? 'sh-shake' : undefined}
              >
                {waiting && (
                  <circle
                    className="sh-halo"
                    r={9.1}
                    fill="none"
                    stroke={T.gold}
                    strokeWidth={1.3}
                    strokeDasharray="2.6 2.6"
                  />
                )}
                <ellipse cx={0.6} cy={2.4} rx={6.6} ry={2.4} fill="rgba(43,31,22,0.28)" />
                <g
                  className="sh-token-turn"
                  style={{ transform: `rotate(${unit.angle}deg)`, transformOrigin: '0 0' }}
                >
                  <Wedge fill={sideColor(unit.side)} stroke={T.cream} />
                </g>
                <circle r={6.4} fill={sideDeep(unit.side)} />
                <circle r={5.9} fill={sideColor(unit.side)} stroke={T.cream} strokeWidth={0.9} />
                <circle r={5.9} fill="url(#sh-tokenlight)" />
                <text
                  y={2.3}
                  textAnchor="middle"
                  fontSize={6.6}
                  fontFamily={T.serif}
                  fontWeight={600}
                  fill={T.cream}
                >
                  {unit.models}
                </text>
                {/* heraldic initial, so six tokens stay tellable apart */}
                <circle cx={-5.4} cy={-5.4} r={3.1} fill={T.cream} stroke={T.ink} strokeWidth={0.4} />
                <text
                  x={-5.4}
                  y={-3.9}
                  textAnchor="middle"
                  fontSize={4.2}
                  fontFamily={T.serif}
                  fontWeight={700}
                  fill={sideDeep(unit.side)}
                >
                  {unit.badge}
                </text>
                {planning &&
                  (mine
                    ? [0, 1, 2].map((slot) => (
                        <circle
                          key={slot}
                          cx={-3 + slot * 3}
                          cy={8.9}
                          r={1.15}
                          fill={slot < assigned ? T.gold : 'rgba(43,31,22,0.22)'}
                          stroke={slot < assigned ? 'rgba(43,31,22,0.35)' : 'none'}
                          strokeWidth={0.3}
                        />
                      ))
                    : [
                        <text
                          key="holds"
                          y={10.6}
                          textAnchor="middle"
                          fontSize={3.6}
                          fontFamily={T.sans}
                          letterSpacing="0.3"
                          fill="rgba(43,31,22,0.5)"
                        >
                          HOLDS
                        </text>,
                      ])}
                {isSelected && (
                  <circle r={8.3} fill="none" stroke={T.gold} strokeWidth={1.1} opacity={0.9} />
                )}
                {stalled && (
                  <g className="sh-float" style={{ transformOrigin: '0 0' }}>
                    <circle cx={0} cy={-10.5} r={3.6} fill="#c4462f" stroke={T.ink} strokeWidth={0.5} />
                    <text
                      y={-9}
                      textAnchor="middle"
                      fontSize={5}
                      fontFamily={T.serif}
                      fontWeight={700}
                      fill={T.cream}
                    >
                      !
                    </text>
                  </g>
                )}
              </g>
              <polygon
                className="sh-hit"
                points={polygon({ x: 0, y: 0 }, HEX_SIZE)}
                fill="transparent"
                onPointerDown={(event) => {
                  event.stopPropagation()
                  onSelect(unit.id)
                }}
              />
            </g>
          )
        })}

        {/* clashes: one burst per locked pair, struck a beat apart so two or
            three fights in the same tick read as separate events */}
        {fx && fx.clashes.length > 0 && (
          <g key={`fx-${fx.id}`} pointerEvents="none">
            {fx.clashes.map((clash, index) => {
              const a = center(units[clash.player].tile)
              const b = center(units[clash.enemy].tile)
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
              return (
                <g
                  key={`clash-${clash.player}-${clash.enemy}`}
                  className="sh-burst"
                  style={{
                    transformOrigin: `${mid.x}px ${mid.y}px`,
                    animationDelay: `${index * 110}ms`,
                  }}
                >
                  <path
                    transform={`translate(${mid.x} ${mid.y}) scale(0.58)`}
                    d="M0,-11 L2.7,-3.4 L10.4,-5.6 L4.6,-0.4 L11.2,4.6 L3.2,3.8 L3.4,11.4 L-0.8,4.8 L-7.6,8.8 L-4.4,1.6 L-11.6,0.4 L-4.6,-2.6 L-8.4,-9.2 L-1.6,-5.2 Z"
                    fill={T.goldSoft}
                    stroke={T.ink}
                    strokeWidth={0.9}
                    opacity={0.95}
                    strokeLinejoin="round"
                  />
                </g>
              )
            })}
            {[...damage.entries()].map(([id, hit], index) => {
              const at = center(units[id].tile)
              return (
                <g
                  key={`hit-${id}`}
                  className="sh-float"
                  style={{
                    transformOrigin: `${at.x}px ${at.y}px`,
                    animationDelay: `${140 + index * 90}ms`,
                  }}
                >
                  <text
                    x={at.x}
                    y={at.y - 9.5}
                    textAnchor="middle"
                    fontSize={7.4}
                    fontFamily={T.serif}
                    fontWeight={700}
                    fill={T.cream}
                    stroke={T.ink}
                    strokeWidth={1.5}
                    paintOrder="stroke"
                  >
                    {hit.removed > 0 ? `-${hit.removed}` : 'held'}
                  </text>
                  {hit.flank && (
                    <text
                      x={at.x}
                      y={at.y - 16}
                      textAnchor="middle"
                      fontSize={3.6}
                      fontFamily={T.sans}
                      fontWeight={700}
                      letterSpacing="0.15"
                      fill="#ffd77a"
                      stroke={T.ink}
                      strokeWidth={1.1}
                      paintOrder="stroke"
                    >
                      FLANK
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )}
      </svg>
    </div>
  )
}

export default Board
