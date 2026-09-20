import { hex, hexHeight, hexToPixel, hexWidth } from '../../engine'
import type { Hex } from '../../engine'
import HexTile from './HexTile'

const HEX_SIZE = 10
const BOARD_MARGIN = 1

interface HexGridProps {
  columns: number
  rows: number
}

/** The tiles of a rectangular board, row by row from the top left. */
function boardTiles(columns: number, rows: number): Hex[] {
  const tiles: Hex[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      tiles.push(hex(column - Math.floor(row / 2), row))
    }
  }
  return tiles
}

function HexGrid({ columns, rows }: HexGridProps) {
  const tiles = boardTiles(columns, rows).map((tile) => ({
    tile,
    center: hexToPixel(tile, HEX_SIZE),
  }))

  const xs = tiles.map(({ center }) => center.x)
  const ys = tiles.map(({ center }) => center.y)
  const left = Math.min(...xs) - hexWidth(HEX_SIZE) / 2 - BOARD_MARGIN
  const top = Math.min(...ys) - hexHeight(HEX_SIZE) / 2 - BOARD_MARGIN
  const width = Math.max(...xs) + hexWidth(HEX_SIZE) / 2 + BOARD_MARGIN - left
  const height = Math.max(...ys) + hexHeight(HEX_SIZE) / 2 + BOARD_MARGIN - top

  return (
    <svg
      viewBox={`${left} ${top} ${width} ${height}`}
      role="img"
      aria-label={`A ${columns} by ${rows} hex board`}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      {tiles.map(({ tile, center }) => (
        <HexTile key={`${tile.q},${tile.r}`} center={center} size={HEX_SIZE} />
      ))}
    </svg>
  )
}

export default HexGrid
