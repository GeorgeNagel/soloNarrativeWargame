import { OrderGlyph } from './Glyphs'
import { COLORS } from './theme'
import type { OrderType } from './model'

const MOVE_DISTANCE = 69
const TURN_DISTANCE = 63
const CLOSE_DISTANCE = 68
const HOLD_RING = 34

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
  glyph: OrderType | 'close'
  disabled?: boolean
  /** Draw a bar across the plate: the order exists but cannot be taken. */
  strike?: boolean
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
        <circle
          className="rp-btn-plate"
          cx={x}
          cy={y}
          r={radius}
          fill={accent}
          fillOpacity={0.14}
          stroke={accent}
          strokeWidth={1.5}
          style={{ filter: 'drop-shadow(0 0 7px rgba(87,232,206,0.35))' }}
        />
        <circle cx={x} cy={y} r={radius - 4.5} fill="none" stroke={accent} strokeOpacity={0.22} />
        <g transform={`translate(${x} ${y}) rotate(${rotate})`} color={accent}>
          {glyph === 'close' ? (
            <g stroke={accent} strokeWidth={1.9} strokeLinecap="round">
              <path d="M-4.6 -4.6 L4.6 4.6 M4.6 -4.6 L-4.6 4.6" />
            </g>
          ) : (
            <OrderGlyph type={glyph} scale={radius / 26} />
          )}
        </g>
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
  moveBlocked: boolean
  exhausted: boolean
  onOrder: (order: OrderType) => void
  onClose: () => void
}

/**
 * The order cluster blooms around the unit itself: advance sits ahead in the
 * facing direction, the wheels sit on the side they swing towards, hold sits
 * on the unit. No control panel anywhere.
 */
function RadialControls({
  cx,
  cy,
  angle,
  accent,
  bounds,
  moveBlocked,
  exhausted,
  onOrder,
  onClose,
}: RadialControlsProps) {
  const keepInside = (point: [number, number], radius: number): [number, number] => {
    const pad = radius + 4
    return [
      Math.min(Math.max(point[0], bounds.left + pad), bounds.right - pad),
      Math.min(Math.max(point[1], bounds.top + pad), bounds.bottom - pad),
    ]
  }
  const [mx, my] = keepInside(offset(cx, cy, angle, MOVE_DISTANCE), 26)
  const [lx, ly] = keepInside(offset(cx, cy, angle - 72, TURN_DISTANCE), 22)
  const [rx, ry] = keepInside(offset(cx, cy, angle + 72, TURN_DISTANCE), 22)
  const [kx, ky] = keepInside(offset(cx, cy, angle + 180, CLOSE_DISTANCE), 14)
  const [hx, hy] = keepInside(offset(cx, cy, angle + 180, HOLD_RING), 18)
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
          moveBlocked
            ? 'Advance (blocked)'
            : exhausted
              ? 'Advance (no points left)'
              : 'Advance'
        }
        accent={accent}
        rotate={angle + 90}
        glyph="move"
        disabled={exhausted || moveBlocked}
        strike={moveBlocked}
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
      <RadialButton
        x={kx}
        y={ky}
        radius={14}
        label="Close order cluster"
        accent={COLORS.muted}
        rotate={0}
        glyph="close"
        delay={160}
        onPress={onClose}
      />
    </g>
  )
}

export default RadialControls
