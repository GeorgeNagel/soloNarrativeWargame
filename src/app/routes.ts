import type { ComponentType } from 'react'

import Board from '../ui/screens/Board'
import Radial from '../prototypes/radial'
import Sheet from '../prototypes/sheet'
import Tactical from '../prototypes/tactical'

export interface Route {
  path: string
  name: string
  blurb: string
  component: ComponentType
}

export const routes: Route[] = [
  {
    path: 'board',
    name: 'Hex board',
    blurb: 'The static board with no interaction, as first rendered.',
    component: Board,
  },
  {
    path: 'tactical',
    name: 'Prototype: tactical console',
    blurb: 'Board and a persistent panel showing every unit’s tick slots at once.',
    component: Tactical,
  },
  {
    path: 'sheet',
    name: 'Prototype: field sheet',
    blurb: 'Large board with a bottom sheet holding one unit’s orders at a time.',
    component: Sheet,
  },
  {
    path: 'radial',
    name: 'Prototype: radial and timeline',
    blurb: 'Controls bloom around the unit; a scrubber steps through the ticks.',
    component: Radial,
  },
]

export function routeFor(hash: string): Route | undefined {
  return routes.find((route) => route.path === hash.replace(/^#\/?/, ''))
}
