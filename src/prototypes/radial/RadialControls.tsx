import { OrderGlyph } from './Glyphs'
import { COLORS } from './theme'
import type { Point } from '../../engine'
import type { OrderType } from './model'

const MOVE_DISTANCE = 66
const TURN_DISTANCE = 61
const HOLD_RING = 33

function offset(cx: number, cy: number, degrees: number, distance: number): [number, number] {
  const a = (degrees * Math.PI) / 180
  return [cx + Math.cos(a) * distance, cy + Math.sin(a) * distance]
}

interface ButtonProps {
  x: number
  y: number
  radius: number
  label: string
  accent: string
  rotate: number
  glyph: OrderType
  disabled?: boolean
  /** Draw a bar across the plate: the order exists but cannot be taken. */
  strike?: boolean
  /** Amber ring: the order can be taken but may not come off. */
  caution?: boolean
  delay: number
  onPress: () => void
}

function RadialButton({
  x,
  y,
  radius,
  label,
  accent,
  rotate,
  glyph,
  disabled = false,
  strike = false,
  caution = false,
  delay,
  onPress,
}: ButtonProps) {
  const press = () => {
    if (!disabled) onPress()
  }
  return (
    <g
      className={`rp-btn${disabled ? ' rp-off' : ''}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        press()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          press()
        }
      }}
    >
      <g className="rp-btn-body" style={{ animationDelay: `${delay}ms` }}>
        {/* opaque backing so a button that lands over a neighbouring unit
            still reads as a control rather than as part of the board */}
        <circle cx={x} cy={y} r={radius + 1} fill={COLORS.void} fillOpacity={0.94} />
        <circle
          className="rp-btn-plate"
          cx={x}
          cy={y}
          r={radius}
          fill={accent}
          fillOpacity={0.16}
          stroke={accent}
          strokeWidth={1.5}
          style={{ filter: 'drop-shadow(0 0 7px rgba(87,232,206,0.35))' }}
        />
        <circle cx={x} cy={y} r={radius - 4.5} fill="none" stroke={accent} strokeOpacity={0.22} />
        <g transform={`translate(${x} ${y}) rotate(${rotate})`} color={accent}>
          <OrderGlyph type={glyph} scale={radius / 26} />
        </g>
        {caution && (
          <circle
            className="rp-march"
            cx={x}
            cy={y}
            r={radius + 4.5}
            fill="none"
            stroke={COLORS.focus}
            strokeOpacity={0.85}
            strokeWidth={1.4}
            strokeDasharray="4 5"
          />
        )}
        {strike && (
          <line
            x1={x - radius * 0.72}
            y1={y + radius * 0.72}
            x2={x + radius * 0.72}
            y2={y - radius * 0.72}
            stroke={accent}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}
      </g>
      <circle cx={x} cy={y} r={radius + 9} fill="transparent" />
    </g>
  )
}

export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

interface RadialControlsProps {
  cx: number
  cy: number
  /** Screen bearing of the unit's facing, in degrees. */
  angle: number
  accent: string
  /** The drawable area; buttons are kept inside it near a board edge. */
  bounds: Bounds
  /** Other units on the board, which buttons try not to sit on top of. */
  avoid: readonly Point[]
  /** Whether the hex ahead is free, off the board, or held by someone. */
  advance: 'open' | 'edge' | 'contested'
  exhausted: boolean
  onOrder: (order: OrderType) => void
}

/**
 * The order cluster blooms around the unit itself: advance sits ahead in the
 * facing direction, the wheels sit on the side they swing towards, hold sits
 * on the unit. No control panel anywhere, and no dismiss plate either: a tap
 * on bare board puts the cluster away.
 */
function RadialControls({
  cx,
  cy,
  angle,
  accent,
  bounds,
  avoid,
  advance,
  exhausted,
  onOrder,
}: RadialControlsProps) {
  /**
   * Keep a button on the board, off a neighbouring unit and off the buttons
   * already placed. Pulling it in towards its own unit is tried before
   * swinging it round, so advance stays ahead and the wheels stay on the side
   * they turn to.
   */
  const placed: Array<{ x: number; y: number; r: number }> = []
  const place = (bearing: number, distance: number, radius: number): [number, number] => {
    const pad = radius + 4
    const clamp = (point: [number, number]): [number, number] => [
      Math.min(Math.max(point[0], bounds.left + pad), bounds.right - pad),
      Math.min(Math.max(point[1], bounds.top + pad), bounds.bottom - pad),
    ]
    const obstacles = [
      ...avoid.map((unit) => ({ x: unit.x, y: unit.y, need: radius + 21 })),
      ...placed.map((button) => ({ x: button.x, y: button.y, need: radius + button.r + 5 })),
    ]
    /** How much room to spare a spot has; negative means it overlaps. */
    const margin = ([x, y]: [number, number]): number =>
      obstacles.reduce(
        (least, other) => Math.min(least, Math.hypot(other.x - x, other.y - y) - other.need),
        999,
      )

    let best = clamp(offset(cx, cy, bearing, distance))
    let bestScore = margin(best)
    if (bestScore < 0) {
      for (const spin of [0, 15, -15, 32, -32, 52, -52]) {
        for (const scale of [1, 0.82, 0.66, 0.52]) {
          const candidate = clamp(offset(cx, cy, bearing + spin, distance * scale))
          const score = margin(candidate)
          if (score > bestScore) {
            best = candidate
            bestScore = score
          }
          if (bestScore >= 0) break
        }
        if (bestScore >= 0) break
      }
    }
    placed.push({ x: best[0], y: best[1], r: radius })
    return best
  }

  const [mx, my] = place(angle, MOVE_DISTANCE, 26)
  const [lx, ly] = place(angle - 72, TURN_DISTANCE, 22)
  const [rx, ry] = place(angle + 72, TURN_DISTANCE, 22)
  const [hx, hy] = place(angle + 180, HOLD_RING, 18)
  const spokes: Array<[number, number, number]> = [
    [mx, my, 0],
    [lx, ly, 60],
    [rx, ry, 90],
  ]

  return (
    <g>
      {spokes.map(([x, y, delay]) => (
        <line
          key={`${x},${y}`}
          className="rp-spoke"
          x1={cx}
          y1={cy}
          x2={x}
          y2={y}
          stroke={accent}
          strokeOpacity={0.3}
          strokeWidth={1}
          pointerEvents="none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}

      {/* hold: the centre of the geometry it affects */}
      <circle
        cx={cx}
        cy={cy}
        r={HOLD_RING}
        fill="none"
        stroke={accent}
        strokeOpacity={0.4}
        strokeWidth={1}
        strokeDasharray="3 5"
        className="rp-march"
        pointerEvents="none"
      />
      <RadialButton
        x={hx}
        y={hy}
        radius={18}
        label={exhausted ? 'Hold (no points left)' : 'Hold'}
        accent={accent}
        rotate={0}
        glyph="hold"
        disabled={exhausted}
        delay={120}
        onPress={() => onOrder('hold')}
      />

      <RadialButton
        x={mx}
        y={my}
        radius={26}
        label={
          advance === 'edge'
            ? 'Advance (off the board)'
            : advance === 'contested'
              ? 'Advance (contested)'
              : exhausted
                ? 'Advance (no points left)'
                : 'Advance'
        }
        accent={accent}
        rotate={angle + 90}
        glyph="move"
        disabled={exhausted || advance === 'edge'}
        strike={advance === 'edge'}
        caution={advance === 'contested' && !exhausted}
        delay={0}
        onPress={() => onOrder('move')}
      />
      <RadialButton
        x={lx}
        y={ly}
        radius={22}
        label={exhausted ? 'Wheel left (no points left)' : 'Wheel left'}
        accent={accent}
        rotate={angle + 90}
        glyph="left"
        disabled={exhausted}
        delay={60}
        onPress={() => onOrder('left')}
      />
      <RadialButton
        x={rx}
        y={ry}
        radius={22}
        label={exhausted ? 'Wheel right (no points left)' : 'Wheel right'}
        accent={accent}
        rotate={angle + 90}
        glyph="right"
        disabled={exhausted}
        delay={90}
        onPress={() => onOrder('right')}
      />
    </g>
  )
}

export default RadialControls
