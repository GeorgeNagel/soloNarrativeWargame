/**
 * `npm run ai:play` — play a saved genome, without the evolution around it.
 *
 * A genome is plain data, so a champion written by `npm run evolve` can be read
 * straight back and measured, traced round by round, or read as text.
 */
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { isAlive, orderCode } from '../prototypes/tactical/model'
import type { Side, UnitState } from '../prototypes/tactical/model'
import { BASELINES, baselineById } from './baseline'
import { parseCheckpoint, parseGenome } from './checkpoint'
import type { Commander } from './commander'
import { DEFAULT_ROUND_CAP, playGame } from './game'
import type { RoundTrace } from './game'
import { commanderOf, postureFor } from './genome'
import type { Genome } from './genome'
import { makeRng, seedFrom } from './rng'
import { rosterOf } from './roster'
import { randomScenario } from './scenario'
import { benchmark } from './tournament'
import { describeGenome } from './describe'
import { readSavedOpponent } from './saved-opponents'

interface Flags {
  genome: string | null
  vs: string
  games: number
  seed: number
  cap: number
  size: number | null
  trace: boolean
  describe: boolean
}

const USAGE = `Usage: npm run ai:play -- --genome PATH [flags]

  --genome PATH  a champion.json, or a checkpoint (its leader is used)
  --vs WHO       ${BASELINES.map((opponent) => opponent.id).join(' | ')} | a saved opponent's
                 name | a path to another genome (default ${BASELINES[0].id})
  --games N      scenarios to measure, each played from both sides (default 20)
  --seed N       seed for the scenarios and the dice (default 7)
  --cap N        rounds before a game goes to the defender (default ${DEFAULT_ROUND_CAP})
  --size N       pin the roster size instead of drawing it
  --trace        print one game round by round
  --describe     print the genome's trees
`

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    genome: null,
    vs: BASELINES[0].id,
    games: 20,
    seed: 7,
    cap: DEFAULT_ROUND_CAP,
    size: null,
    trace: false,
    describe: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--help' || flag === '-h') {
      process.stdout.write(USAGE)
      process.exit(0)
    }
    if (flag === '--trace') {
      flags.trace = true
      continue
    }
    if (flag === '--describe') {
      flags.describe = true
      continue
    }
    const value = argv[i + 1]
    if (value === undefined) throw new Error(`${flag} needs a value`)
    i += 1
    switch (flag) {
      case '--genome':
        flags.genome = value
        break
      case '--vs':
        flags.vs = value
        break
      case '--games':
        flags.games = Number(value)
        break
      case '--seed':
        flags.seed = Number(value)
        break
      case '--cap':
        flags.cap = Number(value)
        break
      case '--size':
        flags.size = Number(value)
        break
      default:
        throw new Error(`unknown flag ${flag}\n\n${USAGE}`)
    }
  }

  if (!flags.genome) throw new Error(`--genome is required\n\n${USAGE}`)
  return flags
}

/**
 * Read a genome from either kind of file a run writes: a bare champion, or a
 * checkpoint, whose population is in ranked order so its leader comes first.
 */
export function readGenome(path: string): Genome {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (
    typeof value === 'object' &&
    value !== null &&
    'population' in (value as Record<string, unknown>)
  ) {
    return parseCheckpoint(value).population[0]
  }
  return parseGenome(value)
}

/** A `--vs` argument: one of the baselines, a saved opponent, or a genome on disk. */
function readOpponent(who: string): Commander {
  const baseline = baselineById(who)
  if (baseline) return baseline
  const saved = readSavedOpponent('artifacts', who)
  if (saved) return saved.commander
  return commanderOf(readGenome(who))
}

function num(value: number, digits = 3): string {
  return value.toFixed(digits)
}

function tag(unit: UnitState): string {
  return `${unit.side === 'player' ? 'P' : 'E'}·${unit.tag}`
}

/** One traced round, as a few lines: who was ordered what, then what it cost. */
function showRound(trace: RoundTrace, postures: Record<Side, number>): string[] {
  const byId = new Map(trace.before.map((unit) => [unit.id, unit]))
  const lines = [
    `round ${trace.round} — postures: player ${postures.player}, enemy ${postures.enemy}`,
  ]
  for (const unit of trace.before) {
    if (!isAlive(unit)) continue
    const order = trace.orders[unit.id]
    lines.push(
      `  ${tag(unit)} ${unit.pos.q},${unit.pos.r} facing ${unit.facing} ` +
        `(${unit.hits} hits) ${orderCode(order)}`,
    )
  }
  for (const shot of trace.result.shots) {
    const shooter = byId.get(shot.shooterId)
    const target = byId.get(shot.targetId)
    if (!shooter || !target) continue
    lines.push(
      `  shoot ${tag(shooter)} → ${tag(target)}: d6 ${shot.roll} for ${shot.hits} hits`,
    )
  }
  for (const fight of trace.result.engagements) {
    const a = byId.get(fight.aId)
    const b = byId.get(fight.bId)
    if (!a || !b) continue
    lines.push(
      `  melee ${tag(a)} ↔ ${tag(b)}: ` +
        `${fight.a.hits} hits${fight.a.rear ? ' (rear)' : ''} out, ` +
        `${fight.b.hits} hits${fight.b.rear ? ' (rear)' : ''} back`,
    )
  }
  for (const id of trace.result.eliminatedIds) {
    const unit = byId.get(id)
    if (unit) lines.push(`  eliminated ${tag(unit)}`)
  }
  return lines
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2))
  const say = (text: string) => process.stdout.write(`${text}\n`)

  const genome = readGenome(flags.genome!)
  const opponent = readOpponent(flags.vs)

  if (flags.describe) {
    say(describeGenome(genome))
    say('')
  }

  if (flags.trace) {
    const seed = seedFrom(flags.seed, 0)
    const scenario = randomScenario(makeRng(seed), {
      seed,
      ...(flags.size === null ? {} : { size: flags.size }),
    })
    const roster = rosterOf(scenario.units)
    say(
      `tracing one game: ${genome.id} (player) against ${opponent.id} (enemy), ` +
        `${roster.player} units a side, ${scenario.attacker} attacking, scenario seed ${seed}`,
    )
    const outcome = playGame(
      commanderOf(genome),
      opponent,
      scenario,
      makeRng(seed + 1),
      {
        roundCap: flags.cap,
        onRound: (trace) => {
          const postures = {
            player: postureFor(
              genome,
              trace.before,
              'player',
              trace.round,
              roster,
              scenario.attacker,
            ),
            // a baseline has no posture of its own; showing the subject's read of
            // the enemy side would be a lie, so it is left at zero
            enemy: 0,
          }
          for (const row of showRound(trace, postures)) say(row)
        },
      },
    )
    say(
      `result: ${outcome.winner} after ${outcome.rounds} rounds` +
        `${outcome.winner === outcome.attacker ? '' : ' (held)'} — ` +
        `strength ${num(outcome.strength.player)} vs ${num(outcome.strength.enemy)}`,
    )
    say('')
  }

  const mark = benchmark(genome, opponent, {
    games: flags.games,
    seed: flags.seed,
    roundCap: flags.cap,
  })
  say(
    `${genome.id} vs ${mark.opponent} over ${mark.games} games ` +
      `(${flags.games} scenarios, both sides each)`,
  )
  say(
    `  ${mark.wins}W ${mark.losses}L — win rate ${num(mark.winRate)}, ` +
      `differential ${num(mark.differential)}`,
  )
}

main()
