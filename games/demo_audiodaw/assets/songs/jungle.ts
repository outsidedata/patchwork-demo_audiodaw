// The jungle generator: a new song from a seed, in the form and by the rules of JUNGLE (the hand-written
// song in `plugins/studio/songs.ts`), each roll of `random(seed)` choosing what JUNGLE fixed. The same
// seed makes the same song. `jungle.song.ts` beside this runs it and writes the songs the studio lists.
//
// The form is a loop around a race: an intro of 16 bars that hints at the themes, a drop into a song
// that loops while the race runs, and an unwind of 8 bars back to the intro's state. The song between
// is one of `FORMS`, 32, 48 or 64 bars of verses (16), choruses (16), breakdowns (8) and variations
// (8); the song's `loop` is its first bar to the unwind's.
//
// The rolls:
//   key and tempo   a minor key, F to E (the song is written in F minor and moved), at 164 to 176.
//   chords          each section's run, from `CHORDS`: every chord keeps two notes at least of the one
//                   before it, across every section's edge and the two wraps (the loop's end back to its
//                   start, the unwind's end back to the intro's first chord), and is never the one
//                   before it. Each eight bars change 4 2 2 or 2 2 4. The intro plays the verse's run.
//   pads            each bar's chord struck in 3 3 3 3 2 2 sixteenths, the first the loudest.
//   bass            a dotted half on the one, the root low, and in some bars an octave walk after it,
//                   a note or two, as an arpeggiator let on for a moment; a Reese an octave up in the
//                   choruses and the variation.
//   lead            through a dotted-eighth delay. A phrase is notes one after another with no gap,
//                   and starts on beat 3; no note is struck on a one, and a note that would be carries
//                   the one before it across. A theme of four bars is rolled once and played in the
//                   choruses with an answer and an ending, its head in the verse's calls and the
//                   intro's, a step or two higher in the variation, with the third under it.
//   drums           two breaks rolled from cells of a beat (the one, the backbeat, the three, the four,
//                   each with its kicks and ghost snares), a busier one, fills ending in a snare roll
//                   of 4, 6 or 8, and the hats in one of two feels.
//   the rest        pings an octave apart into the room before a section's edge, swells rising over a
//                   chord's top three notes into each edge, and the automation: the intro's high-pass
//                   falling into the drop and rising again in the unwind, the Reese's cutoff opened in
//                   the choruses and wobbled in the variation, the drums thrown into the room before a
//                   breakdown and before the unwind.
import type { AutomationPattern, Clip, Device, Knob, Note, Pattern, Preset, Project, Track } from '#plugins/audiodaw/audiodaw.sim.ts'
import { BAR, PPQ, TICKS as S, TRACK_COLORS, noteOf, row } from '../../plugins/studio/edits.ts'
import { CLOSED, KICK, OPEN, RIDE, TICK, chord, device, fx, h, lane, n, roll, snare, sweep } from '../../plugins/studio/songs.ts'

// A generator of numbers from 0 to 1 from `seed` (mulberry32), and the rolls made of them.
export function random(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    // A whole number from `lo` to `hi`, both included.
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
    chance: (p: number) => next() < p,
    between: (lo: number, hi: number) => lo + next() * (hi - lo),
  }
}
export type Random = ReturnType<typeof random>

// The chords, in F minor: each voiced for the pads and with its root for the bass.
export const CHORDS: Record<string, { voicing: string[]; root: string }> = {
  Fm9: { voicing: ['F3', 'Ab3', 'C4', 'Eb4', 'G4'], root: 'F1' },
  Fm11: { voicing: ['F3', 'Ab3', 'Bb3', 'C4', 'Eb4'], root: 'F1' },
  Dbmaj7: { voicing: ['Db3', 'F3', 'Ab3', 'C4', 'F4'], root: 'Db2' },
  Dbmaj9: { voicing: ['Db3', 'F3', 'Ab3', 'C4', 'Eb4'], root: 'Db2' },
  Bbm9: { voicing: ['Db3', 'F3', 'Ab3', 'Bb3', 'C4'], root: 'Bb1' },
  C7sus4: { voicing: ['C3', 'F3', 'Bb3', 'C4', 'G4'], root: 'C2' },
  Cm7: { voicing: ['C3', 'G3', 'Bb3', 'Eb4', 'G4'], root: 'C2' },
  Abmaj9: { voicing: ['Eb3', 'Ab3', 'C4', 'G4', 'Bb4'], root: 'Ab1' },
  Eb7sus4: { voicing: ['Eb3', 'Ab3', 'Bb3', 'Db4', 'Eb4'], root: 'Eb2' },
  Ebadd9: { voicing: ['Eb3', 'G3', 'Bb3', 'Eb4', 'F4'], root: 'Eb2' },
}
const TONIC = ['Fm9', 'Fm11']
// The chords a chorus, a variation or a breakdown may open on: never the tonic, so it lifts.
const LIFT = ['Dbmaj9', 'Dbmaj7', 'Abmaj9', 'Bbm9']
// How each eight bars change chords.
export const SHAPES = [[4, 2, 2], [2, 2, 4]] as const

export type Kind = 'intro' | 'verse' | 'chorus' | 'breakdown' | 'variation' | 'unwind'
export const BARS: Record<Kind, number> = { intro: 16, verse: 16, chorus: 16, breakdown: 8, variation: 8, unwind: 8 }
// The songs between the intro and the unwind, 32, 48 and 64 bars.
export const FORMS: Kind[][] = [
  ['verse', 'chorus'],
  ['verse', 'chorus', 'breakdown', 'variation'],
  ['verse', 'chorus', 'breakdown', 'variation', 'chorus'],
  ['verse', 'chorus', 'verse', 'breakdown', 'variation'],
]
// The keys a song can be moved to from F minor, by semitones, and their names.
const KEYS = ['F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E']
const SHIFTS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]

export type Section = { kind: Kind; bar: number; bars: number }
// A chord of the song: its name, the bar it starts on and its bars.
export type Change = { chord: string; bar: number; bars: number }
// What a seed rolled: the key, the tempo, the sections and every chord, bar by bar.
export type Plan = { seed: number; key: string; shift: number; bpm: number; sections: Section[]; chords: Change[]; loop: { start: number; end: number } }
type Run = [chord: string, bars: number][]

const range = (k: number) => Array.from({ length: k }, (_, i) => i)
const mod = (a: number, b: number) => ((a % b) + b) % b
const midi = (note: string) => row(n(0, 1, note))
// A chord's pitch classes.
export const classes = (c: string) => new Set(CHORDS[c]!.voicing.map(x => midi(x) % 12))
// How many pitch classes two chords share.
export const shared = (a: string, b: string) => [...classes(a)].filter(x => classes(b).has(x)).length
// Two chords one may follow the other: another chord, keeping two notes at least.
export const follows = (a: string, b: string) => a !== b && shared(a, b) >= 2

// The bars of a run of `bars` (a multiple of 8): each eight bars 4 2 2 or 2 2 4, mostly the same shape
// through a section.
function rhythmOf(r: Random, bars: number): number[] {
  const first = r.pick(SHAPES)
  return range(bars / 8).flatMap(i => [...(i && r.chance(0.3) ? r.pick(SHAPES) : first)])
}

// A run of chords over `bars`, opening on one of `opening`, each following the one before.
function runOf(r: Random, bars: number, opening: readonly string[]): Run {
  const lengths = rhythmOf(r, bars)
  const names = Object.keys(CHORDS)
  const out: Run = []
  for (const len of lengths) {
    const prev = out.at(-1)?.[0]
    const choices = prev ? names.filter(c => follows(prev, c)) : [...opening]
    out.push([r.pick(choices), len])
  }
  return out
}

// The sections and chords of a song: each kind's run rolled again until every chord follows the one
// before it through the whole song and both wraps.
function harmony(r: Random, form: Kind[]): { sections: Section[]; runs: Record<string, Run> } {
  const kinds: Kind[] = ['intro', ...form, 'unwind']
  let bar = 0
  const sections = kinds.map(kind => {
    const s = { kind, bar, bars: BARS[kind] }
    bar += s.bars
    return s
  })
  const tonic = r.pick(TONIC)
  for (let attempt = 0; attempt < 10000; attempt++) {
    const runs: Record<string, Run> = {}
    runs.verse = runOf(r, 16, [tonic])
    runs.intro = runs.verse
    if (form.includes('chorus')) runs.chorus = runOf(r, 16, LIFT)
    if (form.includes('breakdown')) runs.breakdown = runOf(r, 8, LIFT)
    if (form.includes('variation')) runs.variation = runOf(r, 8, LIFT)
    runs.unwind = runOf(r, 8, [tonic])
    const order = kinds.flatMap(k => runs[k]!.map(([c]) => c))
    const loop = form.flatMap(k => runs[k]!.map(([c]) => c))
    const ok = order.every((c, i) => i === 0 || follows(order[i - 1]!, c))
      && follows(loop.at(-1)!, loop[0]!)
      && follows(order.at(-1)!, order[0]!)
    if (ok) return { sections, runs }
  }
  throw new Error('jungle: no chords follow one another for this form')
}

// ---- the lead -----------------------------------------------------------------------------------

// F minor from F, the steps of its notes; degree 0 is F4, 7 is F5.
const STEPS = [0, 2, 3, 5, 7, 8, 10]
const F4 = 65
const pitch = (deg: number) => F4 + 12 * Math.floor(deg / 7) + STEPS[mod(deg, 7)]!
// The lead's lowest and highest degrees: Ab4 and C6.
const LO = 2, HI = 11
// Runs of lengths in sixteenths a phrase is made of, one after another.
const CELLS = [[2, 2, 3, 9], [2, 2, 4], [2, 2, 2, 6], [3, 3, 2], [4, 4], [2, 6], [2, 2, 8], [3, 3, 4, 6], [2, 2, 3, 5]]
// Steps from one note of a phrase to the next, by degree.
const MOTION = [-2, -1, -1, -1, 1, 1, 1, 2, -3, 3, 0]

// A lead note: its sixteenth from the start of the bar the line is placed at, its length and degree.
type Tone = { s: number; len: number; deg: number }
// A line: notes, and which of them are long enough to land on a chord's tone.
type Line = Tone[]

// The degree nearest `deg` whose note is one of the chord's, inside the lead's range.
function nearest(deg: number, chord: string): number {
  const pcs = classes(chord)
  for (let k = 0; k <= 7; k++) {
    for (const d of [deg - k, deg + k]) if (d >= LO && d <= HI && pcs.has(mod(pitch(d), 12))) return d
  }
  throw new Error(`jungle: no tone of ${chord} near degree ${deg}`)
}

// The lengths of a phrase from sixteenth `from` (on a beat 3) to `to`, one after another with no gap.
// A note that would be struck on a one is not: the note before it carries across. The last note runs
// to `to` and is 4 long at least.
function lengths(r: Random, from: number, to: number): { s: number; len: number }[] {
  const out: { s: number; len: number }[] = []
  // Struck at `s` for `len`, or, on a one, the note before carried across it.
  const strike = (s: number, len: number) => {
    if (s % 16 === 0 && out.length) out.at(-1)!.len += len
    else out.push({ s, len })
  }
  let s = from
  // Cells while one starts with a note that leaves 4 for the last; every note of a cell that fits.
  while (s + 2 <= to - 4) {
    for (const d of r.pick(CELLS.filter(c => s + c[0]! <= to - 4))) {
      if (s + d > to - 4) break
      strike(s, d)
      s += d
    }
  }
  strike(s, to - s)
  return out
}

// Degrees for a run of lengths, stepping from `start`.
function contour(r: Random, notes: { s: number; len: number }[], start: number): Line {
  let deg = start
  return notes.map((x, i) => {
    if (i) deg = Math.min(HI, Math.max(LO, deg + r.pick(MOTION)))
    return { ...x, deg }
  })
}

// The theme: four bars from beat 3 of its first bar to the one of its fifth, in two phrases of two
// bars or three (two of one bar and one of two), with a rest between them.
function themeOf(r: Random): Line {
  const plans = [
    [[8, r.pick([20, 22, 24])], [40, r.pick([20, 22, 24])]],
    [[8, r.pick([12, 14, 16])], [24, r.pick([10, 12, 14, 16])], [40, r.pick([20, 22, 24])]],
  ]
  let start = r.int(4, 8)
  const out: Line = []
  for (const [from, len] of r.pick(plans)) {
    const phrase = contour(r, lengths(r, from!, from! + len!), start)
    out.push(...phrase)
    start = Math.min(HI, Math.max(LO, phrase.at(-1)!.deg + r.pick([-2, -1, 1, 2, 3])))
  }
  return out
}

// A line moved by `by` degrees, kept inside the lead's range by moving it less.
function raised(line: Line, by: number): Line {
  let k = by
  while (k > 0 && line.some(x => x.deg + k > HI)) k--
  while (k < 0 && line.some(x => x.deg + k < LO)) k++
  return line.map(x => ({ ...x, deg: x.deg + k }))
}

// The phrase starting first in a line: its notes to the first gap.
function head(line: Line): Line {
  const out: Line = [line[0]!]
  for (const x of line.slice(1)) {
    const last = out.at(-1)!
    if (x.s !== last.s + last.len) break
    out.push(x)
  }
  return out
}

// A call: the head's first `k` notes, the last held to make it 6 long at least, and kept inside two
// bars from its beat 3 (to the one two bars on).
function call(line: Line, k: number): Line {
  const notes = head(line).slice(0, Math.max(2, k)).map(x => ({ ...x }))
  const last = notes.at(-1)!
  last.len = Math.min(24 - (last.s - 8), Math.max(6, last.len))
  return notes
}

// ---- the drums ----------------------------------------------------------------------------------

// A hit of a cell: its sixteenth in the beat, a kick or a snare, and how hard.
type Hit = [s: number, is: 'K' | 'S', velocity: number]
// The cells of a beat, by its place in the bar: the one, a backbeat (2 or 4), the three, and the four
// that turns the break round at the end of its second bar. A soft snare is a ghost.
const ONE: Hit[][] = [[[0, 'K', 0.95]], [[0, 'K', 0.95], [2, 'K', 0.7]], [[0, 'K', 0.95], [3, 'S', 0.3]], [[0, 'K', 0.95], [2, 'K', 0.65], [3, 'S', 0.3]]]
const BACK: Hit[][] = [[[0, 'S', 0.9]], [[0, 'S', 0.9], [3, 'S', 0.3]], [[0, 'S', 0.9], [2, 'S', 0.3]], [[0, 'S', 0.9], [2, 'S', 0.28], [3, 'S', 0.36]]]
const THREE: Hit[][] = [[[2, 'K', 0.85]], [[1, 'S', 0.38], [2, 'K', 0.85]], [[0, 'K', 0.8], [2, 'K', 0.6]], [[2, 'K', 0.8], [3, 'K', 0.5]], [[0, 'S', 0.3], [2, 'K', 0.85]]]
const TURN: Hit[][] = [...BACK, [[0, 'S', 0.9], [2, 'S', 0.34], [3, 'S', 0.42]], [[0, 'S', 0.9], [1, 'S', 0.3], [2, 'S', 0.7], [3, 'S', 0.4]]]

// Two bars of a break rolled from the cells, each hit a little harder or softer.
function breakOf(r: Random): Note[] {
  const roles = [ONE, BACK, THREE, BACK, ONE, BACK, THREE, TURN]
  return roles.flatMap((cells, beat) => r.pick(cells).flatMap(([s, is, v]) => {
    const at = beat * 4 + s
    const velocity = Math.min(1, Math.max(0.2, v + r.between(-0.04, 0.04)))
    return is === 'K' ? [h(at, KICK, velocity)] : snare(at, velocity)
  }))
}

// Two bars of hats in one of two feels: the closed on every eighth, its offbeats louder, a tick before
// every second beat; or the closed on the offbeats and ticks between.
function hatsOf(r: Random): Note[] {
  if (r.chance(0.5)) return range(16).flatMap(i => [h(i * 2, CLOSED, i % 2 ? 0.5 : 0.32), ...(i % 4 === 1 ? [h(i * 2 + 1, TICK, 0.2)] : [])])
  return range(8).flatMap(i => [h(i * 4 + 2, CLOSED, 0.5), h(i * 4 + 1, TICK, 0.18), ...(i % 2 ? [h(i * 4 + 3, TICK, 0.24)] : [])])
}

// ---- the song -----------------------------------------------------------------------------------

// The colour of the track at `i`.
const colourOf = (i: number) => TRACK_COLORS[i % TRACK_COLORS.length]!
const track = (i: number, name: string, target: number, patterns: Record<string, Pattern>): Track =>
  ({ kind: 'notes', name, color: colourOf(i), target, patterns, mute: false, solo: false })
const knobTrack = (i: number, name: string, target: Knob, patterns: Record<string, AutomationPattern>): Track =>
  ({ kind: 'automation', name, color: colourOf(i), target, patterns, mute: false })
const bars = (count: number, notes: Note[]): Pattern => ({ length: count * BAR, notes })

// Each chord of a run, with the sixteenth it starts on and its bars.
function over(r: Run, each: (chord: string, at: number, bars: number) => Note[]): Note[] {
  let at = 0
  return r.flatMap(([c, count]) => {
    const out = each(c, at, count)
    at += count * 16
    return out
  })
}
// The chord of a run at each of its bars.
const barsOf = (r: Run) => r.flatMap(([c, count]) => range(count).map(() => c))

export type Song = { plan: Plan; project: Project }

export function jungle(seed: number, presets: Preset[]): Song {
  const r = random(seed)
  const shift = r.pick(SHIFTS)
  const bpm = r.int(164, 176)
  const form = r.pick(FORMS)
  const { sections, runs } = harmony(r, form)
  const total = sections.at(-1)!.bar + sections.at(-1)!.bars
  const loop = { start: sections[1]!.bar, end: sections.at(-1)!.bar }
  // Every bar's chord through the song.
  const chordAt: string[] = sections.flatMap(s => barsOf(runs[s.kind]!))
  const changes: Change[] = []
  chordAt.forEach((c, bar) => {
    if (changes.at(-1)?.chord === c && sections.every(s => s.bar !== bar)) changes.at(-1)!.bars++
    else changes.push({ chord: c, bar, bars: 1 })
  })
  const kinds = new Set(sections.map(s => s.kind))

  // The pads: struck in 3 3 3 3 2 2, the first of each bar the loudest; and held.
  const struck = (run: Run, velocity: number) => over(run, (c, at, count) => range(count).flatMap(b => {
    let s = 0
    return [3, 3, 3, 3, 2, 2].flatMap((g, i) => {
      const notes = chord(at + b * 16 + s, g, CHORDS[c]!.voicing, i === 0 ? velocity : velocity * 0.78)
      s += g
      return notes
    })
  }))
  const held = (run: Run, velocity: number) => over(run, (c, at, count) => chord(at, count * 16, CHORDS[c]!.voicing, velocity))
  // The bass: a dotted half on each bar's one, and in some bars a walk of octaves after it; `by`
  // semitones over the root. The walks are rolled once a run, so the Reese walks with the sub.
  const WALKS: [s: number, by: number, len: number][][] = [
    [[14, 12, 2]], [[14, 12, 2]], [[12, 12, 2], [14, 0, 2]], [[13, 12, 1], [14, 12, 2]], [[12, 12, 1], [13, 0, 1], [14, 12, 1], [15, 0, 1]],
  ]
  const walksOf = (run: Run) => {
    const p = r.between(0.25, 0.55)
    return barsOf(run).map(() => (r.chance(p) ? r.pick(WALKS) : []))
  }
  const walking = (run: Run, walks: ReturnType<typeof walksOf>, velocity: number, by = 0) =>
    barsOf(run).flatMap((c, b) => {
      const root = midi(CHORDS[c]!.root) + by
      return [n(b * 16, 12, noteOf(root), velocity), ...walks[b]!.map(([s, up, len]) => n(b * 16 + s, len, noteOf(root + up), velocity * 0.7))]
    })

  // The lead, its theme rolled once.
  const theme = themeOf(r)
  const answer = (() => {
    const up = raised(theme, r.pick([1, 2]))
    const last = themeOf(r).filter(x => x.s >= 40)
    return [...up.filter(x => x.s < 40), ...last]
  })()
  const ending = themeOf(r)
  const lead: Note[] = []
  const thirds: Note[] = []
  // A line placed at `bar`: its long notes (4 and over) and every phrase's last on a tone of the chord
  // under them, struck at `velocity`, the third under each when `third`.
  const place = (line: Line, bar: number, velocity: number, third = false) => {
    line.forEach((x, i) => {
      const at = bar * 16 + x.s
      const next = line[i + 1]
      const last = !next || next.s !== x.s + x.len
      const c = chordAt[Math.floor(at / 16)]!
      const deg = x.len >= 4 || last ? nearest(x.deg, c) : x.deg
      const v = Math.min(1, velocity + (x.len >= 4 ? 0.05 : 0) + r.between(-0.03, 0.03))
      lead.push(n(at, x.len, noteOf(pitch(deg) + shift), v))
      if (third) thirds.push(n(at, x.len, noteOf(pitch(deg - 2) + shift), v * 0.55))
    })
  }
  for (const s of sections) {
    const b = s.bar
    if (s.kind === 'intro') for (const k of [3, 7, 11]) place(call(theme, r.int(2, 3)), b + k, 0.58)
    if (s.kind === 'verse') {
      place(head(theme), b - 1, 0.72)
      for (const k of [3, 7, 11]) place(raised(call(theme, r.int(2, 4)), r.pick([-1, 0, 1, 2])), b + k, 0.72)
    }
    if (s.kind === 'chorus') {
      place(theme, b - 1, 0.84)
      place(answer, b + 3, 0.84)
      place(theme, b + 7, 0.84)
      place(ending, b + 11, 0.84)
    }
    if (s.kind === 'breakdown') place([{ s: 8, len: 16, deg: r.int(8, 10) }], b + 3, 0.6)
    if (s.kind === 'variation') {
      place(raised(theme, r.pick([2, 3])), b - 1, 0.84, true)
      place(raised(answer, r.pick([2, 3, 4])), b + 3, 0.84, true)
    }
    if (s.kind === 'unwind') place(call(theme, 2), b + 3, 0.58)
  }

  // The pings before each edge, and in the breakdown; the swells into each edge and halfway through
  // a long section. Each on the chord of its bar.
  const pings: Note[] = []
  const swells: Note[] = []
  const ping = (bar: number, pairs: [s: number, octave: number, velocity: number][]) => {
    const pc = midi(CHORDS[chordAt[bar]!]!.root) % 12
    for (const [s, octave, v] of pairs) pings.push(n(bar * 16 + s, 2, noteOf(pc + 12 * (octave + 1) + shift), v))
  }
  const swell = (bar: number, count: number) => swells.push(...chord(bar * 16, count * 16, CHORDS[chordAt[bar]!]!.voicing.slice(2).map(x => noteOf(midi(x) + shift)), 0.55))
  for (const s of sections) {
    const edge = s.bar + s.bars - 1
    if (r.chance(0.7)) ping(edge, r.pick([[[6, 2, 0.6], [7, 3, 0.5]], [[10, 3, 0.55], [11, 2, 0.45]], [[6, 2, 0.6], [7, 3, 0.5], [10, 2, 0.45]]]))
    if (s.kind === 'breakdown') for (const k of [1, 5]) ping(s.bar + k, [[10, 3, 0.5]])
    swell(s.bar + s.bars - 2, 2)
    if (s.bars === 16 && r.chance(0.6)) swell(s.bar + 6, 2)
  }

  // A ping rings two sixteenths, or to the next one: the Ping is one voice.
  pings.sort((a, b) => a.time - b.time)
  pings.forEach((x, i) => { x.duration = Math.min(2 * S, (pings[i + 1]?.time ?? Infinity) - x.time) })

  // The drums.
  const amen = breakOf(r)
  let chop = breakOf(r)
  while (JSON.stringify(chop) === JSON.stringify(amen)) chop = breakOf(r)
  const hats = hatsOf(r)
  const ride = range(8).map(i => h(i * 4, RIDE, 0.28))
  // Two or three ghost snares more, off the beats and where the break has nothing.
  const ghosts = range(32).filter(s => s % 4 && !amen.some(x => x.time === s * S))
  const more: number[] = []
  for (let k = r.int(2, 3); k > 0; k--) more.push(...ghosts.splice(Math.floor(r.next() * ghosts.length), 1))
  const extra = [...more.flatMap(s => snare(s, r.between(0.24, 0.32))), h(r.pick([14, 30]), OPEN, 0.45), ...ride]
  const first = (notes: Note[]) => notes.filter(x => x.time < 16 * S)
  // The break's first bar, then a bar of kick, snare and a roll of 4, 6 or 8 into the next.
  const filled = (notes: Note[], more: Note[] = []) => {
    const count = r.pick([4, 6, 8])
    return [
      ...first(notes), ...first(more), h(16, KICK, 0.9), ...snare(20, 0.9), ...(count < 8 ? [h(22, KICK, 0.7)] : []), ...roll(32 - count, count, 0.35, 0.95),
      ...hats.filter(x => x.time < (32 - count) * S),
    ]
  }
  const breaks: Record<string, Pattern> = {
    amen: bars(2, [...amen, ...hats]),
    fill: bars(2, filled(amen)),
    busy: bars(2, [...amen, ...hats, ...extra]),
    busyFill: bars(2, filled(amen, extra)),
    chop: bars(2, [...chop, ...hats, ...ride]),
    bare: bars(2, [...amen.filter(x => x.note !== KICK), ...hats]),
  }
  const alone: Record<string, Pattern> = {
    air: bars(2, [h(6, CLOSED, 0.28), h(14, CLOSED, 0.34), h(22, TICK, 0.22), h(30, OPEN, 0.3)]),
    ticking: bars(2, range(8).flatMap(i => [h(i * 4 + 2, CLOSED, 0.36), h(i * 4 + 3, TICK, 0.16)])),
    build: bars(2, [...roll(0, 8, 0.14, 0.42, 2), ...roll(16, 16, 0.42, 0.95)]),
  }

  const rack: Device[] = [
    device(presets, { name: 'DRUMS', preset: 'Jungle Kit', volume: 0, pan: 0, sends: { room: -20 }, effects: [fx('Compressor', { threshold: -14, ratio: 4, attack: 0.003, release: 0.12 })] }),
    device(presets, { name: 'SUB', preset: 'Sub', volume: -2, pan: 0 }),
    device(presets, { name: 'REESE', preset: 'Reese', volume: -6, pan: 0, effects: [fx('Phaser', { frequency: 0.15, octaves: 2, baseFrequency: 300, stages: 4, wet: 0.4 })] }),
    device(presets, { name: 'STABS', preset: 'Stab Pad', volume: -4, pan: 0, sends: { room: -8, echo: -16 }, effects: [fx('Chorus', { frequency: 0.5, delayTime: 3.5, depth: 0.5, wet: 0.35 })] }),
    device(presets, { name: 'AIR', preset: 'Air Pad', volume: -6, pan: 0, sends: { room: -4 }, effects: [fx('Filter', { type: 'highpass', frequency: 750, rolloff: -24, Q: 0.7 }), fx('Chorus', { frequency: 0.3, delayTime: 4, depth: 0.6, wet: 0.4 })] }),
    device(presets, { name: 'WARM', preset: 'Air Pad', volume: -5, pan: 0, sends: { room: -4 }, effects: [fx('Filter', { type: 'lowpass', frequency: 3200, rolloff: -12, Q: 0.7 })] }),
    device(presets, { name: 'SWELL', preset: 'Swell', volume: -6, pan: 0, sends: { room: -6 } }),
    device(presets, { name: 'PING', preset: 'Ping', volume: -8, pan: -0.2, sends: { room: 0, echo: -8 } }),
    device(presets, { name: 'LEAD', preset: 'Square Lead', volume: -6, pan: 0.1, sends: { room: -10 }, effects: [fx('Vibrato', { frequency: 5.5, depth: 0.06, wet: 1 }), fx('FeedbackDelay', { delayTime: '8n.', feedback: Math.round(r.between(0.32, 0.45) * 100) / 100, wet: 0.3 })] }),
  ]

  // The pitched parts moved to the key.
  const moved = (notes: Note[]) => notes.map(x => ({ ...x, note: noteOf(midi(x.note) + shift) }))
  const sub: Record<string, Pattern> = {}
  const reese: Record<string, Pattern> = {}
  const stabs: Record<string, Pattern> = {}
  const air: Record<string, Pattern> = {}
  const warm: Record<string, Pattern> = {}
  for (const k of ['verse', 'chorus', 'variation'] as const) {
    if (!kinds.has(k)) continue
    const run = runs[k]!
    const walks = walksOf(run)
    sub[k] = bars(BARS[k], moved(walking(run, walks, 0.85)))
    if (k !== 'verse') reese[k] = bars(BARS[k], moved(walking(run, walks, 0.7, 12)))
    stabs[k] = bars(BARS[k], moved(struck(run, k === 'verse' ? 0.55 : 0.62)))
  }
  if (kinds.has('breakdown')) {
    const run = runs.breakdown!
    sub.breakdown = bars(8, moved(barsOf(run).flatMap((c, b) => (b % 2 ? [] : [n(b * 16, 12, CHORDS[c]!.root, 0.8)]))))
    warm.breakdown = bars(8, moved(held(run, 0.6)))
  }
  {
    const run = runs.unwind!
    const at = barsOf(run)
    sub.unwind = bars(4, moved([n(0, 12, CHORDS[at[0]!]!.root, 0.8), n(16, 12, CHORDS[at[1]!]!.root, 0.8), n(32, 12, CHORDS[at[2]!]!.root, 0.7)]))
    stabs.unwind = bars(2, moved(struck([[at[0]!, 1], [at[1]!, 1]], 0.5)))
    air.unwind = bars(8, moved(held(run, 0.45)))
  }
  air.intro = bars(16, moved(held(runs.intro!, 0.5)))
  if (kinds.has('chorus')) air.chorus = bars(16, moved(held(runs.chorus!, 0.32)))

  const AIR = 4
  const tracks: Track[] = [
    track(0, 'BREAKS', 0, breaks),
    track(1, 'HATS', 0, alone),
    track(2, 'SUB', 1, sub),
    track(3, 'REESE', 2, reese),
    track(4, 'STABS', 3, stabs),
    track(5, 'AIR', AIR, air),
    track(6, 'WARM', 5, warm),
    track(7, 'SWELL', 6, { swells: bars(total, swells) }),
    track(8, 'PING', 7, { pings: bars(total, pings) }),
    track(9, 'LEAD', 8, { lead: bars(total, [...lead, ...thirds]) }),
    // AIR's high-pass (20 Hz–20 kHz on the log curve): held up through the intro, stepped down
    // halfway, falling into the drop; risen again through the unwind.
    knobTrack(10, 'AIR CUTOFF', { part: 'effect', chain: { device: AIR }, effect: rack[AIR]!.effects.findIndex(e => e.is === 'Filter'), path: ['frequency'] }, {
      intro: lane(16, [sweep(0, 16, [[0, r.between(0.58, 0.66)], [8, r.between(0.5, 0.56), 'step'], [12, r.between(0.36, 0.44)], [16, 0.12, 'exp']])]),
      unwind: lane(8, [sweep(2, 6, [[0, 0.12], [6, r.between(0.58, 0.66), 'exp']])]),
    }),
    // The Reese's cutoff (its filter envelope's base, 20–8000 Hz on the log curve): opened in some of
    // each chorus's four bars, and a wobble through the variation.
    knobTrack(11, 'REESE CUTOFF', { part: 'instrument', device: 2, path: ['filterEnvelope', 'baseFrequency'] }, {
      chorus: lane(16, range(4).filter(() => r.chance(0.6)).map(q => sweep(q * 4, 4, [[0, r.between(0.3, 0.4)], [4, r.between(0.6, 0.85), r.pick(['linear', 'exp'] as const)]]))),
      wobble: lane(8, [0, 2, 4, 6].map(b => sweep(b, 1.5, [[0, 0.3], [1, r.between(0.72, 0.88)], [1.5, 0.3]]))),
    }),
    // The drums' send to the room (−60 to +6 dB): thrown before a breakdown and held through it, and
    // thrown before the unwind.
    knobTrack(12, 'ROOM THROW', { part: 'send', device: 0, bus: 'room' }, {
      throw: lane(2, [sweep(0, 2, [[0, 0.6], [2, 1, 'exp']])]),
      held: lane(8, [sweep(0, 8, [[0, 0.85], [8, 0.85]])]),
    }),
  ]

  // Clips of `pattern` on track `t` from `bar` for `count` bars, one after another.
  const placed: Clip[] = []
  const put = (t: number, pattern: string, bar: number, count: number) => {
    const length = tracks[t]!.patterns[pattern]!.length
    for (let at = bar * BAR; at < (bar + count) * BAR; at += length) placed.push({ track: t, pattern, start: at })
  }
  for (const s of sections) {
    const b = s.bar
    if (s.kind === 'intro') {
      put(1, 'air', b + 4, 4); put(1, 'ticking', b + 8, 6); put(1, 'build', b + 14, 2)
      put(5, 'intro', b, 16); put(10, 'intro', b, 16)
    }
    if (s.kind === 'verse') for (const e of [0, 8]) { put(0, 'amen', b + e, 6); put(0, 'fill', b + e + 6, 2) }
    if (s.kind === 'chorus') {
      for (const e of [0, 8]) { put(0, 'busy', b + e, 6); put(0, 'busyFill', b + e + 6, 2) }
      put(3, 'chorus', b, 16); put(5, 'chorus', b, 16); put(11, 'chorus', b, 16)
    }
    if (s.kind === 'breakdown') {
      put(1, 'air', b, 4); put(1, 'ticking', b + 4, 2); put(1, 'build', b + 6, 2)
      put(6, 'breakdown', b, 8); put(12, 'throw', b - 2, 2); put(12, 'held', b, 8)
    }
    if (s.kind === 'variation') {
      put(0, 'chop', b, 2); put(0, 'busy', b + 2, 2); put(0, 'chop', b + 4, 2); put(0, 'busyFill', b + 6, 2)
      put(3, 'variation', b, 8); put(11, 'wobble', b, 8)
    }
    if (s.kind === 'unwind') {
      put(0, 'amen', b, 2); put(0, 'bare', b + 2, 2); put(1, 'air', b + 4, 4)
      put(4, 'unwind', b, 2); put(5, 'unwind', b, 8); put(10, 'unwind', b, 8); put(12, 'throw', b - 2, 2)
    }
    // The sub under every section but the intro, four bars of it in the unwind; the stabs.
    if (s.kind !== 'intro') put(2, s.kind, b, s.kind === 'unwind' ? 4 : s.bars)
    if (s.kind === 'verse' || s.kind === 'chorus' || s.kind === 'variation') put(4, s.kind, b, s.bars)
  }
  put(7, 'swells', 0, total); put(8, 'pings', 0, total); put(9, 'lead', 0, total)

  const plan: Plan = { seed, key: `${KEYS[mod(shift, 12)]} minor`, shift, bpm, sections, chords: changes, loop }
  const project: Project = {
    bpm, timeSignature: 4, swing: 0, swingSubdivision: '8n', ppq: PPQ,
    loop: { start: loop.start * BAR, end: loop.end * BAR },
    buses: {
      echo: { volume: -6, pan: 0, effects: [fx('FeedbackDelay', { delayTime: '8n.', feedback: 0.38, wet: 1 })] },
      room: { volume: -6, pan: 0, effects: [fx('Reverb', { decay: Math.round(r.between(2.5, 3.5) * 10) / 10, preDelay: 0.01, wet: 1 })] },
    },
    master: { volume: -3, effects: [fx('Compressor', { threshold: -16, ratio: 3, attack: 0.01, release: 0.2 }), fx('Limiter', { threshold: -1 })] },
    rack, tracks, clips: placed,
  }
  return { plan, project }
}
