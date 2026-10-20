// Writes jungles.json beside this file: the songs the jungle generator (`jungle.ts`) made, each with
// its seed, its name, its key, its tempo and its bars, and its project, which the studio lists after
// its own songs (the `player` definition's `studio.songs`, the scene's `jungles` catalogue entry). The
// game reads the json and never this.
//
// Each run makes one new song from a seed it rolls, or one from each seed it is handed, and makes
// every song already in the file again from its seed, so the file is always what the generator makes
// now. Run from the repo's root:
//   node_modules/.bin/vite-node games/demo_audiodaw/assets/songs/jungle.song.ts [seed ...]
import '#plugins/audiodaw/nodeaudio.ts'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import type { Preset } from '#plugins/audiodaw/audiodaw.sim.ts'
import { jungle } from './jungle.ts'

export type Made = { name: string; seed: number; key: string; bpm: number; bars: number; project: ReturnType<typeof jungle>['project'] }

const file = new URL('./jungles.json', import.meta.url)
const presets = JSON.parse(readFileSync(new URL('../presets.json', import.meta.url), 'utf8')) as Preset[]
const kept = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Made[]).map(m => m.seed) : []
const asked = process.argv.slice(2).map(Number)
for (const s of asked) if (!Number.isInteger(s) || s < 1) throw new Error(`a seed is a whole number from 1: ${s}`)
const seeds = [...new Set([...kept, ...(asked.length ? asked : [randomInt(1, 100000)])])]

const made: Made[] = seeds.map(seed => {
  const { plan, project } = jungle(seed, presets)
  const end = plan.sections.at(-1)!
  return { name: `JUNGLE ${seed}`, seed, key: plan.key, bpm: plan.bpm, bars: end.bar + end.bars, project }
})
writeFileSync(file, JSON.stringify(made))
for (const m of made) console.log(`${m.name}: ${m.key}, ${m.bpm} bpm, ${m.bars} bars`)
// Tone's audio context keeps node running once it is made; the file is written, so end.
process.exit(0)
