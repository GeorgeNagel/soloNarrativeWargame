import { hexCorners } from '../../engine'
import type { Point } from '../../engine'
import { BOARD_VIEW, HEX_SIZE, assignedCount, boardTiles, center } from './rules'
import type { Preview, Slots, Strike, UnitId, UnitState, Units } from './rules'
import { T } from './theme'

const TILES = boardTiles().map((tile) => ({ tile, at: center(tile), key: `${tile.q},${tile.r}` }))
const VIEW = BOARD_VIEW

const polygon = (at: Point, size: number) =>
  hexCorners(at, size)
    .map((corner) => `${corner.x.toFixed(2)},${corner.y.toFixed(2)}`)
    .join(' ')

const sideColor = (id: UnitId) => (id === 'player' ? T.player : T.enemy)
const sideDeep = (id: UnitId) => (id === 'player' ? T.playerDeep : T.enemyDeep)

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
}

interface BoardProps {
  units: Units
  orders: Record<UnitId, Slots>
  selected: UnitId | null
  preview: Preview | null
  planning: boolean
  fx: BoardFx | null
  width: number
  onSelect: (id: UnitId) => void
  onBackdrop: () => void
}

function Board({
  units,
  orders,
  selected,
  preview,
  planning,
  fx,
  width,
  onSelect,
  onBackdrop,
}: BoardProps) {
  const list: UnitState[] = [units.enemy, units.player]
  const ghost = preview && preview.steps.length > 0 ? preview.end : null
  const trace = preview
    ? [units[selected ?? 'player'].tile, ...preview.steps.map((step) => step.tile)]
    : []
  const tracePoints = trace
    .map((tile) => {
      const at = center(tile)
      return `${at.x.toFixed(2)},${at.y.toFixed(2)}`
    })
    .join(' ')

  // Several ticks can land on the same hex (holds and turns), so fan their pips out.
  const clashing = (fx?.strikes.length ?? 0) > 0

  const pipTotals = new Map<string, number>()
  preview?.steps.forEach((step) => {
    const key = `${step.tile.q},${step.tile.r}`
    pipTotals.set(key, (pipTotals.get(key) ?? 0) + 1)
  })
  const pipSeen = new Map<string, number>()
  const pips = (preview?.steps ?? []).map((step) => {
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

  return (
    <div
      className={`sh-slab${clashing ? ' sh-slab-clash' : ''}`}
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
            style={{ transformOrigin: `${center(units[selected].tile).x}px ${center(units[selected].tile).y}px` }}
            pointerEvents="none"
          />
        )}

        {/* order preview: trace, tick pips, ghost */}
        {preview && trace.length > 1 && (
          <g pointerEvents="none" className="sh-ghost-in">
            <polyline
              points={tracePoints}
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
        {pips.map((pip) => (
          <g key={`pip-${pip.tick}`} pointerEvents="none" className="sh-ghost-in">
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
        {ghost && selected && (
          <g
            className="sh-ghost-in"
            pointerEvents="none"
            transform={`translate(${center(ghost.tile).x} ${center(ghost.tile).y})`}
            opacity={0.72}
          >
            <g style={{ transform: `rotate(${ghost.angle}deg)`, transformOrigin: '0 0' }}>
              <Wedge fill={sideColor(selected)} stroke={T.cream} opacity={0.75} />
            </g>
            <circle r={6.6} fill={T.cream} opacity={0.5} />
            <circle
              r={6.6}
              fill="none"
              stroke={sideColor(selected)}
              strokeWidth={1.5}
              strokeDasharray="2.6 2.3"
            />
          </g>
        )}

        {/* units */}
        {list.map((unit) => {
          if (unit.models <= 0) return null
          const at = center(unit.tile)
          const isSelected = selected === unit.id
          const assigned = assignedCount(orders[unit.id])
          const needsOrders = planning && assigned < 3
          const shaking = fx?.strikes.some((strike) => strike.to === unit.id) ?? false
          return (
            <g
              key={unit.id}
              className="sh-token-shift"
              style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
            >
              <g key={shaking ? `shake-${fx?.id}` : 'calm'} className={shaking ? 'sh-shake' : undefined}>
                {needsOrders && (
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
                <g className="sh-token-turn" style={{ transform: `rotate(${unit.angle}deg)`, transformOrigin: '0 0' }}>
                  <Wedge fill={sideColor(unit.id)} stroke={T.cream} />
                </g>
                <circle r={6.4} fill={sideDeep(unit.id)} />
                <circle r={5.9} fill={sideColor(unit.id)} stroke={T.cream} strokeWidth={0.9} />
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
                {planning &&
                  [0, 1, 2].map((slot) => (
                    <circle
                      key={slot}
                      cx={-3 + slot * 3}
                      cy={8.9}
                      r={1.15}
                      fill={slot < assigned ? T.gold : 'rgba(43,31,22,0.22)'}
                      stroke={slot < assigned ? 'rgba(43,31,22,0.35)' : 'none'}
                      strokeWidth={0.3}
                    />
                  ))}
                {isSelected && (
                  <circle r={8.3} fill="none" stroke={T.gold} strokeWidth={1.1} opacity={0.9} />
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

        {/* clash */}
        {fx && fx.strikes.length > 0 && (
          <g key={`fx-${fx.id}`} pointerEvents="none">
            {(() => {
              const a = center(units.player.tile)
              const b = center(units.enemy.tile)
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
              return (
                <g className="sh-burst" style={{ transformOrigin: `${mid.x}px ${mid.y}px` }}>
                  <path
                    transform={`translate(${mid.x} ${mid.y}) scale(0.62)`}
                    d="M0,-11 L2.7,-3.4 L10.4,-5.6 L4.6,-0.4 L11.2,4.6 L3.2,3.8 L3.4,11.4 L-0.8,4.8 L-7.6,8.8 L-4.4,1.6 L-11.6,0.4 L-4.6,-2.6 L-8.4,-9.2 L-1.6,-5.2 Z"
                    fill={T.goldSoft}
                    stroke={T.ink}
                    strokeWidth={0.9}
                    opacity={0.95}
                    strokeLinejoin="round"
                  />
                </g>
              )
            })()}
            {fx.strikes.map((strike) => {
              const at = center(units[strike.to].tile)
              return (
                <g key={strike.to} className="sh-float" style={{ transformOrigin: `${at.x}px ${at.y}px` }}>
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
                    {strike.removed > 0 ? `-${strike.removed}` : 'held'}
                  </text>
                  {strike.flank && (
                    <text
                      x={at.x}
                      y={at.y - 16}
                      textAnchor="middle"
                      fontSize={4}
                      fontFamily={T.sans}
                      fontWeight={700}
                      letterSpacing="0.2"
                      fill="#ffd77a"
                      stroke={T.ink}
                      strokeWidth={1.1}
                      paintOrder="stroke"
                    >
                      FLANKED
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
