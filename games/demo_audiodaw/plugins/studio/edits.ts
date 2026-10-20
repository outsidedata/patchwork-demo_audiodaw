// The studio's edits of notes and clips, pure: each takes a pattern or a project and the picked
// notes or clips, and hands back the new pattern or project and what is picked after it, the old
// one unchanged, so the studio keeps it as one step of undo (`studio.plugin.ts`). Nothing here
// draws, plays or reads a key.
//
// The song is audiodaw's, in Tone's own words: a note is `{ time, note, duration, velocity }`, its
// times in ticks at the song's `ppq` (192, so a sixteenth is 48) and its `note` Tone's name of a
// pitch ("C4"); a clip is `{ track, pattern, start, length }` on the song. A track holds notes and
// sends them to the device of the rack it targets.
//
// Rows. A note's row is its MIDI number, `Tone.Frequency(note).toMidi()`, 0 to 127, and a row's
// note is `Tone.Frequency(row, 'midi').toNote()`, so a nudge up a row is a semitone.
//
// Clamping. An edit that moves, pastes or duplicates notes moves them all together and never
// splits them: the group goes as far as it can and stops with its first note at 0 or its last
// note's end at the pattern's length, its lowest row at 0 or its highest at the top. Nothing
// throws for a move that would leave the pattern; it is clamped. Clips are kept from before the
// song's start; the song runs as long as its last clip.
//
// The overlap rule (`overlaps`). A note drawn, moved or resized over another of the same pitch
// shortens the earlier of the two to end where the later starts; of two starting together, the
// other one is taken away.
//
// Grains (`GRAINS`): the steps a click, a drag, a nudge and quantize snap to, in ticks: 1/32, 1/16,
// 1/8, 1/4, 1/2, a bar, 1/16 triplets, 1/8 triplets, and Off, one tick.
import * as Tone from 'tone'
import { addAutomationPattern, addPattern, clipEnd, freeName, fromOf, moveClipsTo, noteTrack, patternOf, setFrom, setLength, type Clip, type Note, type Pattern, type Project } from '#plugins/audiodaw/audiodaw.sim.ts'

// The studio's songs' ticks a beat, Tone's PPQ.
export const PPQ = 192
// A sixteenth, a beat and a bar (in 4/4) in ticks.
export const TICKS = PPQ / 4
export const BEAT = PPQ
export const BAR = PPQ * 4

// The colours a track can be, in the order new tracks take them and a press on a track's swatch
// steps through them.
export const TRACK_COLORS = ['#e2e86a', '#b7a4ff', '#8cc8ff', '#7fe0c0', '#ffb38a', '#f29fc8', '#a6d8a0', '#ffd36a', '#d8dce2', '#ef8f80']

// The colour after `color` among `TRACK_COLORS`, the first after one not among them.
export const nextColor = (color: string) => TRACK_COLORS[(TRACK_COLORS.indexOf(color) + 1) % TRACK_COLORS.length]!

export type Grain = { name: string; ticks: number }
export const GRAINS: readonly Grain[] = [
  { name: '1/32', ticks: TICKS / 2 },
  { name: '1/16', ticks: TICKS },
  { name: '1/8', ticks: TICKS * 2 },
  { name: '1/4', ticks: TICKS * 4 },
  { name: '1/2', ticks: TICKS * 8 },
  { name: 'BAR', ticks: TICKS * 16 },
  { name: '1/16T', ticks: (TICKS * 2) / 3 },
  { name: '1/8T', ticks: (TICKS * 4) / 3 },
  { name: 'OFF', ticks: 1 },
]

export const TOP = 127
// A note's row, its MIDI number, and the note of a row.
export const row = (n: Note): number => Tone.Frequency(n.note).toMidi()
export const noteOf = (r: number): string => Tone.Frequency(r, 'midi').toNote()
export const atRow = (n: Note, r: number): Note => ({ ...n, note: noteOf(r) })
export const end = (n: Note) => n.time + n.duration

// `t` down to the grain, and to the nearest grain.
export const floorTo = (t: number, g: number) => Math.floor(t / g) * g
export const roundTo = (t: number, g: number) => Math.round(t / g) * g

// Where the song ends: the end of its last clip.
export function songEnd(p: Project): number {
  return p.clips.reduce((most, c) => Math.max(most, clipEnd(p, c)), 0)
}

// The loop dragged between ticks `a` and `b` of a song `length` long, either way round: from the
// earlier down to the grain `g` to the later up to it, kept inside the song and never shorter than
// one grain.
export function loopBetween(a: number, b: number, g: number, length: number): { start: number; end: number } {
  const most = Math.max(g, floorTo(length, g))
  const start = Math.max(0, Math.min(most - g, floorTo(Math.min(a, b), g)))
  const stop = Math.min(most, Math.max(start + g, Math.ceil(Math.max(a, b) / g) * g))
  return { start: Math.round(start), end: Math.round(stop) }
}

// Bar.beat.step of a tick, each counted from 1.
export function where(t: number): string {
  return `${Math.floor(t / BAR) + 1}.${Math.floor((t % BAR) / BEAT) + 1}.${Math.floor((t % BEAT) / TICKS) + 1}`
}

// The notes and what is picked after an edit.
export type Edited = { pattern: Pattern; picked: number[] }

const span = (notes: Note[]) => ({ from: Math.min(...notes.map(n => n.time)), to: Math.max(...notes.map(end)) })

// How far a group can go: `dt` ticks and `dr` rows, clamped so every note stays inside the
// pattern and its rows.
export function clampShift(pattern: Pattern, picked: number[], dt: number, dr: number): [number, number] {
  const notes = picked.map(i => pattern.notes[i]!)
  if (!notes.length) return [0, 0]
  const { from, to } = span(notes)
  const t = Math.min(pattern.length - to, Math.max(-from, dt))
  const rows = notes.map(row)
  const r = Math.min(TOP - Math.max(...rows), Math.max(-Math.min(...rows), dr))
  return [t, r]
}

// The picked notes moved together by `dt` ticks and `dr` rows, clamped.
export function shift(pattern: Pattern, picked: number[], dt: number, dr: number): Edited {
  const [t, r] = clampShift(pattern, picked, dt, dr)
  // Clamped to nothing, the pattern is the same one, so no step of undo is made of it.
  if (!t && !r) return { pattern, picked }
  const set = new Set(picked)
  const notes = pattern.notes.map((n, i) => (set.has(i) ? atRow({ ...n, time: n.time + t }, row(n) + r) : n))
  return { pattern: { ...pattern, notes }, picked }
}

// The picked notes taken away.
export function remove(pattern: Pattern, picked: number[]): Edited {
  const set = new Set(picked)
  return { pattern: { ...pattern, notes: pattern.notes.filter((_, i) => !set.has(i)) }, picked: [] }
}

// The notes of `edited` held against the rest by the overlap rule; `edited` are indices into
// `pattern.notes`, and the indices handed back are theirs after it.
export function overlaps(pattern: Pattern, edited: number[]): Edited {
  const notes: (Note | undefined)[] = pattern.notes.map(n => ({ ...n }))
  const mine = new Set(edited)
  for (const e of edited) {
    for (let o = 0; o < notes.length; o++) {
      const a = notes[e], b = notes[o]
      if (!a || !b || o === e || row(a) !== row(b)) continue
      if (a.time === b.time) {
        // Two starting together: the one not just edited goes; of two edited, the later listed.
        if (!mine.has(o) || o > e) notes[o] = undefined
        continue
      }
      const [early, late] = a.time < b.time ? [a, b] : [b, a]
      if (end(early) > late.time) early.duration = late.time - early.time
    }
  }
  const index = new Map<number, number>()
  const kept: Note[] = []
  notes.forEach((n, i) => {
    if (!n) return
    index.set(i, kept.length)
    kept.push(n)
  })
  return { pattern: { ...pattern, notes: kept }, picked: edited.filter(i => index.has(i)).map(i => index.get(i)!) }
}

// What the clipboard holds: notes with their times from the first one's, and the ticks they span;
// or clips, each with its track's place among the copied tracks and its start from the first's.
export type Copied =
  | { kind: 'notes'; notes: Note[]; span: number }
  | { kind: 'clips'; clips: { track: number; source: number; pattern: string; start: number }[]; span: number; first: number }

export function copyNotes(pattern: Pattern, picked: number[]): Copied | undefined {
  const notes = picked.map(i => pattern.notes[i]!)
  if (!notes.length) return undefined
  const { from, to } = span(notes)
  return { kind: 'notes', notes: notes.map(n => ({ ...n, time: n.time - from })), span: to - from }
}

// `copied` placed with its first note at `at`, clamped so it lies inside the pattern: moved back
// from the end when it would run past it, and, longer than the pattern, cut at its end.
export function paste(pattern: Pattern, copied: Extract<Copied, { kind: 'notes' }>, at: number): Edited {
  const base = Math.max(0, Math.min(pattern.length - copied.span, at))
  const placed = copied.notes
    .map(n => ({ ...n, time: n.time + base }))
    .filter(n => n.time < pattern.length)
    .map(n => ({ ...n, duration: Math.min(n.duration, pattern.length - n.time) }))
  if (!placed.length) return { pattern, picked: [] }
  const notes = [...pattern.notes, ...placed]
  const picked = placed.map((_, i) => pattern.notes.length + i)
  return overlaps({ ...pattern, notes }, picked)
}

// A copy of the picked notes right after the end of the last of them.
export function duplicate(pattern: Pattern, picked: number[]): Edited {
  const copied = copyNotes(pattern, picked)
  if (!copied || copied.kind !== 'notes') return { pattern, picked }
  const { from } = span(picked.map(i => pattern.notes[i]!))
  return paste(pattern, copied, from + copied.span)
}

// Each picked note's time to the nearest grain, kept inside the pattern.
export function quantize(pattern: Pattern, picked: number[], grain: number): Edited {
  const set = new Set(picked)
  const notes = pattern.notes.map((n, i) => {
    if (!set.has(i)) return n
    return { ...n, time: Math.max(0, Math.min(pattern.length - n.duration, roundTo(n.time, grain))) }
  })
  return overlaps({ ...pattern, notes }, picked)
}

// The picked notes played backwards over the ticks they span: each one ends where it started from
// the span's start, counted from the span's end.
export function reverse(pattern: Pattern, picked: number[]): Edited {
  const notes = picked.map(i => pattern.notes[i]!)
  if (!notes.length) return { pattern, picked }
  const { from, to } = span(notes)
  const set = new Set(picked)
  return { pattern: { ...pattern, notes: pattern.notes.map((n, i) => (set.has(i) ? { ...n, time: from + to - end(n) } : n)) }, picked }
}

// The notes a box touches: from tick `t0` to `t1` and row `r0` to `r1`, either way round, ends
// included.
export function boxed(pattern: Pattern, t0: number, t1: number, r0: number, r1: number): number[] {
  const [a, b] = [Math.min(t0, t1), Math.max(t0, t1)]
  const [lo, hi] = [Math.min(r0, r1), Math.max(r0, r1)]
  const out: number[] = []
  pattern.notes.forEach((n, i) => {
    if (n.time <= b && end(n) >= a && row(n) >= lo && row(n) <= hi) out.push(i)
  })
  return out
}

// ---- Clips ---------------------------------------------------------------------------------------
// A clip is picked by its index in the song's `clips`.

// How far picked clips can go together: none before the song's start.
export function clampClips(p: Project, picked: number[], dt: number): number {
  if (!picked.length) return 0
  return Math.max(-Math.min(...picked.map(i => p.clips[i]!.start)), dt)
}

export function shiftClips(p: Project, picked: number[], dt: number): Project {
  const t = clampClips(p, picked, dt)
  if (!t) return p
  const set = new Set(picked)
  return { ...p, clips: p.clips.map((c, i) => (set.has(i) ? { ...c, start: c.start + t } : c)) }
}

// The picked clips moved together `dt` ticks along the song and `dk` tracks down, clamped so none
// goes before the song's start or off the tracks; a clip moved onto another track carries its
// pattern there (`moveClipsTo`), whatever device that track targets, and one moved onto a track of
// the other kind stays on its own.
export function dragClips(p: Project, picked: number[], dt: number, dk: number): Project {
  if (!picked.length) return p
  const tracks = picked.map(i => p.clips[i]!.track)
  const k = Math.max(-Math.min(...tracks), Math.min(p.tracks.length - 1 - Math.max(...tracks), dk))
  const shifted = shiftClips(p, picked, dt)
  return k ? moveClipsTo(shifted, picked, tracks.map(t => t + k)) : shifted
}

// The picked clips copied where they are, each the same pattern on the same track, the copies
// picked: what an Alt-drag drags.
export function copyInPlace(p: Project, picked: number[]): { project: Project; picked: number[] } {
  const added = picked.map(i => ({ ...p.clips[i]! }))
  return { project: { ...p, clips: [...p.clips, ...added] }, picked: added.map((_, i) => p.clips.length + i) }
}

// A new clip on track `t` at `at`: a new empty pattern a bar long, of the track's kind, under a free
// name, the next letter of the alphabet from `a`, and the clip's index.
export function newClip(p: Project, t: number, at: number): { project: Project; clip: number; pattern: string } {
  const name = nextName(Object.keys(p.tracks[t]!.patterns))
  const added = p.tracks[t]!.kind === 'notes' ? addPattern(p, t, name, { length: BAR, notes: [] }) : addAutomationPattern(p, t, name, { length: BAR, notes: [] })
  return { project: { ...added, clips: [...added.clips, { track: t, pattern: name, start: Math.max(0, at) }] }, clip: added.clips.length, pattern: name }
}

// The first letter of the alphabet not among `names`, else a free name after `z`.
export const nextName = (names: string[]) => [...'abcdefghijklmnopqrstuvwxyz'].find(l => !names.includes(l)) ?? freeName(names, 'z')

export function removeClips(p: Project, picked: number[]): Project {
  const set = new Set(picked)
  return { ...p, clips: p.clips.filter((_, i) => !set.has(i)) }
}

export function copyClips(p: Project, picked: number[]): Copied | undefined {
  if (!picked.length) return undefined
  const clips = picked.map(i => p.clips[i]!)
  const from = Math.min(...clips.map(c => c.start))
  const to = Math.max(...clips.map(c => clipEnd(p, c)))
  const first = Math.min(...clips.map(c => c.track))
  return { kind: 'clips', clips: clips.map(c => ({ track: c.track - first, source: c.track, pattern: c.pattern, start: c.start - from })), span: to - from, first }
}

// Copied clips placed from `at`, on the tracks they came from counted from `track`, each carrying its
// pattern to a track that lacks it (`moveClipsTo`); a clip whose track is not there, is of the other
// kind (notes onto an automation track, or automation onto a note track), or whose pattern is gone
// from the track it was copied from, is left.
export function pasteClips(p: Project, copied: Extract<Copied, { kind: 'clips' }>, at: number, track: number): { project: Project; picked: number[] } {
  const base = Math.max(0, at)
  const added: Clip[] = []
  const dest: number[] = []
  for (const c of copied.clips) {
    const t = track + c.track
    if (!p.tracks[t] || !Object.hasOwn(p.tracks[c.source]?.patterns ?? {}, c.pattern) || p.tracks[t]!.kind !== p.tracks[c.source]!.kind) continue
    added.push({ track: c.source, pattern: c.pattern, start: base + c.start })
    dest.push(t)
  }
  if (!added.length) return { project: p, picked: [] }
  const picked = added.map((_, i) => p.clips.length + i)
  return { project: moveClipsTo({ ...p, clips: [...p.clips, ...added] }, picked, dest), picked }
}

export function duplicateClips(p: Project, picked: number[]): { project: Project; picked: number[] } {
  const copied = copyClips(p, picked)
  if (!copied || copied.kind !== 'clips') return { project: p, picked }
  const from = Math.min(...picked.map(i => p.clips[i]!.start))
  return pasteClips(p, copied, from + copied.span, copied.first)
}

// The clips a box touches, from tick `t0` to `t1` and track `k0` to `k1`.
export function boxedClips(p: Project, t0: number, t1: number, k0: number, k1: number): number[] {
  const [a, b] = [Math.min(t0, t1), Math.max(t0, t1)]
  const [lo, hi] = [Math.min(k0, k1), Math.max(k0, k1)]
  const out: number[] = []
  p.clips.forEach((c, i) => {
    if (c.track >= lo && c.track <= hi && c.start <= b && clipEnd(p, c) >= a) out.push(i)
  })
  return out
}

// A clip resized from either edge to the song's tick `to`, which resizes its pattern, and so every
// clip of it. The right edge sets where the pattern ends (`setLength`), a tick past its start at
// least. The left edge trims or uncovers the pattern's start (`setFrom`): the notes it still plays
// stay where they were in the song, and those before it are kept and not played. Nothing repeats.
export function resizeClip(p: Project, i: number, edge: 'left' | 'right', to: number): Project {
  const c = p.clips[i]!
  const x = patternOf(p, c)
  if (edge === 'right') {
    const length = Math.max(fromOf(x) + 1, fromOf(x) + Math.round(to - c.start))
    return length === x.length ? p : setLength(p, c.track, c.pattern, length)
  }
  return setFrom(p, c.track, c.pattern, fromOf(x) + Math.round(to - c.start))
}

// The pattern of a note track set, the song's other values kept.
export function withPattern(p: Project, track: number, name: string, pattern: Pattern): Project {
  const t = noteTrack(p, track)
  return { ...p, tracks: p.tracks.map((x, i) => (i === track ? { ...t, patterns: { ...t.patterns, [name]: pattern } } : x)) }
}
