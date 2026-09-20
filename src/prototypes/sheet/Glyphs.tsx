import type { OrderType } from './rules'

interface GlyphProps {
  order: OrderType
  size?: number
  color?: string
}

/** Chunky pictograms for the four order types. */
export function OrderGlyph({ order, size = 22, color = '#2b1f16' }: GlyphProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2.3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (order === 'move') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M12 20V5" />
        <path d="M5.5 11.5 12 4.6l6.5 6.9" fill={color} stroke={color} />
      </svg>
    )
  }
  if (order === 'left') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M18.5 19a7.5 7.5 0 0 0-13-5.6" />
        <path d="M3 8.4 5.2 14l5.6-2.1z" fill={color} stroke={color} />
      </svg>
    )
  }
  if (order === 'right') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M5.5 19a7.5 7.5 0 0 1 13-5.6" />
        <path d="M21 8.4 18.8 14l-5.6-2.1z" fill={color} stroke={color} />
      </svg>
    )
  }
  return (
    <svg {...common} aria-hidden="true">
      <path d="M12 3.6 19 6v6.2c0 4.2-3 7-7 8.2-4-1.2-7-4-7-8.2V6z" />
      <path d="M9 12.2l2.2 2.3L15.4 10" />
    </svg>
  )
}

export function CloseGlyph() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M6 9.5 12 16l6-6.5" />
    </svg>
  )
}
