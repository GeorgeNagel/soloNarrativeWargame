import type { OrderType } from './model'

function polar(radius: number, degrees: number): [number, number] {
  const a = (degrees * Math.PI) / 180
  return [radius * Math.cos(a), radius * Math.sin(a)]
}

function arcPath(radius: number, from: number, to: number): string {
  const [x1, y1] = polar(radius, from)
  const [x2, y2] = polar(radius, to)
  const delta = to - from
  const large = Math.abs(delta) > 180 ? 1 : 0
  const sweep = delta > 0 ? 1 : 0
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${large} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

function Wheel() {
  return (
    <>
      <path d={arcPath(7.4, 55, -172)} />
      <polygon points="-7.3,5.2 -11,-1.4 -3.6,-1.4" fill="currentColor" stroke="none" />
    </>
  )
}

/**
 * Order glyphs drawn in a ~22px box centred on the origin, pointing "up" for
 * `move` so the caller can rotate them onto a facing.
 */
export function OrderGlyph({ type, scale = 1 }: { type: OrderType; scale?: number }) {
  return (
    <g
      transform={`scale(${scale})`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    >
      {type === 'move' && (
        <>
          <path d="M0 8.5 L0 -5.5" />
          <path d="M-5.6 -1.4 L0 -8.6 L5.6 -1.4" />
        </>
      )}
      {type === 'left' && <Wheel />}
      {type === 'right' && (
        <g transform="scale(-1,1)">
          <Wheel />
        </g>
      )}
      {type === 'hold' && (
        <>
          <path d="M0 -8.6 L7.4 -4.3 L7.4 4.3 L0 8.6 L-7.4 4.3 L-7.4 -4.3 Z" />
          <circle r={2.4} fill="currentColor" stroke="none" />
        </>
      )}
    </g>
  )
}

/** Same glyph set, boxed for HTML use in the timeline chips. */
export function OrderGlyphBox({
  type,
  size = 22,
  color,
}: {
  type: OrderType
  size?: number
  color?: string
}) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" style={{ color, display: 'block' }}>
      <OrderGlyph type={type} scale={0.92} />
    </svg>
  )
}
