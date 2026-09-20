import { hexCorners } from '../../engine'
import type { Point } from '../../engine'

interface HexTileProps {
  center: Point
  size: number
}

function HexTile({ center, size }: HexTileProps) {
  const points = hexCorners(center, size)
    .map((corner) => `${corner.x.toFixed(3)},${corner.y.toFixed(3)}`)
    .join(' ')

  return <polygon points={points} fill="#3d4a3a" stroke="#9fb08b" strokeWidth={0.5} />
}

export default HexTile
