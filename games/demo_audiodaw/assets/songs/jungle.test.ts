import { describe, expect, it } from 'vitest'
import { patternOf, type Note, type Preset, type Project } from '#plugins/audiodaw/audiodaw.sim.ts'
import { BAR, TICKS as S, row } from '../../plugins/studio/edits.ts'
import { CHORDS, FORMS, jungle } from './jungle.ts'
import presets from '../presets.json' with { type: 'json' }

const shipped = presets as Preset[]
const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1)
const songs = SEEDS.map(seed => jungle(seed, shipped))
const pc = (note: string) => row({ time: 0, duration: 1, note, velocity: 1 }) % 12
// Whether chord `b` may follow `a`: another chord, two of its notes' pitch classes among `a`'s.
const follows = (a: string, b: string) => {
  const of = (c: string) => new Set(CHORDS[c]!.voicing.map(pc))
  return a !== b && [...of(a)].filter(x => of(b).has(x)).length >= 2
}
const trackOf = (p: Project, name: string) => p.tracks.findIndex(t => t.name === name)

// Every note a note track plays on the song, at the song's tick.
function heard(p: Project, t: number): Note[] {
  return p.clips.filter(c => c.track === t).flatMap(c => {
    const x = patternOf(p, c) as { length: number; from?: number; notes: Note[] }
    const from = x.from ?? 0
    return x.notes.filter(n => n.time >= from && n.time < x.length).map(n => ({ ...n, time: n.time - from + c.start }))
  })
}
// The most notes sounding at once.
function most(notes: Note[]): number {
  const edges = notes.flatMap(n => [[n.time, 1], [n.time + n.duration, -1]] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let now = 0, top = 0
  for (const [, d] of edges) top = Math.max(top, (now += d))
  return top
}

describe('the jungle generator', () => {
  it('makes the same song from the same seed, and another from another', () => {
    expect(JSON.stringify(jungle(7, shipped))).toBe(JSON.stringify(jungle(7, shipped)))
    expect(JSON.stringify(jungle(7, shipped).project)).not.toBe(JSON.stringify(jungle(8, shipped).project))
  })

  it('rolls every form, key and both harmonic rhythms across seeds', () => {
    expect(new Set(songs.map(s => s.plan.sections.map(x => x.kind).join()))).toHaveProperty('size', FORMS.length)
    expect(new Set(songs.map(s => s.plan.key)).size).toBeGreaterThanOrEqual(10)
    const bpms = songs.map(s => s.plan.bpm)
    expect(Math.min(...bpms)).toBeGreaterThanOrEqual(164)
    expect(Math.max(...bpms)).toBeLessThanOrEqual(176)
  })

  it('opens: every clip plays a pattern of its track, every note lies inside its pattern', () => {
    for (const { plan, project: p } of songs) {
      for (const c of p.clips) expect(() => patternOf(p, c), `${plan.seed}`).not.toThrow()
      for (const t of p.tracks) {
        if (t.kind !== 'notes') continue
        expect(p.rack[t.target!], `${plan.seed} ${t.name}`).toBeDefined()
        for (const x of Object.values(t.patterns)) for (const n of x.notes) expect(n.time + n.duration, `${plan.seed} ${t.name}`).toBeLessThanOrEqual(x.length)
      }
    }
  })

  it('an intro of 16, a song of 32 to 64 bars that loops, an unwind of 8', () => {
    for (const { plan, project: p } of songs) {
      const [intro, ...rest] = plan.sections
      const unwind = rest.at(-1)!
      expect(intro).toEqual({ kind: 'intro', bar: 0, bars: 16 })
      expect(unwind.kind).toBe('unwind')
      expect(unwind.bars).toBe(8)
      expect([32, 48, 64]).toContain(unwind.bar - 16)
      expect(p.loop).toEqual({ start: 16 * BAR, end: unwind.bar * BAR })
    }
  })

  it('every chord keeps two notes of the one before, through every edge, the loop and back to the intro', () => {
    for (const { plan } of songs) {
      const c = plan.chords
      for (let i = 1; i < c.length; i++) expect(follows(c[i - 1]!.chord, c[i]!.chord), `${plan.seed} at ${c[i]!.bar}`).toBe(true)
      const at = (bar: number) => c.find(x => bar >= x.bar && bar < x.bar + x.bars)!.chord
      expect(follows(at(plan.loop.end - 1), at(plan.loop.start)), `${plan.seed} loop`).toBe(true)
      expect(follows(c.at(-1)!.chord, c[0]!.chord), `${plan.seed} wrap`).toBe(true)
    }
  })

  it('every eight bars change chords 4 2 2 or 2 2 4', () => {
    for (const { plan } of songs) {
      const end = plan.chords.at(-1)!.bar + plan.chords.at(-1)!.bars
      for (let b = 0; b < end; b += 8) {
        const lengths = plan.chords.filter(x => x.bar >= b && x.bar < b + 8).map(x => x.bars)
        expect([[4, 2, 2], [2, 2, 4]], `${plan.seed} bar ${b}`).toContainEqual(lengths)
      }
    }
  })

  it('the stabs strike each bar in 3 3 3 3 2 2, the first the loudest', () => {
    for (const { plan, project: p } of songs) {
      const notes = heard(p, trackOf(p, 'STABS'))
      const bars = new Set(notes.map(n => Math.floor(n.time / BAR)))
      for (const b of bars) {
        const inBar = notes.filter(n => Math.floor(n.time / BAR) === b)
        const starts = [...new Set(inBar.map(n => (n.time - b * BAR) / S))].sort((x, y) => x - y)
        expect(starts, `${plan.seed} bar ${b}`).toEqual([0, 3, 6, 9, 12, 14])
        for (const n of inBar) expect(n.duration / S).toBe({ 0: 3, 3: 3, 6: 3, 9: 3, 12: 2, 14: 2 }[(n.time - b * BAR) / S])
        const loud = Math.max(...inBar.map(n => n.velocity))
        expect(inBar.filter(n => n.time === b * BAR).every(n => n.velocity === loud)).toBe(true)
      }
    }
  })

  it('the bass plays a dotted half on every bar\'s one, the root of its chord, under the verse, chorus and variation', () => {
    for (const { plan, project: p } of songs) {
      const notes = heard(p, trackOf(p, 'SUB'))
      for (const s of plan.sections.filter(x => ['verse', 'chorus', 'variation'].includes(x.kind))) {
        for (let b = s.bar; b < s.bar + s.bars; b++) {
          const one = notes.find(n => n.time === b * BAR)
          expect(one, `${plan.seed} bar ${b}`).toBeDefined()
          expect(one!.duration).toBe(12 * S)
          const chord = plan.chords.find(x => b >= x.bar && b < x.bar + x.bars)!.chord
          expect(pc(one!.note)).toBe((pc(CHORDS[chord]!.root) + plan.shift + 12) % 12)
        }
      }
    }
  })

  it('the lead never strikes a one, and every phrase starts on beat 3', () => {
    for (const { plan, project: p } of songs) {
      const notes = heard(p, trackOf(p, 'LEAD'))
      const ends = new Set(notes.map(n => n.time + n.duration))
      for (const n of notes) {
        expect(n.time % BAR, `${plan.seed} struck on a one at ${n.time / S}`).not.toBe(0)
        if (!ends.has(n.time)) expect(n.time % BAR, `${plan.seed} a phrase at ${n.time / S}`).toBe(8 * S)
      }
    }
  })

  it('the lead runs through a dotted-eighth delay', () => {
    for (const { project: p } of songs) {
      const t = p.tracks[trackOf(p, 'LEAD')]!
      const lead = p.rack[t.kind === 'notes' ? t.target! : -1]!
      expect(lead.effects.some(e => e.is === 'FeedbackDelay' && (e.options as { delayTime: string }).delayTime === '8n.')).toBe(true)
    }
  })

  it('no device is handed more notes at once than it has voices', () => {
    for (const { plan, project: p } of songs) {
      p.rack.forEach((d, i) => {
        if (d.instrument.is === 'DrumKit') return
        const notes = p.tracks.flatMap((t, k) => (t.kind === 'notes' && t.target === i ? heard(p, k) : []))
        expect(most(notes), `${plan.seed} ${d.name}`).toBeLessThanOrEqual(d.instrument.voices ?? 1)
      })
    }
  })
})
