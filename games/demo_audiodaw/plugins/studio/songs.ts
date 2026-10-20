// The studio's songs, in audiodaw's words: ticks at 192 a beat, notes Tone's names, every
// instrument a preset found by name in the presets it is handed (the scene's `presets` catalogue
// entry, `assets/presets.json`, as the loader decodes it), every effect and bus a Tone effect. Each
// is a rack of devices sending to the echo (`FeedbackDelay`) and room (`Reverb`) buses and running
// effects of their own, and tracks of notes each targeting one of them. The drums are one device, a
// kit, each hit the note of its pad. The studio opens on the first. The first two are eight bars;
// the third, `jungle`, is 72, and its form and rules are written above it.
//   acidTrack   126 bpm: an Acid Line with slides (its portamento) and accents (velocity) over a
//               kick and clap on one track and the hats on another, both into the one kit, a
//               Chorale 6 string bed, Operator 7 bell stabs on the echo and a Monarch lead in the
//               second half.
//   glassChoir  92 bpm: Chorale 6 pads through Am9, Fmaj7, C and G, and a high line on its own track
//               into the same Chorale 6, Operator 7 bells on the echo and the room, a Monarch bass, a
//               soft kick, snare and hats, and a pluck.
import type { AutomationNote, AutomationPattern, Clip, Device, Effect, Knob, Note, Pattern, Preset, Project, Shape, Track } from '#plugins/audiodaw/audiodaw.sim.ts'
import { BAR, PPQ, TICKS as S, TRACK_COLORS, noteOf, row } from './edits.ts'

// A note from sixteenth `at`, `len` sixteenths long, at a velocity of 0 to 1.
export const n = (at: number, len: number, note: string, velocity = 0.75): Note => ({ time: at * S, duration: len * S, note, velocity })
// The kits' pads, by the note that triggers each (General MIDI's).
export const KICK = 'C1', SNARE = 'D1', CLAP = 'D#1', CLOSED = 'F#1', OPEN = 'A#1'
// A drum hit at sixteenth `at` on the pad of `note`.
export const h = (at: number, note: string, velocity = 0.8): Note => ({ time: at * S, duration: S, note, velocity })
// A chord: every note from `at` for `len` sixteenths.
export const chord = (at: number, len: number, notes: string[], velocity = 0.6) => notes.map(x => n(at, len, x, velocity))

export const fx = (is: string, options: object): Effect => ({ is, on: true, options })

function preset(presets: Preset[], name: string): Preset {
  const found = presets.find(p => p.name === name)
  if (!found) throw new Error(`no preset ${name}`)
  return found
}

type Unit = { name: string; preset: string; volume: number; pan: number; sends?: Record<string, number>; effects?: Effect[] }
export function device(presets: Preset[], unit: Unit): Device {
  const p = preset(presets, unit.preset)
  return {
    name: unit.name,
    instrument: structuredClone(p.instrument),
    effects: [...structuredClone(p.effects ?? []), ...(unit.effects ?? [])],
    channel: { volume: unit.volume, pan: unit.pan, mute: false, solo: false },
    sends: unit.sends ?? {},
  }
}

// A track of `patterns` sending its notes to device `target`, its colour the palette's next.
let colours = 0
const track = (name: string, target: number, patterns: Record<string, Pattern>): Track =>
  ({ kind: 'notes', name, color: TRACK_COLORS[colours++ % TRACK_COLORS.length]!, target, patterns, mute: false, solo: false })

// An automation track of `patterns` sending its values to `target`, its colour the palette's next.
const knobTrack = (name: string, target: Knob, patterns: Record<string, AutomationPattern>): Track =>
  ({ kind: 'automation', name, color: TRACK_COLORS[colours++ % TRACK_COLORS.length]!, target, patterns, mute: false })
// An automation pattern `bars` long of `notes`.
export const lane = (bars: number, notes: AutomationNote[]): AutomationPattern => ({ length: bars * BAR, notes })
// An automation note from bar `at` for `bars`, through `points`: each a bar from the note's start, a
// value from 0 to 1 of the knob's travel and how the line reaches it (linear when left out). The
// first is at 0 and the last at `bars`.
export const sweep = (at: number, bars: number, points: [number, number, Shape?][]): AutomationNote =>
  ({ time: at * BAR, duration: bars * BAR, points: points.map(([b, value, shape]) => ({ at: b * BAR, value, shape: shape ?? 'linear' })) })

// Clips of `pattern` on track `t` filling bar `bar` to `bar + bars`, one after another, each once:
// a clip plays its pattern once, so a pattern shorter than the run is placed again at its end.
function clips(tracks: Track[], t: number, pattern: string, bar: number, bars: number): Clip[] {
  const length = tracks[t]!.patterns[pattern]!.length
  const out: Clip[] = []
  for (let at = bar * BAR; at < (bar + bars) * BAR; at += length) out.push({ track: t, pattern, start: at })
  return out
}

function song(bpm: number): Omit<Project, 'rack' | 'tracks' | 'clips'> {
  return {
    bpm, timeSignature: 4, swing: 0, swingSubdivision: '8n', ppq: PPQ,
    buses: {
      echo: { volume: -6, pan: 0, effects: [fx('FeedbackDelay', { delayTime: '8n.', feedback: 0.35, wet: 1 })] },
      room: { volume: -6, pan: 0, effects: [fx('Reverb', { decay: 2.5, preDelay: 0.01, wet: 1 })] },
    },
    master: { volume: -3, effects: [fx('Compressor', { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }), fx('Limiter', { threshold: -1 })] },
  }
}

export function acidTrack(presets: Preset[]): Project {
  colours = 0
  // The kick and clap on one track, the hats on another, both played on the one kit.
  const four: Pattern = { length: BAR, notes: [...[0, 4, 8, 12].map(s => h(s, KICK, 0.95)), h(4, CLAP, 0.8), h(12, CLAP, 0.85)] }
  const closed = [...[2, 6, 10].map(s => h(s, CLOSED, 0.7)), ...[1, 5, 9, 13].map(s => h(s, CLOSED, 0.4))]
  const ticking: Pattern = { length: BAR, notes: closed }
  const open: Pattern = { length: BAR, notes: [...closed, h(14, OPEN, 0.7)] }
  // Slides are notes running into the next, which the Acid Line glides through; accents are loud.
  const line: Pattern = {
    length: 2 * BAR,
    notes: [
      n(0, 1, 'C2', 1), n(1, 1, 'C2'), n(2, 2, 'C3'), n(4, 1, 'Bb2'), n(5, 1, 'C2', 1), n(6, 1, 'Eb2'), n(7, 1, 'C2'),
      n(8, 1, 'F2', 1), n(9, 2, 'G2'), n(11, 1, 'C2'), n(12, 1, 'C3', 1), n(13, 1, 'C2'), n(14, 1, 'Eb2'), n(15, 1, 'F2'),
      n(16, 1, 'C2', 1), n(17, 1, 'C2'), n(18, 1, 'Eb3'), n(19, 2, 'C3'), n(21, 1, 'C2', 1), n(22, 1, 'Eb2'), n(23, 1, 'C2'),
      n(24, 1, 'G2', 1), n(25, 3, 'Bb2'), n(28, 1, 'C2'), n(29, 1, 'C3', 1), n(30, 1, 'C2'), n(31, 1, 'Bb1'),
    ],
  }
  const strings: Pattern = { length: 2 * BAR, notes: [...chord(0, 16, ['C4', 'Eb4', 'G4'], 0.5), ...chord(16, 16, ['Bb3', 'D4', 'F4'], 0.5)] }
  const bells: Pattern = { length: 2 * BAR, notes: [n(0, 2, 'C5', 0.8), n(6, 2, 'G5', 0.7), n(12, 4, 'Eb5', 0.75), n(22, 2, 'D5', 0.7), n(28, 4, 'Bb4', 0.75)] }
  const lead: Pattern = {
    length: 4 * BAR,
    notes: [n(0, 6, 'C5', 0.85), n(6, 2, 'Eb5'), n(8, 8, 'G5', 0.85), n(16, 4, 'F5'), n(20, 4, 'Eb5'), n(24, 8, 'C5'), n(32, 6, 'Bb4', 0.85), n(38, 2, 'C5'), n(40, 8, 'Eb5', 0.85), n(48, 16, 'G4', 0.8)],
  }
  const rack: Device[] = [
    device(presets, { name: 'DRUMS', preset: 'Beatbox', volume: 0, pan: 0, sends: { room: -18 }, effects: [fx('Compressor', { threshold: -12, ratio: 4 })] }),
    device(presets, { name: 'ACID', preset: 'Acid Line', volume: -2, pan: 0, sends: { echo: -12 } }),
    device(presets, { name: 'STRINGS', preset: 'Chorale 6', volume: -6, pan: -0.2, sends: { room: -6 }, effects: [fx('Chorus', { frequency: 0.8, delayTime: 3.5, depth: 0.6, wet: 0.4 })] }),
    device(presets, { name: 'BELLS', preset: 'Operator 7', volume: -6, pan: 0.35, sends: { echo: -6, room: -10 } }),
    device(presets, { name: 'LEAD', preset: 'Monarch', volume: -6, pan: 0.15, sends: { echo: -9, room: -12 }, effects: [fx('Phaser', { frequency: 0.3, octaves: 3, baseFrequency: 400, stages: 4, wet: 0.35 })] }),
  ]
  const tracks: Track[] = [
    track('KICK CLAP', 0, { four }),
    track('HATS', 0, { ticking, open }),
    track('ACID', 1, { line }),
    track('STRINGS', 2, { strings }),
    track('BELLS', 3, { bells }),
    track('LEAD', 4, { lead }),
    // The 303's cutoff (the Acid Line's filter envelope base, 20–8000 Hz on the log curve, 120 Hz its
    // own), which Tone only sets, so on every 16th: opened slowly over three bars, dropped back,
    // climbed again to the top through the lead's entry, and closed at the end.
    knobTrack('ACID CUTOFF', { part: 'instrument', device: 1, path: ['filterEnvelope', 'baseFrequency'] }, {
      sweep: lane(8, [sweep(0, 8, [[0, 0.3], [3, 0.8, 'exp'], [4, 0.4], [7, 0.88], [8, 0.3]])]),
    }),
  ]
  const placed = [
    ...clips(tracks, 0, 'four', 0, 8), ...clips(tracks, 1, 'ticking', 0, 2), ...clips(tracks, 1, 'open', 2, 6),
    ...clips(tracks, 2, 'line', 0, 8), ...clips(tracks, 3, 'strings', 0, 8), ...clips(tracks, 4, 'bells', 2, 2), ...clips(tracks, 4, 'bells', 6, 2),
    ...clips(tracks, 5, 'lead', 4, 4),
    { track: 6, pattern: 'sweep', start: 0 },
  ]
  return { ...song(126), rack, tracks, clips: placed }
}

export function glassChoir(presets: Preset[]): Project {
  colours = 0
  // Am9, Fmaj7, C, G: two bars each.
  const pads: Pattern = {
    length: 8 * BAR,
    notes: [...chord(0, 32, ['A3', 'C4', 'E4', 'G4', 'B4']), ...chord(32, 32, ['F3', 'A3', 'C4', 'E4']), ...chord(64, 32, ['G3', 'C4', 'E4', 'G4']), ...chord(96, 32, ['G3', 'B3', 'D4', 'G4'])],
  }
  const bells: Pattern = {
    length: 4 * BAR,
    notes: [n(0, 4, 'E5', 0.8), n(4, 4, 'G5', 0.7), n(8, 8, 'A5', 0.8), n(20, 4, 'G5', 0.7), n(24, 8, 'E5', 0.75), n(32, 4, 'D5', 0.8), n(36, 4, 'C5', 0.7), n(40, 8, 'D5', 0.8), n(52, 4, 'E5', 0.7), n(56, 8, 'G5', 0.8)],
  }
  const bass: Pattern = {
    length: 8 * BAR,
    notes: [n(0, 12, 'A1', 0.85), n(12, 4, 'E2'), n(16, 14, 'A1', 0.85), n(30, 2, 'C2'), n(32, 12, 'F1', 0.85), n(44, 4, 'C2'), n(48, 16, 'F1', 0.85), n(64, 12, 'C2', 0.85), n(76, 4, 'G2'), n(80, 16, 'C2', 0.85), n(96, 12, 'G1', 0.85), n(108, 4, 'D2'), n(112, 16, 'G1', 0.85)],
  }
  const beat: Pattern = {
    length: BAR,
    notes: [h(0, KICK, 0.8), h(10, KICK, 0.7), h(8, SNARE, 0.7), ...[0, 2, 4, 6, 8, 10, 12, 14].map(s => h(s, CLOSED, s % 4 ? 0.4 : 0.55))],
  }
  const pluck: Pattern = { length: 2 * BAR, notes: [n(0, 2, 'A3', 0.7), n(4, 2, 'E4', 0.6), n(8, 2, 'C4', 0.8), n(12, 2, 'E4', 0.6), n(16, 2, 'F3', 0.7), n(20, 2, 'C4', 0.6), n(24, 2, 'A3', 0.8), n(28, 2, 'G3', 0.6)] }
  // A line over the chords, one note at a time, on its own track into the pads' Chorale 6.
  const high: Pattern = {
    length: 8 * BAR,
    notes: [n(16, 16, 'E5', 0.45), n(48, 16, 'C5', 0.45), n(80, 16, 'G5', 0.45), n(112, 16, 'D5', 0.45)],
  }
  const rack: Device[] = [
    device(presets, { name: 'PADS', preset: 'Chorale 6', volume: -4, pan: 0, sends: { room: -4 }, effects: [fx('Chorus', { frequency: 0.6, delayTime: 4, depth: 0.4, wet: 0.3 })] }),
    device(presets, { name: 'BELLS', preset: 'Operator 7', volume: -8, pan: 0.3, sends: { echo: -4, room: -6 } }),
    device(presets, { name: 'BASS', preset: 'Monarch', volume: -4, pan: 0, sends: { room: -20 }, effects: [fx('Compressor', { threshold: -20, ratio: 3 })] }),
    device(presets, { name: 'DRUMS', preset: 'Soft Kit', volume: -4, pan: 0, sends: { room: -12 }, effects: [fx('BitCrusher', { bits: 12, wet: 0.2 })] }),
    device(presets, { name: 'PLUCK', preset: 'Pluck', volume: -8, pan: -0.15, sends: { echo: -10 }, effects: [fx('Tremolo', { frequency: 3, depth: 0.3, wet: 1 })] }),
  ]
  const tracks: Track[] = [
    track('PADS', 0, { pads }),
    track('HIGH', 0, { high }),
    track('BELLS', 1, { bells }),
    track('BASS', 2, { bass }),
    track('DRUMS', 3, { beat }),
    track('PLUCK', 4, { pluck }),
  ]
  const placed = [
    ...clips(tracks, 0, 'pads', 0, 8), ...clips(tracks, 1, 'high', 0, 8), ...clips(tracks, 2, 'bells', 0, 4), ...clips(tracks, 2, 'bells', 4, 4),
    ...clips(tracks, 3, 'bass', 0, 8), ...clips(tracks, 4, 'beat', 1, 7), ...clips(tracks, 5, 'pluck', 2, 6),
  ]
  return { ...song(92), rack, tracks, clips: placed }
}

// Jungle --------------------------------------------------------------------------------------------
//
// F minor at 170. Its form is a loop around a race: an intro that hints at the themes, a drop into a
// song that loops while the race runs, and an unwind back to the intro's state.
//   intro      0–16   high-passed pads, sparse hats, swells, the lead's first notes; a snare build
//                      into the drop
//   verse      16–32  the break, the sub, the pads in 3 3 3 3 2 2, a few lead calls
//   chorus     32–48  the lead's theme, the reese under the sub, a ride
//   breakdown  48–56  no break: warm open pads, the sub every other bar, pings in the room
//   variation  56–64  another chop of the break, the theme in thirds
//   unwind     64–72  the break thins and the high-passed pads come back, into the intro's first chord
// The loop is the verse to the variation's end, 16–64.
//
// The chords: every chord keeps two notes at least of the one before it, the change from the
// variation's last back to the verse's first, from the unwind's last back to the intro's first,
// included. Every eight bars change chords 4 2 2 or 2 2 4. The pads play each bar's chord in groups
// of 3 3 3 3 2 2 sixteenths. The bass is dotted halves low on the one, an octave up on the last
// eighth of every second bar, and the pings (a few notes each time, an octave apart) ring out in the
// room. The lead runs through a dotted-eighth delay and never starts on a one: every phrase starts
// on beat 3, and no note of it is struck on a one; it carries across one held.
const VOICING: Record<string, string[]> = {
  Fm9: ['F3', 'Ab3', 'C4', 'Eb4', 'G4'],
  Dbmaj7: ['Db3', 'F3', 'Ab3', 'C4', 'F4'],
  Bbm9: ['Db3', 'F3', 'Ab3', 'Bb3', 'C4'],
  C7sus4: ['C3', 'F3', 'Bb3', 'C4', 'G4'],
  Dbmaj9: ['Db3', 'F3', 'Ab3', 'C4', 'Eb4'],
  Abmaj9: ['Eb3', 'Ab3', 'C4', 'G4', 'Bb4'],
  Eb7sus4: ['Eb3', 'Ab3', 'Bb3', 'Db4', 'Eb4'],
}
const ROOT: Record<string, string> = { Fm9: 'F1', Dbmaj7: 'Db2', Bbm9: 'Bb1', C7sus4: 'C2', Dbmaj9: 'Db2', Abmaj9: 'Ab1', Eb7sus4: 'Eb2' }
// A run of chords: each chord's name and its bars.
type Run = [chord: string, bars: number][]
const ROUND: Run = [['Fm9', 4], ['Dbmaj7', 2], ['Bbm9', 2], ['Fm9', 4], ['Dbmaj7', 2], ['C7sus4', 2]]
const FORM: { name: string; bar: number; run: Run }[] = [
  { name: 'intro', bar: 0, run: ROUND },
  { name: 'verse', bar: 16, run: ROUND },
  { name: 'chorus', bar: 32, run: [['Dbmaj9', 2], ['Abmaj9', 2], ['Fm9', 4], ['Dbmaj9', 2], ['Eb7sus4', 2], ['Fm9', 4]] },
  { name: 'breakdown', bar: 48, run: [['Bbm9', 4], ['Dbmaj7', 2], ['C7sus4', 2]] },
  { name: 'variation', bar: 56, run: [['Dbmaj9', 2], ['Bbm9', 2], ['C7sus4', 4]] },
  { name: 'unwind', bar: 64, run: [['Fm9', 4], ['Dbmaj7', 2], ['C7sus4', 2]] },
]
const JUNGLE_LOOP = { start: 16, end: 64 }
// The pads' groups of sixteenths in a bar.
const PAD_GROUPS = [3, 3, 3, 3, 2, 2]

const run = (name: string) => FORM.find(s => s.name === name)!.run
const barsOf = (r: Run) => r.reduce((all, [, bars]) => all + bars, 0)
const range = (n: number) => Array.from({ length: n }, (_, i) => i)
// `note` moved by `by` semitones.
const moved = (note: string, by: number) => noteOf(row(n(0, 1, note)) + by)
// A pattern `bars` long.
const bars = (count: number, notes: Note[]): Pattern => ({ length: count * BAR, notes })

// Each chord of a run, with the sixteenth it starts on and its bars.
function over(r: Run, each: (chord: string, at: number, bars: number) => Note[]): Note[] {
  let at = 0
  const out: Note[] = []
  for (const [chord, count] of r) {
    out.push(...each(chord, at, count))
    at += count * 16
  }
  return out
}
// Every chord held for its bars.
const held = (r: Run, velocity: number) => over(r, (c, at, count) => chord(at, count * 16, VOICING[c]!, velocity))
// Every bar of every chord struck in the pads' groups, the first of each bar the loudest.
const struck = (r: Run, velocity: number) => over(r, (c, at, count) => range(count).flatMap(b => {
  let s = 0
  return PAD_GROUPS.flatMap((g, i) => {
    const notes = chord(at + b * 16 + s, g, VOICING[c]!, i === 0 ? velocity : velocity * 0.78)
    s += g
    return notes
  })
}))
// The bass: each bar a dotted half on the one, and every second bar the octave on its last eighth;
// `by` semitones over the root.
const walking = (r: Run, velocity: number, by = 0) => over(r, (c, at, count) => range(count).flatMap(b => [
  n(at + b * 16, 12, moved(ROOT[c]!, by), velocity),
  ...(b % 2 ? [n(at + b * 16 + 14, 2, moved(ROOT[c]!, by + 12), velocity * 0.7)] : []),
]))

// F minor's notes, as pitch classes.
const F_MINOR = [5, 7, 8, 10, 0, 1, 3]
// The note `steps` notes of F minor below `note`, which is one of them.
function below(note: string, steps: number): string {
  let m = row(n(0, 1, note))
  if (!F_MINOR.includes(m % 12)) throw new Error(`${note} is not in F minor`)
  for (let k = steps; k > 0;) if (F_MINOR.includes(--m % 12)) k--
  return noteOf(m)
}

// A note at bar `bar`, sixteenth `s` of it, `len` sixteenths long.
type At = [bar: number, s: number, len: number, note: string, velocity: number]
const at = ([bar, s, len, note, velocity]: At) => n(bar * 16 + s, len, note, velocity)
// The theme: four bars from beat 3 of `b`, ending on `last`.
const theme = (b: number, last: string): At[] => [
  [b, 8, 2, 'Ab4', 0.8], [b, 10, 2, 'C5', 0.8], [b, 12, 3, 'Eb5', 0.85], [b, 15, 9, 'F5', 0.9],
  [b + 1, 8, 2, 'Eb5', 0.8], [b + 1, 10, 2, 'C5', 0.8], [b + 1, 12, 6, 'Ab4', 0.85],
  [b + 2, 2, 2, 'Bb4', 0.75], [b + 2, 4, 4, 'C5', 0.8], [b + 2, 8, 2, 'Eb5', 0.8], [b + 2, 10, 2, 'C5', 0.8], [b + 2, 12, 6, 'Bb4', 0.8],
  [b + 3, 2, 2, 'Ab4', 0.75], [b + 3, 4, 12, last, 0.85],
]
// The variation's lines, with the thirds under them.
const variation: At[] = [
  ...theme(55, 'C5'),
  [59, 8, 2, 'F5', 0.8], [59, 10, 2, 'G5', 0.8], [59, 12, 3, 'Bb5', 0.85], [59, 15, 9, 'C6', 0.9],
  [60, 8, 2, 'Bb5', 0.8], [60, 10, 2, 'G5', 0.8], [60, 12, 8, 'F5', 0.85],
  [61, 4, 4, 'G5', 0.8], [61, 8, 2, 'F5', 0.8], [61, 10, 14, 'G5', 0.85],
  [62, 8, 2, 'F5', 0.75], [62, 10, 2, 'C5', 0.75], [62, 12, 20, 'G5', 0.8],
]
const LEAD: At[] = [
  // intro: the verse's call, then the theme's head across the drop
  [3, 8, 2, 'C5', 0.55], [3, 10, 6, 'Eb5', 0.6],
  [7, 8, 8, 'Db5', 0.55],
  [11, 8, 2, 'C5', 0.6], [11, 10, 2, 'Eb5', 0.6], [11, 12, 8, 'F5', 0.65],
  [15, 8, 2, 'Ab4', 0.65], [15, 10, 2, 'C5', 0.65], [15, 12, 3, 'Eb5', 0.7], [15, 15, 9, 'F5', 0.75],
  // verse: calls
  [19, 8, 2, 'C5', 0.7], [19, 10, 2, 'Eb5', 0.7], [19, 12, 8, 'F5', 0.75],
  [23, 8, 2, 'Db5', 0.7], [23, 10, 2, 'C5', 0.7], [23, 12, 8, 'Ab4', 0.75],
  [27, 8, 2, 'C5', 0.7], [27, 10, 2, 'Eb5', 0.7], [27, 12, 3, 'F5', 0.75], [27, 15, 9, 'Ab5', 0.8],
  // chorus: the theme, its answer, the theme again, and its end
  ...theme(31, 'C5'),
  [35, 8, 2, 'Eb5', 0.8], [35, 10, 2, 'F5', 0.8], [35, 12, 3, 'G5', 0.85], [35, 15, 9, 'Ab5', 0.9],
  [36, 8, 2, 'G5', 0.8], [36, 10, 2, 'F5', 0.8], [36, 12, 8, 'Eb5', 0.85],
  [37, 4, 4, 'C5', 0.8], [37, 8, 2, 'Eb5', 0.8], [37, 10, 10, 'F5', 0.85],
  [38, 4, 2, 'Eb5', 0.7], [38, 6, 10, 'C5', 0.75],
  ...theme(39, 'Bb4'),
  [43, 8, 2, 'Db5', 0.8], [43, 10, 2, 'Eb5', 0.8], [43, 12, 3, 'F5', 0.85], [43, 15, 9, 'Ab5', 0.9],
  [44, 8, 4, 'G5', 0.85], [44, 12, 8, 'F5', 0.85],
  [45, 4, 4, 'Eb5', 0.8], [45, 8, 4, 'C5', 0.8], [45, 12, 12, 'Eb5', 0.8],
  [46, 8, 2, 'F5', 0.75], [46, 10, 22, 'C5', 0.8],
  // breakdown: one long note in the delay
  [51, 8, 16, 'Ab5', 0.6],
  // variation, from the breakdown's last bar
  ...variation,
  // unwind: the intro's first call
  [67, 8, 2, 'C5', 0.55], [67, 10, 10, 'Eb5', 0.6],
]
const THIRDS: At[] = variation.map(([bar, s, len, note, velocity]) => [bar, s, len, below(note, 2), velocity * 0.55])
// The pings: a note or two, an octave apart, by bar and sixteenth.
const PINGS: [bar: number, s: number, note: string, velocity: number][] = [
  [12, 10, 'F3', 0.5],
  [23, 6, 'Bb2', 0.6], [23, 7, 'Bb3', 0.5], [23, 10, 'Bb2', 0.45],
  [31, 6, 'C3', 0.6], [31, 7, 'C4', 0.5], [31, 11, 'C3', 0.45],
  [39, 6, 'F2', 0.6], [39, 7, 'F3', 0.5],
  [47, 10, 'F3', 0.55], [47, 11, 'F2', 0.45],
  [49, 10, 'Bb3', 0.5],
  [53, 10, 'Db3', 0.55], [53, 11, 'Db4', 0.45],
  [59, 6, 'Bb2', 0.6], [59, 7, 'Bb3', 0.5],
  [63, 10, 'C3', 0.55], [63, 11, 'C4', 0.45],
  [65, 10, 'F3', 0.5],
]
// The swells: a chord's top three notes, rising over its bars, by bar.
const SWELLS: [bar: number, chord: string, bars: number][] = [
  [6, 'Bbm9', 2], [14, 'C7sus4', 2], [30, 'C7sus4', 2], [44, 'Fm9', 4], [52, 'Dbmaj7', 2], [54, 'C7sus4', 2], [60, 'C7sus4', 4], [70, 'C7sus4', 2],
]

// The kit's pads beyond the four the other songs play.
export const BODY = 'E1', TICK = 'G#1', RIDE = 'C#2'
// A snare: the noise and the body under it, struck together.
export const snare = (s: number, velocity: number) => [h(s, SNARE, velocity), h(s, BODY, velocity)]
// A roll of `count` snares a sixteenth apart from `s`, rising from `lo` to `hi`.
export const roll = (s: number, count: number, lo: number, hi: number, every = 1) =>
  range(count).flatMap(i => snare(s + i * every, lo + ((hi - lo) * i) / (count - 1)))
// Two bars of hats: the closed on every eighth, its offbeats louder, a tick before every second beat.
const hats = range(16).flatMap(i => [h(i * 2, CLOSED, i % 2 ? 0.5 : 0.32), ...(i % 4 === 1 ? [h(i * 2 + 1, TICK, 0.2)] : [])])
const ride = range(8).map(i => h(i * 4, RIDE, 0.28))
// The break, two bars of it: kicks on 1 and its "and", snares on 2 and 4, ghosts between.
const amen = [
  h(0, KICK, 0.95), h(2, KICK, 0.7), ...snare(4, 0.9), ...snare(7, 0.3), ...snare(9, 0.38), h(10, KICK, 0.85), ...snare(12, 0.9), ...snare(15, 0.3),
  h(16, KICK, 0.9), ...snare(20, 0.9), ...snare(22, 0.3), ...snare(25, 0.36), h(26, KICK, 0.8), h(27, KICK, 0.5), ...snare(28, 0.9), ...snare(30, 0.34), ...snare(31, 0.42),
]
// Another chop of it, for the variation.
const chop = [
  h(0, KICK, 0.95), ...snare(4, 0.9), ...snare(6, 0.3), h(8, KICK, 0.7), h(10, KICK, 0.85), ...snare(12, 0.9), ...snare(14, 0.32), ...snare(15, 0.6),
  h(16, KICK, 0.9), ...snare(18, 0.3), ...snare(20, 0.9), h(23, KICK, 0.7), h(26, KICK, 0.85), ...snare(28, 0.9), ...snare(29, 0.3), ...snare(30, 0.7), ...snare(31, 0.4),
]
const first = (notes: Note[]) => notes.filter(x => x.time < 16 * S)
// The break's first bar, then a bar ending in a roll.
const filled = (notes: Note[], extra: Note[] = []) => [
  ...first(notes), ...first(extra), h(16, KICK, 0.9), ...snare(20, 0.9), h(22, KICK, 0.7), ...roll(24, 8, 0.35, 0.95),
  ...hats.filter(x => x.time < 24 * S),
]

function jungle(presets: Preset[]): Project {
  colours = 0
  const extra = [h(11, KICK, 0.55), ...snare(3, 0.26), ...snare(13, 0.28), h(30, OPEN, 0.45), ...ride]
  const breaks: Record<string, Pattern> = {
    amen: bars(2, [...amen, ...hats]),
    fill: bars(2, filled(amen)),
    busy: bars(2, [...amen, ...hats, ...extra]),
    busyFill: bars(2, filled(amen, extra)),
    chop: bars(2, [...chop, ...hats, ...ride]),
    // the break without its kicks, as the unwind thins
    bare: bars(2, [...amen.filter(x => x.note !== KICK), ...hats]),
  }
  const hatsAlone: Record<string, Pattern> = {
    air: bars(2, [h(6, CLOSED, 0.28), h(14, CLOSED, 0.34), h(22, TICK, 0.22), h(30, OPEN, 0.3)]),
    ticking: bars(2, range(8).flatMap(i => [h(i * 4 + 2, CLOSED, 0.36), h(i * 4 + 3, TICK, 0.16)])),
    // eighths, then sixteenths, rising into what follows
    build: bars(2, [...roll(0, 8, 0.14, 0.42, 2), ...roll(16, 16, 0.42, 0.95)]),
  }
  const total = barsOf(FORM.at(-1)!.run) + FORM.at(-1)!.bar
  const rack: Device[] = [
    device(presets, { name: 'DRUMS', preset: 'Jungle Kit', volume: 0, pan: 0, sends: { room: -20 }, effects: [fx('Compressor', { threshold: -14, ratio: 4, attack: 0.003, release: 0.12 })] }),
    device(presets, { name: 'SUB', preset: 'Sub', volume: -2, pan: 0 }),
    device(presets, { name: 'REESE', preset: 'Reese', volume: -6, pan: 0, effects: [fx('Phaser', { frequency: 0.15, octaves: 2, baseFrequency: 300, stages: 4, wet: 0.4 })] }),
    device(presets, { name: 'STABS', preset: 'Stab Pad', volume: -4, pan: 0, sends: { room: -8, echo: -16 }, effects: [fx('Chorus', { frequency: 0.5, delayTime: 3.5, depth: 0.5, wet: 0.35 })] }),
    device(presets, { name: 'AIR', preset: 'Air Pad', volume: -6, pan: 0, sends: { room: -4 }, effects: [fx('Filter', { type: 'highpass', frequency: 750, rolloff: -24, Q: 0.7 }), fx('Chorus', { frequency: 0.3, delayTime: 4, depth: 0.6, wet: 0.4 })] }),
    device(presets, { name: 'WARM', preset: 'Air Pad', volume: -5, pan: 0, sends: { room: -4 }, effects: [fx('Filter', { type: 'lowpass', frequency: 3200, rolloff: -12, Q: 0.7 })] }),
    device(presets, { name: 'SWELL', preset: 'Swell', volume: -6, pan: 0, sends: { room: -6 } }),
    device(presets, { name: 'PING', preset: 'Ping', volume: -8, pan: -0.2, sends: { room: 0, echo: -8 } }),
    device(presets, { name: 'LEAD', preset: 'Square Lead', volume: -6, pan: 0.1, sends: { room: -10 }, effects: [fx('Vibrato', { frequency: 5.5, depth: 0.06, wet: 1 }), fx('FeedbackDelay', { delayTime: '8n.', feedback: 0.4, wet: 0.3 })] }),
  ]
  const tracks: Track[] = [
    track('BREAKS', 0, breaks),
    track('HATS', 0, hatsAlone),
    track('SUB', 1, {
      verse: bars(16, walking(run('verse'), 0.85)),
      chorus: bars(16, walking(run('chorus'), 0.85)),
      breakdown: bars(8, over(run('breakdown'), (c, s, count) => range(count / 2).map(b => n(s + b * 32, 12, ROOT[c]!, 0.8)))),
      variation: bars(8, walking(run('variation'), 0.85)),
      unwind: bars(4, [...walking([['Fm9', 2]], 0.8), n(32, 12, 'F1', 0.7)]),
    }),
    track('REESE', 2, {
      chorus: bars(16, walking(run('chorus'), 0.7, 12)),
      variation: bars(8, walking(run('variation'), 0.7, 12)),
    }),
    track('STABS', 3, {
      verse: bars(16, struck(run('verse'), 0.55)),
      chorus: bars(16, struck(run('chorus'), 0.62)),
      variation: bars(8, struck(run('variation'), 0.62)),
      unwind: bars(2, struck([['Fm9', 2]], 0.5)),
    }),
    track('AIR', 4, {
      intro: bars(16, held(run('intro'), 0.5)),
      chorus: bars(16, held(run('chorus'), 0.32)),
      unwind: bars(8, held(run('unwind'), 0.45)),
    }),
    track('WARM', 5, { breakdown: bars(8, held(run('breakdown'), 0.6)) }),
    track('SWELL', 6, { swells: bars(total, SWELLS.flatMap(([bar, c, count]) => chord(bar * 16, count * 16, VOICING[c]!.slice(2), 0.55))) }),
    track('PING', 7, { pings: bars(total, PINGS.map(([bar, s, note, velocity]) => n(bar * 16 + s, 2, note, velocity))) }),
    track('LEAD', 8, { lead: bars(total, [...LEAD, ...THIRDS].map(at)) }),
    // AIR's high-pass (its Filter, CUTOFF 20 Hz–20 kHz on the log curve, 750 Hz its own): held up
    // through the intro, stepped down at bar 9, falling into the drop; risen again through the unwind.
    knobTrack('AIR CUTOFF', { part: 'effect', chain: { device: 4 }, effect: rack[4]!.effects.findIndex(e => e.is === 'Filter'), path: ['frequency'] }, {
      intro: lane(16, [sweep(0, 16, [[0, 0.62], [8, 0.55, 'step'], [12, 0.4], [16, 0.12, 'exp']])]),
      unwind: lane(8, [sweep(2, 6, [[0, 0.12], [6, 0.62, 'exp']])]),
    }),
    // The Reese's own cutoff (its filter envelope's base, 20–8000 Hz on the log curve, 130 Hz its
    // own), which Tone only sets: opened through the chorus, and a wobble through the variation.
    knobTrack('REESE CUTOFF', { part: 'instrument', device: 2, path: ['filterEnvelope', 'baseFrequency'] }, {
      chorus: lane(16, [sweep(0, 4, [[0, 0.31], [4, 0.6]]), sweep(8, 4, [[0, 0.35], [4, 0.8, 'exp']]), sweep(14, 2, [[0, 0.5], [1, 0.9, 'step'], [2, 0.9]])]),
      wobble: lane(8, [0, 2, 4, 6].map(b => sweep(b, 1.5, [[0, 0.3], [1, 0.82], [1.5, 0.3]]))),
    }),
    // The drums' send to the room (−60 to +6 dB, −20 its own): thrown into the breakdown, held there,
    // thrown again into the unwind.
    knobTrack('ROOM THROW', { part: 'send', device: 0, bus: 'room' }, {
      throw: lane(2, [sweep(0, 2, [[0, 0.6], [2, 1, 'exp']])]),
      held: lane(8, [sweep(0, 8, [[0, 0.85], [8, 0.85]])]),
    }),
  ]
  const placed: Clip[] = [
    // the break
    ...clips(tracks, 0, 'amen', 16, 6), ...clips(tracks, 0, 'fill', 22, 2), ...clips(tracks, 0, 'amen', 24, 6), ...clips(tracks, 0, 'fill', 30, 2),
    ...clips(tracks, 0, 'busy', 32, 6), ...clips(tracks, 0, 'busyFill', 38, 2), ...clips(tracks, 0, 'busy', 40, 6), ...clips(tracks, 0, 'busyFill', 46, 2),
    ...clips(tracks, 0, 'chop', 56, 2), ...clips(tracks, 0, 'busy', 58, 2), ...clips(tracks, 0, 'chop', 60, 2), ...clips(tracks, 0, 'busyFill', 62, 2),
    ...clips(tracks, 0, 'amen', 64, 2), ...clips(tracks, 0, 'bare', 66, 2),
    // the hats alone: the intro, the breakdown, the unwind's end
    ...clips(tracks, 1, 'air', 4, 4), ...clips(tracks, 1, 'ticking', 8, 6), ...clips(tracks, 1, 'build', 14, 2),
    ...clips(tracks, 1, 'air', 48, 4), ...clips(tracks, 1, 'ticking', 52, 2), ...clips(tracks, 1, 'build', 54, 2),
    ...clips(tracks, 1, 'air', 68, 4),
    // the bass
    { track: 2, pattern: 'verse', start: 16 * BAR }, { track: 2, pattern: 'chorus', start: 32 * BAR }, { track: 2, pattern: 'breakdown', start: 48 * BAR },
    { track: 2, pattern: 'variation', start: 56 * BAR }, { track: 2, pattern: 'unwind', start: 64 * BAR },
    { track: 3, pattern: 'chorus', start: 32 * BAR }, { track: 3, pattern: 'variation', start: 56 * BAR },
    // the pads
    { track: 4, pattern: 'verse', start: 16 * BAR }, { track: 4, pattern: 'chorus', start: 32 * BAR }, { track: 4, pattern: 'variation', start: 56 * BAR }, { track: 4, pattern: 'unwind', start: 64 * BAR },
    { track: 5, pattern: 'intro', start: 0 }, { track: 5, pattern: 'chorus', start: 32 * BAR }, { track: 5, pattern: 'unwind', start: 64 * BAR },
    { track: 6, pattern: 'breakdown', start: 48 * BAR },
    { track: 7, pattern: 'swells', start: 0 },
    // the pings and the lead, one clip each across the song
    { track: 8, pattern: 'pings', start: 0 },
    { track: 9, pattern: 'lead', start: 0 },
    // the automation: AIR's cutoff, the Reese's cutoff, the room throws
    { track: 10, pattern: 'intro', start: 0 }, { track: 10, pattern: 'unwind', start: 64 * BAR },
    { track: 11, pattern: 'chorus', start: 32 * BAR }, { track: 11, pattern: 'wobble', start: 56 * BAR },
    { track: 12, pattern: 'throw', start: 46 * BAR }, { track: 12, pattern: 'held', start: 48 * BAR }, { track: 12, pattern: 'throw', start: 62 * BAR },
  ]
  return {
    bpm: 170, timeSignature: 4, swing: 0, swingSubdivision: '8n', ppq: PPQ,
    loop: { start: JUNGLE_LOOP.start * BAR, end: JUNGLE_LOOP.end * BAR },
    buses: {
      echo: { volume: -6, pan: 0, effects: [fx('FeedbackDelay', { delayTime: '8n.', feedback: 0.38, wet: 1 })] },
      room: { volume: -6, pan: 0, effects: [fx('Reverb', { decay: 3, preDelay: 0.01, wet: 1 })] },
    },
    master: { volume: -3, effects: [fx('Compressor', { threshold: -16, ratio: 3, attack: 0.01, release: 0.2 }), fx('Limiter', { threshold: -1 })] },
    rack, tracks, clips: placed,
  }
}

export const songs = [
  { name: 'ACID TRACK', make: acidTrack },
  { name: 'GLASS CHOIR', make: glassChoir },
  { name: 'JUNGLE', make: jungle },
]
