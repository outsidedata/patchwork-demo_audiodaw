// The studio: demo_audiodaw's own plugin, loaded through `shipped`, holding everything the screens
// share and nothing they draw. It has no row and reads no rows: the song is a value only this page
// holds, made from `songs.ts` or opened from the songs file (`songs` below), in audiodaw's words
// (Tone's), played through `plugins.audiodaw` and
// drawn by the screens (`roll`, `arrange`, `rack`, `mixer`, `transport`, each a kind of one
// `actors` entry whose `<kind>.client.ts` draws through `plugins.renderdom`). It is listed after
// `audiodaw` and `renderdom`, and after `store`, and its own `tick`:
//   - on the first frame, opens the first song and loads it into audiodaw;
//   - asks renderdom for the keys (`keys`, `keyups`) and puts the chassis's stylesheet on the page;
//   - hands audiodaw the song whenever it changed (`edit`, which hands each changed value to the
//     Tone object that holds it), and the cycle whenever it was turned on or off.
// Tone's timing, its look-ahead and the browser's buffer, starts as the scene's `world.audiodaw`;
// `retime` sets it anew while the page runs (the transport's BUFFER menu), play stopped first.
//
// The song and undo. `project` is the song. Every edit is one step of undo: `edit(f)` makes the new
// song from the old at once; a drag is `begin()`, as many `change(f)` as it moves, and `end()`, one
// step when it changed anything. Undo and redo bring back the song and what was picked with it.
// Opening another song is a step of undo too. A track's mute and solo and its target, a device's
// volume, pan, mute, solo and sends, tracks and devices added and taken away, and the loop are the
// song's, so they are edits like any other.
//
// Tracks and the rack. A track is notes sent to the device of the rack it targets (audiodaw's
// `target`); many tracks may target one device. The arrangement adds a track (`addTrack`, targeting
// the device the picked track does) and takes one away, and each track's header picks its target.
// A track made targets a device already in the rack and adds none. The rack's tabs list every device
// and add one of any instrument from that instrument's first preset (`addDevice`), used by no track
// until one targets it; the mixer has a strip per device and takes one away.
//
// Automation. An automation track sends one knob its values (audiodaw's). The right button on any
// knob that is a Tone option, on the faceplate, the Effects panel or the mixer, automates it
// (`automate`): the track aimed at it, else a new one at the bottom of the list named for the knob,
// picked on the arrangement; a knob some track is aimed at is marked (`mark`). An automation track's
// header lists every knob of the song (`knobs`, read off what Tone holds, the faceplates' ranges and
// hidden options), and a pick retargets it (`retargetKnob`). Its patterns are edited on the roll. Each
// knob's travel is the faceplates' (`rangeOf`), handed to audiodaw when a song loads; `glides` asks
// audiodaw whether a knob sweeps or is set on 16ths, so the screens draw its steps.
//
// Time is Tone's Transport. `cue` is where play starts, in ticks: where it stopped, after a second
// stop the loop's start with the cycle on and the song's start with it off, the song's start after
// Home, or a tick pressed on the arrangement's ruler (`locate`). The playhead is `transport.ticks`
// while playing, the cue while stopped. The song's start is its span's (`spanOf`, 0 until one is
// set), and play stops itself at the span's end; a play cued at or past the end, or before the
// start, starts at the start. With the cycle on, the loop stands in for the span: a play cued
// outside it, or a tick located outside it while playing, goes to its start, since Tone's transport
// wraps only on reaching the loop's end. The span is an edit of the song (`setSpan`)
// and moves no clip.
//
// The view (`view`), what only this page shows:
//   screen       which of roll, arrange or mixer fills the editor's place; every track's pattern
//                is edited on the roll, a drum kit's too (each of its pads is a note).
//   track        the picked track, whose pattern the roll edits and whose target the note
//                keys play; `pattern` the name of that pattern.
//   device       the device of the rack whose faceplate the rack shows: the picked track's target,
//                or a strip pressed on the mixer.
//   target       whose effects the Effects panel shows: a device's index, a bus's name or 'master'.
//   notes        the picked notes of that pattern, as indices into its `notes`.
//   clips        the picked clips on the arrangement, as indices into the song's `clips`.
//   grain        the index of the grain in `GRAINS` that clicks, drags and nudges snap to.
//   low, from, zoom   the roll's lowest row shown, its first tick shown and its pixels a tick; a
//                zoom of 0 is the whole pattern across, which a newly picked track starts at.
//   last         the length of the note last drawn or resized, in ticks, which a new note takes.
//   step         the tick of the pattern last clicked, where a paste goes when not playing.
//   songStep     the tick of the song last clicked on the arrangement, where clips paste.
//   octave       the octave the note keys play, C of it on `a`.
//   armed        record: a note played while playing is written where the transport put it
//                (`stamp`, Tone's `getTicksAtTime(Tone.now())`); one played while stopped is written
//                at `step`, and `step` moves on past it.
//   cycle        whether the transport loops between the song's `loop` points.
//   hover        what the roll's pointer is over, for its ghost, row and readout.
//   pad          the drum kit pad whose options the faceplate shows, by its note.
//   voice        the DuoSynth voice the faceplate shows, 0 or 1.
//
// Keys (`KEYS`), read through renderdom alone, one table. `Mod` is Ctrl or Cmd. A key with Mod held
// never plays a note and never moves the octave. Plain: a w s e d f t g y h u j k play the note keys
// on the instrument of the device the picked track targets (Tone's triggerAttack and triggerRelease), z and x move the
// octave, r arms, space plays and stops, Home goes to the song's start, l turns the cycle on and
// off, Backspace and Delete take away what is picked, [ and ] undo and redo, q quantizes, Shift+R
// reverses. Mod+C copies, Mod+X cuts, Mod+V pastes, Mod+D duplicates, Mod+A picks everything, Mod+Z
// undoes and Mod+Shift+Z redoes. ←/→ nudge by the grain, ↑/↓ a row, Shift+↑/↓ an octave (twelve
// rows). Escape lets go of what is picked. A key typed into a field (a preset's name) is no key:
// renderdom keeps it from the table.
//
// The presets. The `player` definition's `studio` names where they are: `presets`, the catalogue
// entry of the presets, `[{ name, instrument, effects? }]`, which the loader preloads and the studio
// reads off the page's wire on its first frame; `saved`, the key of the store holding the presets
// saved in the rack, in the same shape, which starts as the scene's `store` prefab names it; and
// `effects`, the effects the Effects panel can add, each with whether Tone gives it a `wet` to turn
// it off by; and `controls`, the ranges, switches and hidden options every faceplate and effect is
// drawn with (`faceplate.ts`): each shows every option Tone holds for it. A device's presets are
// those of its instrument (the same `is` and `voice`): the shipped ones in order, then the saved
// ones in the order they were first saved; a preset saved under a name it already has among the
// saved ones takes that one's place.
//
// The songs. ◀ ▶ on the transport step through `songs`: those `songs.ts` makes, then those of the
// songs file, the catalogue entry the definition's `studio.songs` names, `[{ name, project }]`, which
// the loader preloads: the jungle generator's, `assets/songs/jungles.json`, written by
// `assets/songs/jungle.song.ts`. A song of the file opens as a copy of its project.
//
// The edits on what is picked act on the screen shown: the notes of the picked pattern on the roll,
// the clips on the arrangement. Paste goes at the playhead while playing, else at the
// last step clicked. Each is one step of undo, clamped at the pattern's edges (`edits.ts`).
import {
  addAutomationPattern,
  addBus,
  addDevice,
  addPattern,
  addTrack,
  clipEnd,
  deviceFrom,
  deviceOf,
  fromOf,
  loadPreset,
  moveDevice,
  moveTrack,
  playedOf,
  putEffect,
  putInstrument,
  removeBus,
  removeDevice,
  removePattern,
  removeTrack,
  renameDevice,
  renamePattern,
  setChannel,
  setKnob,
  setLength,
  setTarget,
  setTrack,
  spanOf,
  uniqueClip,
  type Chain,
  type Effect,
  type AutomationPattern,
  type Instrument,
  type Knob,
  type Lane,
  type Note,
  type Pattern,
  type Preset,
  type Project,
  type Range,
} from '#plugins/audiodaw/audiodaw.sim.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Key, Renderdom } from '#plugins/renderdom/renderdom.plugin.ts'
import { controls } from '#plugins/renderdom/controls.ts'
import type { audiodaw as Daw, Timing } from '#plugins/audiodaw/audiodaw.plugin.ts'
import type { store as Kept } from '#plugins/store/store.plugin.ts'
import type { Value } from '#addons/scenemanager/scenemanager.addon.ts'
import { def, json } from '#plugins/loader/loader.sim.ts'
import {
  BAR,
  GRAINS,
  PPQ,
  copyClips,
  copyNotes,
  duplicate,
  duplicateClips,
  TRACK_COLORS,
  loopBetween,
  newClip,
  nextColor,
  nextName,
  noteOf,
  overlaps,
  paste,
  pasteClips,
  quantize,
  remove,
  removeClips,
  reverse,
  roundTo,
  row,
  shift,
  shiftClips,
  songEnd,
  withPattern,
  type Copied,
} from './edits.ts'
import { songs } from './songs.ts'
import { effectControls, knobName, knobsOf, rangeOf, sameKnob, type Control, type Controls } from './faceplate.ts'
import { panel, type Panel } from './panels.ts'

export type Audio = ReturnType<typeof Daw>
export type Store = ReturnType<typeof Kept>
export type Kit = ReturnType<typeof controls>
export type Screen = 'roll' | 'arrange' | 'mixer'
export type Studio = ReturnType<typeof studio>
// Whose effects: a device's index, a bus's name, or 'master'.
export type Target = number | string
export { withPattern }


// The game's size is the scene's `engine` prefab, 1600 × 1000; the studio lays its screens out on
// it: the transport along the top; under it the tracks down the left, under the buttons that pick
// the screen, shown whatever the screen is, and the screen beside them (the arrangement, the roll or
// the mixer); and under those the device: its tabs across the whole width, one per device of the
// rack, over the device itself, its instrument's faceplate on the left and its Effects panel beside
// it.
export const LAYOUT = {
  transport: [0, 0, 1600, 64],
  tracks: [0, 64, 256, 432],
  view: [256, 64, 1344, 432],
  tabs: [0, 496, 1600, 40],
  rack: [0, 536, 960, 464],
  inserts: [960, 536, 640, 464],
} as const satisfies Record<string, [number, number, number, number]>

// Each instrument's name on its faceplate, its sub-line, and its accent, by its `is`.
export const INSTRUMENTS: Record<string, { name: string; sub: string; accent: string }> = {
  MonoSynth: { name: 'MONOSYNTH', sub: 'FILTER ENVELOPE / PORTAMENTO', accent: '#b7a4ff' },
  FMSynth: { name: 'FM SYNTH', sub: 'FREQUENCY MOD', accent: '#7fe0c0' },
  DuoSynth: { name: 'DUOSYNTH', sub: 'TWO OSCILLATORS / VIBRATO', accent: '#c8a6ff' },
  DrumKit: { name: 'DRUM KIT', sub: 'DRUM MACHINE / A PAD A NOTE', accent: '#e2e86a' },
  MembraneSynth: { name: 'MEMBRANE', sub: 'DRUM / PITCH SWEEP', accent: '#e2e86a' },
  NoiseSynth: { name: 'NOISE', sub: 'DRUM / NOISE BURST', accent: '#ffd36a' },
  MetalSynth: { name: 'METAL', sub: 'DRUM / FM METAL', accent: '#8fb4d0' },
  Synth: { name: 'SYNTH', sub: 'ONE OSCILLATOR', accent: '#a6d8a0' },
  AMSynth: { name: 'AM SYNTH', sub: 'AMPLITUDE MOD', accent: '#ffb38a' },
  PluckSynth: { name: 'PLUCK', sub: 'KARPLUS-STRONG STRING', accent: '#f29fc8' },
}
// An instrument's accent; a track that targets no device is grey.
export const accentOf = (i: Instrument | undefined) => (i && INSTRUMENTS[i.is]?.accent) || '#c9ced5'
// The accent of a bus's strip and the master's.
export const RETURN = '#9aa1ab'
export const MASTER = '#3b4250'

// The chassis: what every screen draws on, beyond the kit's own parts.
const CHASSIS = `
.st-ground { position: absolute; box-sizing: border-box; background: var(--ground); border: 1px solid #7d8590; box-shadow: inset 1px 1px 0 #eef0f3; }
.st-top { position: absolute; box-sizing: border-box; display: flex; align-items: center; gap: 12px; padding: 0 10px; background: var(--face); border: 1px solid #8b939e; box-shadow: inset 1px 1px 0 #fff; }
.st-name { font: 15px 'Michroma', sans-serif; letter-spacing: .08em; color: #232831; white-space: nowrap; }
.st-sub { font: 8px 'Silkscreen', monospace; color: #5b6370; letter-spacing: .06em; white-space: nowrap; }
.st-band { position: absolute; height: 3px; }
.st-readout { position: absolute; box-sizing: border-box; font: 16px/18px 'Share Tech Mono', monospace; color: var(--lcd-ink); background: var(--lcd); border: 1px solid #0d1313; box-shadow: inset 0 1px 3px #000; padding: 4px 10px; white-space: pre; overflow: hidden; }
.st-abs { position: absolute; display: flex; align-items: center; }
.st-slot { position: absolute; box-sizing: border-box; font: 8px 'Silkscreen', monospace; color: #3b4250; background: #f4f5f7; border: 1px solid #9aa1ab; padding: 3px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.st-input { position: absolute; box-sizing: border-box; font: 12px 'Share Tech Mono', monospace; color: var(--lcd-ink); background: var(--lcd); border: 1px solid #0d1313; padding: 2px 6px; outline: none; }
.st-track { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; gap: 3px; padding: 0 8px 0 12px; background: var(--face); border: 1px solid #8b939e; box-shadow: inset 1px 1px 0 #fff; cursor: pointer; overflow: hidden; user-select: none; }
.st-track::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--accent); }
.st-track.st-on { background: #f4f5f7; border-color: #232831; box-shadow: inset 0 0 0 1px #232831; }
.st-track-name { font: 10px/12px 'Michroma', sans-serif; letter-spacing: .06em; color: #232831; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.st-track-name b { font: 12px 'Share Tech Mono', monospace; font-weight: normal; color: #5b6370; margin-right: 6px; }
.st-track-sub { font: 8px/10px 'Silkscreen', monospace; color: #5b6370; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.st-target { font: 8px/10px 'Silkscreen', monospace; color: #3b4250; background: #f4f5f7; border: 1px solid #9aa1ab; padding: 0 2px; margin: 0; height: 14px; max-width: 100%; cursor: pointer; outline: none; }
.st-ms { position: absolute; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font: 10px 'Michroma', sans-serif; color: #3b4250; background: var(--face); border: 1px solid #8b939e; box-shadow: inset 1px 1px 0 #fff; cursor: pointer; user-select: none; }
.st-ms.st-on { color: #232831; background: var(--accent); border-color: #232831; box-shadow: inset 0 1px 2px rgba(0,0,0,.25); }
.st-groove { position: absolute; background: #9ba3ad; box-shadow: 1px 1px 0 #f3f5f7; }
.rd-knob.st-auto::after, .rd-fader.st-auto::after { content: ''; position: absolute; top: 0; right: 0; width: 7px; height: 7px; border-radius: 50%; background: #f0b45a; border: 1px solid #232831; box-sizing: border-box; }
.st-sectitle { position: absolute; display: flex; align-items: center; gap: 8px; font: 9px/14px 'Silkscreen', monospace; color: #2f3642; letter-spacing: .12em; white-space: nowrap; }
.st-sectitle::after { content: ''; flex: 1; height: 1px; background: #9ba3ad; box-shadow: 0 1px #f3f5f7; }
.st-screen { position: absolute; box-sizing: border-box; background: #161b18; border: 1px solid #000; box-shadow: inset 0 0 10px #000; border-radius: 2px; overflow: hidden; }
.st-screen svg { position: absolute; left: 0; top: 0; display: block; }
.st-tag { position: absolute; box-sizing: border-box; font: 9px/14px 'Share Tech Mono', monospace; color: #b9f5a8; background: #0c110e; border: 1px solid #2a3a2e; padding: 0 5px; white-space: nowrap; text-align: center; }
.st-tile { position: absolute; box-sizing: border-box; display: grid; place-items: center; background: linear-gradient(#f7f8f9, #dfe3e7); border: 1px solid; border-color: #f3f5f7 #9ba3ad #9ba3ad #f3f5f7; }
.st-tile svg { width: 64%; height: 18px; margin-top: -8px; }
.st-tile span { position: absolute; bottom: 2px; left: 0; right: 0; text-align: center; font: 7px 'Silkscreen', monospace; letter-spacing: -.04em; color: #5d6673; white-space: nowrap; }
.st-tile.st-on { background: #161b18; border-color: #000; }
.st-tile.st-on path { stroke: var(--accent); }
.st-tile.st-on span { color: var(--accent); }
.st-cell { position: absolute; box-sizing: border-box; display: grid; place-items: center; font: 9px 'Silkscreen', monospace; color: #2f3642; background: linear-gradient(#f3f5f7, #d9dde2); border: 1px solid #9ba3ad; white-space: nowrap; overflow: hidden; }
.st-cell.st-on { background: #161b18; color: var(--accent); border-color: #000; }
.st-step { position: absolute; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; padding: 0 8px; background: #161b18; border: 1px solid #000; font: 11px 'Share Tech Mono', monospace; color: #b9f5a8; white-space: nowrap; }
.st-step b { font: 8px 'Silkscreen', monospace; color: #6f8f68; font-weight: normal; letter-spacing: .06em; }
.st-pad { position: absolute; box-sizing: border-box; border-radius: 4px; background: linear-gradient(#5b616a, #3f444b); box-shadow: inset 0 1px #7c838c, 0 2px 0 #23272c; display: flex; flex-direction: column; justify-content: flex-end; padding: 8px; gap: 2px; }
.st-pad b { font: 9px 'Silkscreen', monospace; color: #e9ecf0; font-weight: normal; letter-spacing: .04em; white-space: nowrap; }
.st-pad i { font: 11px 'Share Tech Mono', monospace; color: #aab2bc; font-style: normal; }
.st-pad.st-on { background: linear-gradient(var(--accent), color-mix(in srgb, var(--accent) 70%, #000)); box-shadow: inset 0 1px #fff8, 0 0 14px color-mix(in srgb, var(--accent) 60%, transparent); }
.st-pad.st-on b, .st-pad.st-on i { color: #1c1f23; }
.st-scroll { position: absolute; box-sizing: border-box; background: #b7bec7; border: 1px solid #8b939e; }
.st-thumb { position: absolute; top: 1px; bottom: 1px; background: var(--face); border: 1px solid #5d6571; box-sizing: border-box; }
`

// The note keys, in order: C to the C above on `a w s e d f t g y h u j k`.
export const NOTE_KEYS = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK']
// How hard a key plays, Tone's velocity.
export const VELOCITY = 0.8
export const OCTAVES = [0, 8] as const

type Snapshot = { project: Project; song: number; notes: number[]; clips: number[] }
export type Loop = { start: number; end: number }
export type Hover = { row: number; tick: number; over: 'edge' | 'body' | 'empty' }

export type View = {
  screen: Screen
  track: number
  device: number
  pattern: string
  target: Target
  notes: number[]
  clips: number[]
  grain: number
  low: number
  from: number
  zoom: number
  last: number
  step: number
  songStep: number
  octave: number
  armed: boolean
  cycle: boolean
  hover?: Hover
  // The drum kit pad whose options the faceplate shows, by its note; the kit's lowest when unset.
  pad?: string
  // The voice of a DuoSynth the faceplate shows, 0 or 1.
  voice: 0 | 1
  song: number
  // The arrangement's first tick shown and its pixels a tick; a zoom of 0 is the whole song across.
  songFrom: number
  songZoom: number
  // The pixels the tracks are scrolled down by, their headers and their rows of the arrangement
  // together; and a track picked (`pick`) that the tracks scroll to show on their next frame.
  tracksTop: number
  reveal?: number
  // The name being typed (`field`), by its key: a track's, a pattern's, a clip's or a device's.
  editing?: string
}

// One binding of the key table: the key by its `code`, whether Mod and Shift are held, and what it
// does. A binding without `shift` is matched with Shift up.
type Binding = { code: string; mod: boolean; shift?: boolean; act: (s: Studio) => void }

export const KEYS: Binding[] = [
  { code: 'KeyZ', mod: false, act: s => s.octaveBy(-1) },
  { code: 'KeyX', mod: false, act: s => s.octaveBy(1) },
  { code: 'KeyR', mod: false, act: s => (s.view.armed = !s.view.armed) },
  { code: 'KeyR', mod: false, shift: true, act: s => s.reverse() },
  { code: 'Space', mod: false, act: s => s.toggle() },
  { code: 'Home', mod: false, act: s => s.locate(spanOf(s.project).start) },
  { code: 'KeyL', mod: false, act: s => s.cycleBy() },
  { code: 'Backspace', mod: false, act: s => s.removePicked() },
  { code: 'Delete', mod: false, act: s => s.removePicked() },
  { code: 'BracketLeft', mod: false, act: s => s.undo() },
  { code: 'BracketRight', mod: false, act: s => s.redo() },
  { code: 'KeyQ', mod: false, act: s => s.quantize() },
  { code: 'KeyC', mod: true, act: s => s.copy() },
  { code: 'KeyX', mod: true, act: s => s.cut() },
  { code: 'KeyV', mod: true, act: s => s.paste() },
  { code: 'KeyD', mod: true, act: s => s.duplicate() },
  { code: 'KeyA', mod: true, act: s => s.selectAll() },
  { code: 'KeyZ', mod: true, act: s => s.undo() },
  { code: 'KeyZ', mod: true, shift: true, act: s => s.redo() },
  { code: 'ArrowLeft', mod: false, act: s => s.nudge(-GRAINS[s.view.grain]!.ticks, 0) },
  { code: 'ArrowRight', mod: false, act: s => s.nudge(GRAINS[s.view.grain]!.ticks, 0) },
  { code: 'ArrowUp', mod: false, act: s => s.nudge(0, 1) },
  { code: 'ArrowDown', mod: false, act: s => s.nudge(0, -1) },
  { code: 'ArrowUp', mod: false, shift: true, act: s => s.nudge(0, 12) },
  { code: 'ArrowDown', mod: false, shift: true, act: s => s.nudge(0, -12) },
  { code: 'Escape', mod: false, act: s => s.clear() },
]

// Where the studio's presets are, off the `player` definition, and its effects and controls; and the
// catalogue entry of the songs written as files (`songs`).
type Names = { presets: string; saved: string; songs: string; controls: Controls; effects: Record<string, EffectPlate> }
// A song the studio opens: its name, and the project it opens as, made from the shipped presets.
export type Song = { name: string; make: (presets: Preset[]) => Project }
// An effect the Effects panel adds: whether it has Tone's `wet`, so it can be turned off.
export type EffectPlate = { wet: boolean }

// A song with nothing in it, which the studio holds until its first frame.
function empty(): Project {
  return { bpm: 120, timeSignature: 4, swing: 0, swingSubdivision: '8n', ppq: PPQ, rack: [], tracks: [], buses: {}, master: { volume: 0, effects: [] }, clips: [] }
}

// The effects chain a target names, in audiodaw's words.
export function chainOf(target: Target): Chain {
  if (typeof target === 'number') return { device: target }
  return target === 'master' ? 'master' : { bus: target }
}

export function studio() {
  let project: Project = empty()
  const view: View = {
    screen: 'arrange',
    track: 0,
    device: 0,
    pattern: '',
    target: 0,
    notes: [],
    clips: [],
    grain: 1,
    low: 48,
    from: 0,
    zoom: 1,
    last: GRAINS[1]!.ticks,
    step: 0,
    songStep: 0,
    octave: 4,
    armed: false,
    cycle: false,
    song: 0,
    songFrom: 0,
    songZoom: 0,
    tracksTop: 0,
    voice: 0,
  }
  let past: Snapshot[] = []
  let future: Snapshot[] = []
  let held: Snapshot | undefined // the snapshot a gesture under way began from
  let clipboard: Copied | undefined
  let names: Names | undefined
  let shipped: Preset[] | undefined
  // The songs ◀ ▶ step through: `songs.ts`'s, then those of the songs file, from the first frame.
  let list: Song[] = songs
  let store: Store | undefined
  let dom: Renderdom | undefined
  let kit: Kit | undefined
  let audio: Audio | undefined
  let heard: Project | undefined // the song as audiodaw last had it
  let loaded: number | undefined // the song audiodaw last loaded, by its place in `list`
  let cycled: boolean | undefined // the cycle as audiodaw last had it
  // Tone's context let run (`audio.start`, Tone.start): asked for once, and whether it runs yet.
  let waking: Promise<void> | undefined
  let awake = false
  let cue = 0 // the tick a play starts from
  // The knobs an automation track can aim at, for the song they were listed for.
  let listed: { project: Project; knobs: { knob: Knob; name: string }[] } | undefined
  // The note keys down, by code: the note each sounds, the track it was played on and the device
  // that sounds it, and, recording, where it began.
  const down = new Map<string, { note: string; track: number; device: number; at?: number }>()

  // The store and the key of it the saved presets are under.
  const keeping = () => {
    if (!store || !names) throw new Error('the studio has not ticked yet')
    return { store, key: names.saved }
  }
  const snap = (): Snapshot => ({ project, song: view.song, notes: [...view.notes], clips: [...view.clips] })
  const restore = (s: Snapshot) => {
    if (s.song !== view.song) {
      // Back to another song: it starts from its start, as an opened one does.
      if (audio?.playing) audio.stop()
      cue = spanOf(s.project).start
      view.song = s.song
      view.cycle = false
    }
    project = s.project
    view.notes = s.notes
    view.clips = s.clips
    fit()
  }
  // The view kept to the song: the picked track, device, pattern and target there, and what is
  // picked inside them.
  const fit = () => {
    view.track = Math.max(0, Math.min(project.tracks.length - 1, view.track))
    view.device = Math.max(0, Math.min(project.rack.length - 1, view.device))
    const t = project.tracks[view.track]
    if (t && !Object.hasOwn(t.patterns, view.pattern)) view.pattern = project.clips.find(c => c.track === view.track)?.pattern ?? Object.keys(t.patterns)[0] ?? ''
    const pat = me.pattern()
    view.notes = pat ? view.notes.filter(i => i < pat.notes.length) : []
    view.clips = view.clips.filter(i => i < project.clips.length)
    if (typeof view.target === 'number' ? !project.rack[view.target] : view.target !== 'master' && !Object.hasOwn(project.buses, view.target)) view.target = project.rack.length ? view.device : 'master'
  }

  const me = {
    get project() { return project },
    view,
    get clipboard() { return clipboard },
    get audio() { return audio },
    get kit(): Kit {
      if (!kit) throw new Error('the studio has not ticked yet')
      return kit
    },
    get dom(): Renderdom {
      if (!dom) throw new Error('the studio has not ticked yet')
      return dom
    },
    // The presets shipped in the catalogue.
    get shipped(): Preset[] {
      if (!shipped) throw new Error('the studio has not ticked yet')
      return shipped
    },
    // The songs the studio opens, in the order ◀ ▶ step through them.
    get songs(): Song[] { return list },
    // The presets saved in the rack, the store's.
    get saved(): Preset[] {
      const k = keeping()
      return k.store.get(k.key) as unknown as Preset[]
    },
    // The ranges, switches and hidden options of every faceplate (`faceplate.ts`).
    get controls(): Controls {
      if (!names) throw new Error('the studio has not ticked yet')
      return names.controls
    },
    // The picked device's faceplate laid in `box` (`panels.ts`), read off what Tone holds for its
    // instrument; undefined with no device or before audiodaw has the song.
    plate(box: [number, number, number, number], accent: string): Panel | undefined {
      const d = project.rack[view.device]
      if (!d || !audio || !me.ready) return undefined
      return panel(d.instrument, audio.optionsOf(view.device), box, i => me.setInstrument(i), {
        c: me.controls, accent, ...(view.pad === undefined ? {} : { pad: view.pad }), pickPad: note => me.pickPad(note), voice: view.voice, pickVoice: v => { view.voice = v },
      })
    },
    // The controls of effect `i` of a chain, every option Tone holds for it.
    effectControls(chain: Chain, i: number, e: Effect): Control[] {
      if (!audio) return []
      return effectControls(me.controls, e, audio.effectOptionsOf(chain, i), next => me.change(p => putEffect(p, chain, i, next)))
    },
    // The effects the Effects panel adds, by Tone's name of each.
    get effects(): Record<string, EffectPlate> {
      if (!names) throw new Error('the studio has not ticked yet')
      return names.effects
    },
    // Whether the song is loaded into audiodaw, so its meters can be read.
    get ready() { return heard !== undefined },

    // ---- undo ----
    // One edit, one step of undo.
    edit(f: (p: Project) => Project, picked?: { notes?: number[]; clips?: number[] }) {
      const before = snap()
      const next = f(project)
      if (next === project && !picked) return
      project = next
      if (picked?.notes) view.notes = picked.notes
      if (picked?.clips) view.clips = picked.clips
      fit()
      if (held) return
      past.push(before)
      future = []
    },
    begin() {
      me.wake()
      if (!held) held = snap()
    },
    change(f: (p: Project) => Project, picked?: { notes?: number[]; clips?: number[] }) {
      if (!held) throw new Error('a change made outside a gesture: begin() first')
      project = f(project)
      if (picked?.notes) view.notes = picked.notes
      if (picked?.clips) view.clips = picked.clips
      fit()
    },
    end() {
      const from = held
      held = undefined
      if (!from || from.project === project) return
      past.push(from)
      future = []
    },
    gesture: { begin: () => me.begin(), end: () => me.end() },
    get undoable() { return past.length },
    // Undo's history let go of, as a song opened anew starts with none.
    forget() {
      past = []
      future = []
    },
    get redoable() { return future.length },
    undo() {
      const s = past.pop()
      if (!s) return
      future.push(snap())
      restore(s)
    },
    redo() {
      const s = future.pop()
      if (!s) return
      past.push(snap())
      restore(s)
    },

    // ---- the song, the track and its pattern ----
    // Opens a song anew, one step of undo.
    open(song: number) {
      if (audio?.playing) audio.stop()
      past.push(snap())
      future = []
      project = list[song]!.make(me.shipped)
      view.song = song
      loaded = undefined
      view.track = 0
      view.device = 0
      view.songFrom = 0
      view.songZoom = 0
      view.tracksTop = 0
      view.editing = undefined
      view.pattern = ''
      view.notes = []
      view.clips = []
      view.cycle = false
      fit()
      me.pick(0)
      view.screen = 'arrange'
      cue = spanOf(project).start
    },
    // Picks a track, and the device it targets for the rack and the Effects panel; the tracks scroll
    // to show it.
    pick(track: number, pattern?: string) {
      view.track = track
      view.reveal = track
      const target = me.targetOf(track)
      if (target !== undefined) {
        view.device = target
        view.target = target
      }
      view.pattern = pattern ?? ''
      view.notes = []
      fit()
      const t = project.tracks[track]
      if (t && view.screen !== 'arrange' && view.screen !== 'mixer') view.screen = 'roll'
      const pat = me.pattern()
      if (pat && t) {
        const rows = pat.notes.map(row)
        const mid = rows.length ? Math.round((Math.min(...rows) + Math.max(...rows)) / 2) : 60
        view.low = Math.max(0, Math.min(128 - 24, mid - 12))
      }
      view.from = 0
      // No zoom: the roll fits the whole pattern across.
      view.zoom = 0
    },
    // Picks a device of the rack for the faceplate and the Effects panel.
    pickDevice(device: number) {
      view.device = device
      view.target = device
      fit()
    },
    show(screen: Screen) {
      view.screen = screen
    },
    // The picked note track's picked pattern; undefined on an automation track.
    pattern(): Pattern | undefined {
      const t = project.tracks[view.track]
      return t?.kind === 'notes' ? t.patterns[view.pattern] : undefined
    },
    // The picked track's picked pattern of either kind: what its bar, its length and the playhead in
    // it read.
    lane(): Lane | undefined {
      return project.tracks[view.track]?.patterns[view.pattern]
    },
    // The picked automation track's picked pattern; undefined on a note track.
    automation(): AutomationPattern | undefined {
      const t = project.tracks[view.track]
      return t?.kind === 'automation' ? t.patterns[view.pattern] : undefined
    },
    // The device a note track sends its notes to; undefined for none, or an automation track.
    targetOf(track: number): number | undefined {
      const t = project.tracks[track]
      return t?.kind === 'notes' ? t.target : undefined
    },
    // The instrument a track's notes play: that of the device it targets, or none.
    instrumentOf(track = view.track): Instrument | undefined {
      return deviceOf(project, track)?.instrument
    },
    // The picked pattern made anew by `f`, inside a gesture when one is under way, else as one edit.
    write(f: (pat: Pattern) => { pattern: Pattern; picked: number[] }) {
      const pat = me.pattern()
      if (!pat) return
      const out = f(pat)
      if (out.pattern === pat && sameList(out.picked, view.notes)) return
      const next = (p: Project) => withPattern(p, view.track, view.pattern, out.pattern)
      if (held) me.change(next, { notes: out.picked })
      else me.edit(next, { notes: out.picked })
    },
    // A pattern for a track that has none: a bar, a clip of it at the song's start.
    ensurePattern() {
      const t = project.tracks[view.track]
      if (!t || me.lane()) return
      const track = view.track
      const made = newClip(project, track, spanOf(project).start)
      me.edit(() => made.project)
      view.pattern = made.pattern
    },

    // ---- patterns ----
    // A new clip of a new empty pattern a bar long on track `t` at the song's tick `at`, picked, and
    // the pattern opened on its track.
    newClip(t: number, at: number) {
      if (!project.tracks[t]) return
      const made = newClip(project, t, at)
      me.edit(() => made.project, { clips: [made.clip] })
      view.track = t
      view.pattern = made.pattern
      fit()
    },
    // A clip's pattern opened on the roll.
    openClip(i: number) {
      const c = project.clips[i]
      if (!c) return
      me.pick(c.track, c.pattern)
      me.show('roll')
    },
    // A clip given a pattern of its own (`uniqueClip`), and that pattern picked.
    uniqueClip(i: number) {
      const c = project.clips[i]
      if (!c) return
      me.edit(p => uniqueClip(p, i), { clips: [i] })
      if (c.track === view.track) view.pattern = project.clips[i]!.pattern
    },
    // A new empty pattern a bar long on the picked track, under the next free letter, and picked;
    // no clip plays it until one is placed.
    addPattern() {
      const t = view.track
      const tr = project.tracks[t]
      if (!tr) return
      const name = nextName(Object.keys(tr.patterns))
      me.edit(p => (tr.kind === 'notes' ? addPattern(p, t, name, { length: BAR, notes: [] }) : addAutomationPattern(p, t, name, { length: BAR, notes: [] })))
      view.pattern = name
      view.notes = []
    },
    // The picked track's patterns, in the order they were made.
    patterns(): string[] {
      return Object.keys(project.tracks[view.track]?.patterns ?? {})
    },
    // The picked track's next (`by` 1) or previous (-1) pattern picked.
    stepPattern(by: number) {
      const list = me.patterns()
      if (!list.length) return
      const at = list.indexOf(view.pattern)
      view.pattern = list[((at + by) % list.length + list.length) % list.length]!
      view.notes = []
    },
    // A pattern of a track renamed, every clip of it with it; a name taken by another of its
    // patterns, or empty, is refused.
    renamePattern(t: number, name: string, to: string): boolean {
      const clean = to.trim()
      const tr = project.tracks[t]
      if (!tr?.patterns[name] || !clean) return false
      if (clean === name) return true
      if (tr.patterns[clean]) return false
      me.edit(p => renamePattern(p, t, name, clean))
      if (t === view.track && view.pattern === name) view.pattern = clean
      return true
    },
    // A pattern of the picked track taken away with every clip of it.
    removePattern(name = view.pattern) {
      const t = view.track
      if (!project.tracks[t]?.patterns[name]) return
      me.edit(p => removePattern(p, t, name), { clips: [], notes: [] })
      view.pattern = ''
      fit()
    },
    // The picked pattern's end set (`setLength`), inside a gesture when one is under way.
    setPatternLength(length: number) {
      const pat = me.lane()
      if (!pat) return
      const next = Math.max(fromOf(pat) + 1, Math.round(length))
      if (next === pat.length) return
      const t = view.track, name = view.pattern
      if (held) me.change(p => setLength(p, t, name, next))
      else me.edit(p => setLength(p, t, name, next))
    },

    // ---- time ----
    // The song's tick the transport is at: playing, Tone's `transport.ticks`; stopped, the cue.
    playhead(): number {
      if (!audio || !me.ready || !audio.playing) return cue
      return Math.floor(audio.position())
    },
    // Where the song ends: its span's end.
    get length() { return spanOf(project).end },
    // The song's bounds set, as the song's `span`: whole ticks, its start from 0, its end at least a
    // tick past its start. Clips outside it stay where they are.
    setSpan(span: { start: number; end: number }) {
      const start = Math.max(0, Math.round(span.start))
      const end = Math.max(start + 1, Math.round(span.end))
      const was = spanOf(project)
      if (was.start === start && was.end === end && project.span) return
      if (held) me.change(p => ({ ...p, span: { start, end } }))
      else me.edit(p => ({ ...p, span: { start, end } }))
    },
    // Goes to the song's tick `t`, kept from before its start: playing, the transport goes there.
    // Playing with the cycle on, a tick outside the loop goes to the loop's start: Tone's transport
    // wraps only when it reaches the loop's end, so from past it the loop would never come round.
    locate(t: number) {
      cue = Math.max(0, Math.round(t))
      if (audio && me.ready && audio.playing) {
        const loop = me.cycling()
        if (loop && (cue < loop.start || cue >= loop.end)) cue = loop.start
        audio.locate(cue)
      }
    },
    // The loop while the cycle is on, else undefined.
    cycling(): Loop | undefined {
      return view.cycle ? project.loop : undefined
    },
    // The loop set, as the song's `loop` (Tone's loop points), and turned on.
    setLoop(loop: Loop) {
      me.edit(p => ({ ...p, loop }))
      view.cycle = true
    },
    // The cycle turned on or off; turned on with no loop, the picked clips' span, or the first four bars.
    cycleBy() {
      if (!view.cycle && !project.loop) {
        const picked = view.clips.map(i => project.clips[i]!)
        const length = Math.max(4 * BAR, songEnd(project))
        const loop = picked.length
          ? loopBetween(Math.min(...picked.map(c => c.start)), Math.max(...picked.map(c => clipEnd(project, c))), 1, length)
          : loopBetween(0, 4 * BAR, 1, length)
        me.edit(p => ({ ...p, loop }))
      }
      view.cycle = !view.cycle
    },
    // A track's mute or solo turned over: its notes held back or let through.
    muteBy(i: number) {
      me.edit(p => setTrack(p, i, 'mute', !p.tracks[i]!.mute))
    },
    // An automation track has no solo.
    soloBy(i: number) {
      const t = project.tracks[i]
      if (t?.kind !== 'notes') return
      me.edit(p => setTrack(p, i, 'solo', !t.solo))
    },
    // A device's mute or solo turned over, as an edit of its channel.
    muteDevice(d: number) {
      me.edit(p => setChannel(p, d, 'mute', !p.rack[d]!.channel.mute))
    },
    soloDevice(d: number) {
      me.edit(p => setChannel(p, d, 'solo', !p.rack[d]!.channel.solo))
    },

    // ---- tracks and the rack ----
    // A new note track with no notes, targeting the device the picked track does (the picked device
    // when the picked track is an automation track or targets none), in the first colour no track
    // has (the palette's next when all are taken), and picked.
    addTrack() {
      const target = me.targetOf(view.track) ?? (project.rack.length ? view.device : undefined)
      let k = project.tracks.length + 1
      while (project.tracks.some(t => t.name === `TRACK ${k}`)) k++
      const name = `TRACK ${k}`
      const used = new Set(project.tracks.map(t => t.color))
      const color = TRACK_COLORS.find(c => !used.has(c)) ?? TRACK_COLORS[project.tracks.length % TRACK_COLORS.length]!
      me.edit(p => addTrack(p, { kind: 'notes', name, color, ...(target === undefined ? {} : { target }), patterns: {}, mute: false, solo: false }))
      me.pick(project.tracks.length - 1)
    },
    // A track renamed; an empty name is refused.
    renameTrack(i: number, name: string): boolean {
      const clean = name.trim()
      if (!project.tracks[i] || !clean) return false
      if (clean !== project.tracks[i]!.name) me.edit(p => setTrack(p, i, 'name', clean))
      return true
    },
    // A track's colour stepped to the palette's next.
    colorTrack(i: number) {
      const t = project.tracks[i]
      if (!t) return
      me.edit(p => setTrack(p, i, 'color', nextColor(t.color)))
    },
    // A track moved to place `to`, its clips with it, the picked track still picked.
    moveTrack(from: number, to: number) {
      if (!project.tracks[from] || !project.tracks[to] || from === to) return
      const picked = project.tracks[view.track]
      me.edit(p => moveTrack(p, from, to))
      view.track = Math.max(0, project.tracks.indexOf(picked!))
    },
    // A device renamed; an empty name is refused.
    renameDevice(d: number, name: string): boolean {
      const clean = name.trim()
      if (!project.rack[d] || !clean) return false
      if (clean !== project.rack[d]!.name) me.edit(p => renameDevice(p, d, clean))
      return true
    },
    // A device moved to place `to` in the rack, the picked device still picked.
    moveDevice(from: number, to: number) {
      if (!project.rack[from] || !project.rack[to] || from === to) return
      const picked = project.rack[view.device]
      me.edit(p => moveDevice(p, from, to))
      view.device = Math.max(0, project.rack.indexOf(picked!))
      if (typeof view.target === 'number') view.target = view.device
    },
    // A track taken away with its clips.
    removeTrack(i: number) {
      if (!project.tracks[i]) return
      me.edit(p => removeTrack(p, i), { clips: [] })
      me.pick(Math.min(i, project.tracks.length - 1))
    },
    // The device a note track sends its notes to, or none.
    retarget(i: number, target: number | undefined) {
      if (project.tracks[i]?.kind !== 'notes' || me.targetOf(i) === target) return
      me.edit(p => setTarget(p, i, target))
      if (i === view.track && target !== undefined) me.pickDevice(target)
    },

    // ---- automation ----
    // The right button on a knob: an automation track aimed at it, the one there is, else a new one
    // at the bottom of the list named for the knob, in the first colour no track has; picked, and
    // shown on the arrangement.
    automate(knob: Knob) {
      let t = project.tracks.findIndex(x => x.kind === 'automation' && sameKnob(x.target, knob))
      if (t < 0) {
        const used = new Set(project.tracks.map(x => x.color))
        const color = TRACK_COLORS.find(c => !used.has(c)) ?? TRACK_COLORS[project.tracks.length % TRACK_COLORS.length]!
        const name = knobName(me.controls, knob, project)
        me.edit(p => addTrack(p, { kind: 'automation', name, color, target: knob, patterns: {}, mute: false }))
        t = project.tracks.length - 1
      }
      me.pick(t)
      view.screen = 'arrange'
    },
    // Whether an automation track is aimed at `knob`: its faceplate marks it.
    automated(knob: Knob): boolean {
      return project.tracks.some(x => x.kind === 'automation' && sameKnob(x.target, knob))
    },
    // A knob's or a fader's element marked with a dot while an automation track is aimed at `knob`.
    mark(el: HTMLElement, knob: Knob) {
      const on = me.automated(knob)
      if (el.classList.contains('st-auto') !== on) el.classList.toggle('st-auto', on)
    },
    // Whether a knob sweeps (true) or is set on 16ths (false), as audiodaw finds it on Tone's objects;
    // undefined before audiodaw has the song, or for a knob it does not have.
    glides(knob: Knob): boolean | undefined {
      return audio && me.ready ? audio.glides(knob) : undefined
    },
    // A knob's name, as a header lists it.
    knobName(knob: Knob): string {
      return knobName(me.controls, knob, project)
    },
    // A knob's travel (`rangeOf`), what its automation's 0 to 1 is in its units.
    range(knob: Knob): Range | undefined {
      return rangeOf(me.controls, knob, project)
    },
    // Every knob of the song an automation track can aim at, named (`knobsOf`), worked out once a song.
    knobs(): { knob: Knob; name: string }[] {
      if (!audio || !me.ready) return []
      if (listed?.project !== project) {
        const a = audio
        listed = { project, knobs: knobsOf(me.controls, project, { instrument: d => a.optionsOf(d), effect: (c, i) => a.effectOptionsOf(c, i) }) }
      }
      return listed.knobs
    },
    // The knob an automation track sends its values to, or none.
    retargetKnob(i: number, knob: Knob | undefined) {
      const x = project.tracks[i]
      if (x?.kind !== 'automation' || (knob ? sameKnob(x.target, knob) : x.target === undefined)) return
      me.edit(p => setKnob(p, i, knob))
    },
    // A device of the instrument `kind` (an instrument's `is`) from its first preset, named after it,
    // and picked.
    addDevice(kind: string) {
      const preset = [...me.shipped, ...me.saved].find(p => p.instrument.is === kind)
      if (!preset) throw new Error(`no preset of ${kind}`)
      let name = preset.name.toUpperCase()
      for (let k = 2; project.rack.some(d => d.name === name); k++) name = `${preset.name.toUpperCase()} ${k}`
      me.edit(p => addDevice(p, deviceFrom(name, preset)))
      me.pickDevice(project.rack.length - 1)
    },
    // A device taken away; the tracks that targeted it target none.
    removeDevice(d: number) {
      if (!project.rack[d]) return
      me.edit(p => removeDevice(p, d))
      if (view.device >= d) view.device = Math.max(0, view.device - 1)
      if (typeof view.target === 'number') view.target = view.device
      fit()
    },
    // A song's tick in the picked pattern's ticks: in the clip of it the song is in there, if any.
    patternAt(at: number): number | undefined {
      const pat = me.lane()
      if (!pat) return undefined
      const c = project.clips.find(c => c.track === view.track && c.pattern === view.pattern && at >= c.start && at < clipEnd(project, c))
      return c ? at - c.start + fromOf(pat) : undefined
    },
    // The playhead in the picked pattern's ticks.
    patternTick(): number | undefined {
      return me.patternAt(me.playhead())
    },
    get playing() { return audio?.playing === true },
    // Tone's context let run on a press or a key (Tone.start), and `then` once it runs: at once when
    // it does, else when Tone.start has let it run. Nothing is handed to Tone before, so no note is
    // scheduled on a context not yet running.
    wake(then?: () => void) {
      if (!audio) return
      if (awake) return then?.()
      waking ??= audio.start().then(() => { awake = true })
      if (then) void waking.then(then)
    },
    toggle() {
      if (!audio || !me.ready) return
      if (audio.playing) me.stop()
      else me.play()
    },
    play() {
      if (!audio || !me.ready || audio.playing) return
      me.wake(() => {
        if (!audio || audio.playing) return
        // With the cycle on, cued outside the loop, play starts at the loop's start (Tone wraps only
        // on reaching the loop's end, so from past it the loop is never heard); with it off, cued at
        // or past the song's end, or before its start, play starts at the song's start.
        const loop = me.cycling()
        const { start, end } = loop ?? spanOf(project)
        if (cue >= end || cue < start) cue = start
        audio.play(cue)
      })
    },
    // Stops where it is; stopped already, goes back to the loop's start with the cycle on, else to
    // the song's start.
    stop() {
      if (!audio || !me.ready) return
      if (audio.playing) {
        cue = Math.floor(audio.position())
        audio.stop()
      } else cue = (me.cycling() ?? spanOf(project)).start
    },
    setBpm(bpm: number) {
      me.edit(p => ({ ...p, bpm: Math.min(300, Math.max(20, bpm)) }))
    },
    // Tone's timing as audiodaw holds it, and the buffer the browser gave; undefined before its tick.
    get timing() { return audio?.timing },
    // Tone's timing set anew (`audiodaw.retime`): play stopped first, so the cue is where it was; the
    // new context let run on the next press, and the cycle handed to its transport.
    retime(t: Timing) {
      if (!audio) return
      if (audio.playing) me.stop()
      void audio.retime(t)
      awake = false
      waking = undefined
      cycled = undefined
    },

    // ---- what is picked ----
    selectAll() {
      if (view.screen === 'arrange') view.clips = project.clips.map((_, i) => i)
      else if (view.screen !== 'mixer') view.notes = me.pattern()?.notes.map((_, i) => i) ?? []
    },
    clear() {
      view.notes = []
      view.clips = []
    },
    removePicked() {
      if (view.screen === 'arrange') {
        if (view.clips.length) me.edit(p => removeClips(p, view.clips), { clips: [] })
      } else if (view.screen !== 'mixer' && view.notes.length) me.write(pat => remove(pat, view.notes))
    },
    copy() {
      if (view.screen === 'arrange') clipboard = copyClips(project, view.clips) ?? clipboard
      else if (view.screen !== 'mixer') {
        const pat = me.pattern()
        if (pat) clipboard = copyNotes(pat, view.notes) ?? clipboard
      }
    },
    cut() {
      me.copy()
      me.removePicked()
    },
    paste(at?: number) {
      if (!clipboard) return
      if (view.screen === 'arrange') {
        if (clipboard.kind !== 'clips') return
        const c = clipboard
        const where = at ?? (me.playing ? me.playhead() : view.songStep)
        const out = pasteClips(project, c, where, c.first)
        if (out.picked.length) me.edit(() => out.project, { clips: out.picked })
      } else if (view.screen !== 'mixer') {
        if (clipboard.kind !== 'notes') return
        const c = clipboard
        const where = at ?? (me.playing ? (me.patternTick() ?? view.step) : view.step)
        me.write(pat => paste(pat, c, where))
      }
    },
    duplicate() {
      if (view.screen === 'arrange') {
        const out = duplicateClips(project, view.clips)
        if (out.picked.length && out.project !== project) me.edit(() => out.project, { clips: out.picked })
      } else if (view.screen !== 'mixer' && view.notes.length) me.write(pat => duplicate(pat, view.notes))
    },
    nudge(dt: number, dr: number) {
      if (view.screen === 'arrange') {
        if (view.clips.length && dt) me.edit(p => shiftClips(p, view.clips, dt), { clips: view.clips })
      } else if (view.screen !== 'mixer' && view.notes.length) {
        me.write(pat => {
          const out = shift(pat, view.notes, dt, dr)
          return out.pattern === pat ? out : overlaps(out.pattern, out.picked)
        })
      }
    },
    transpose(n: number) {
      me.nudge(0, n)
    },
    // Quantizes what is picked, or, with nothing picked, every note of the pattern.
    quantize() {
      if (view.screen === 'arrange' || view.screen === 'mixer') return
      const pat = me.pattern()
      if (!pat) return
      const picked = view.notes.length ? view.notes : pat.notes.map((_, i) => i)
      me.write(p => {
        const out = quantize(p, picked, GRAINS[view.grain]!.ticks)
        return { pattern: out.pattern, picked: view.notes.length ? out.picked : [] }
      })
    },
    reverse() {
      if (view.screen === 'arrange' || view.screen === 'mixer' || !view.notes.length) return
      me.write(pat => reverse(pat, view.notes))
    },

    // ---- the note keys ----
    octaveBy(d: number) {
      view.octave = Math.min(OCTAVES[1], Math.max(OCTAVES[0], view.octave + d))
    },
    // What the note key at `index` of `NOTE_KEYS` plays on the picked track: Tone's name of the
    // pitch, from C of the octave.
    keyFor(index: number): string | undefined {
      if (me.targetOf(view.track) === undefined || index < 0) return undefined
      return noteOf(Math.min(127, 12 * (view.octave + 1) + index))
    },
    noteOn(code: string) {
      const note = me.keyFor(NOTE_KEYS.indexOf(code))
      const device = me.targetOf(view.track)
      if (note === undefined || device === undefined || down.has(code)) return
      // Recording while playing: where the transport is now, Tone's getTicksAtTime(Tone.now()).
      const at = me.playing && audio ? me.patternAt(Math.floor(audio.stamp())) : undefined
      const held = { note, track: view.track, device, at }
      down.set(code, held)
      // The key sounds once Tone runs, if it is still held then.
      me.wake(() => {
        if (audio && me.ready && down.get(code) === held && project.rack[device]) audio.attack(device, note, VELOCITY)
      })
    },
    noteOff(code: string) {
      const d = down.get(code)
      if (!d) return
      down.delete(code)
      if (audio && me.ready && project.rack[d.device]) audio.release(d.device, d.note)
      if (!view.armed || d.track !== view.track) return
      const now = me.playing && audio ? me.patternAt(Math.floor(audio.stamp())) : undefined
      me.record(d.note, d.at, now)
    },
    // A note the armed studio was played: from where it fell to where it was let go while playing,
    // else at `step`, `last` long.
    record(note: string, began: number | undefined, ended?: number) {
      me.ensurePattern()
      const pat = me.pattern()
      if (!pat) return
      const g = GRAINS[view.grain]!.ticks
      let time: number, duration: number
      if (began !== undefined) {
        const stop = ended !== undefined && ended >= began ? ended : pat.length
        time = Math.min(pat.length - 1, roundTo(began, g))
        duration = Math.max(1, Math.min(pat.length - time, Math.max(g, roundTo(stop - began, g))))
      } else {
        time = Math.min(pat.length - 1, view.step)
        duration = Math.max(1, Math.min(pat.length - time, view.last))
        view.step = (time + duration) % pat.length
      }
      const written: Note = { time, duration, note, velocity: VELOCITY }
      me.write(p => {
        const notes = [...p.notes, written]
        return overlaps({ ...p, notes }, [notes.length - 1])
      })
    },
    // A key going down, by the table: a note key with no Mod, Alt or Shift plays; any other key is
    // looked up by its code and whether Mod and Shift are held. True when it did something.
    keyDown(k: Key): boolean {
      if (!k.mod && !k.altKey && !k.shiftKey && NOTE_KEYS.includes(k.code)) {
        if (!k.repeat) me.noteOn(k.code)
        return true
      }
      const b = KEYS.find(b => b.code === k.code && b.mod === k.mod && (b.shift ?? false) === k.shiftKey)
      if (!b) return false
      me.wake()
      b.act(me as Studio)
      return true
    },
    keyUp(k: Key): boolean {
      if (!down.has(k.code)) return false
      me.noteOff(k.code)
      return true
    },

    // ---- presets ----
    // The presets of an instrument like `i`: the same `is`.
    presets(i: Instrument): Preset[] {
      return [...me.shipped, ...me.saved].filter(p => p.instrument.is === i.is)
    },
    // The name of the preset a device's instrument is, or undefined once a knob has moved it.
    presetName(device = view.device): string | undefined {
      const t = project.rack[device]
      if (!t) return undefined
      const json = JSON.stringify(t.instrument)
      return me.presets(t.instrument).find(p => JSON.stringify(p.instrument) === json)?.name
    },
    // The picked device's next (`by` 1) or previous (-1) preset, by where it is in the list.
    stepPreset(by: number) {
      const t = project.rack[view.device]
      if (!t) return
      const list = me.presets(t.instrument)
      if (!list.length) return
      const name = me.presetName()
      const at = list.findIndex(p => p.name === name)
      const next = list[(((at < 0 ? (by > 0 ? -1 : 0) : at) + by) % list.length + list.length) % list.length]!
      const d = view.device
      me.edit(p => loadPreset(p, d, next))
    },
    // The picked device's instrument kept under `name` among the saved presets.
    savePreset(name: string) {
      const t = project.rack[view.device]
      const clean = name.trim()
      if (!t || !clean) return
      const list = me.saved
      const kept: Preset = { name: clean, instrument: structuredClone(t.instrument) }
      const at = list.findIndex(p => p.name === clean && p.instrument.is === t.instrument.is)
      const next = at >= 0 ? list.map((p, i) => (i === at ? kept : p)) : [...list, kept]
      const k = keeping()
      k.store.set(k.key, next as unknown as Value)
    },
    // A control of the picked device's faceplate moved: its instrument put in whole, which audiodaw
    // hands to Tone as `instrument.set` of what changed, or makes again when its voice changed.
    setInstrument(instrument: Instrument) {
      const d = view.device
      me.change(p => putInstrument(p, d, instrument))
    },
    // The pad of a drum kit whose options the faceplate shows, by its note.
    pickPad(note: string) {
      view.pad = note
    },

    // ---- buses ----
    addBus() {
      let k = Object.keys(project.buses).length + 1
      while (Object.hasOwn(project.buses, `bus${k}`)) k++
      me.edit(p => addBus(p, `bus${k}`, { volume: 0, pan: 0, effects: [] }))
    },
    removeBus(name: string) {
      me.edit(p => removeBus(p, name))
    },

    // A meter's level in dBFS, Tone.Meter's; -Infinity until the song has loaded.
    meter(target: Target): number {
      if (!audio || !me.ready) return -Infinity
      return audio.meter(target).getValue() as number
    },

    // ---- drawing, for the screens ----
    // The panel `name` at `box`, its silver ground under everything shown on it.
    chassis(name: string, box: readonly [number, number, number, number]) {
      const d = me.dom
      d.panel(name, [box[0], box[1], box[2], box[3]])
      me.el(name, 'ground', 'st-ground', [0, 0, box[2], box[3]])
    },
    // A `div` of class `cls` for `key` on `panel`, at `box` in the panel's units, holding `text`
    // when given; `tag` makes another element.
    el<T extends HTMLElement = HTMLDivElement>(panel: string, key: string, cls: string, box: [number, number, number, number], text?: string, tag = 'div'): T {
      const d = me.dom
      const e = d.show(panel, key, () => {
        const made = d.root!.ownerDocument.createElement(tag)
        made.className = cls
        return made
      }) as T
      const s = e.style
      if (s.left !== `${box[0]}px`) s.left = `${box[0]}px`
      if (s.top !== `${box[1]}px`) s.top = `${box[1]}px`
      if (s.width !== `${box[2]}px`) s.width = `${box[2]}px`
      if (s.height !== `${box[3]}px`) s.height = `${box[3]}px`
      if (text !== undefined && e.textContent !== text) e.textContent = text
      return e
    },
    // A name typed in place: while `view.editing` is `key`, a text input at `box` on `panel` holding
    // `value` when it opened, focused and selected. Enter or a press elsewhere (its blur) hands what
    // was typed to `commit`, which closes it when it takes it (true); Escape closes it unchanged.
    // Keys typed into it reach no shortcut and play no note (renderdom keeps them). Hands back the
    // input; draws nothing and hands back undefined while another name, or none, is being typed.
    field(panel: string, key: string, box: [number, number, number, number], value: string, commit: (typed: string) => boolean): HTMLInputElement | undefined {
      if (view.editing !== key) return undefined
      const input = me.el<HTMLInputElement>(panel, `field:${key}`, 'st-input', box, undefined, 'input')
      if (input.dataset.made !== key) {
        input.dataset.made = key
        input.value = value
        input.setAttribute('aria-label', 'Name')
        input.onkeydown = e => {
          if (e.key === 'Enter') {
            if (commit(input.value)) view.editing = undefined
          } else if (e.key === 'Escape') view.editing = undefined
        }
        input.onblur = () => {
          if (view.editing === key && commit(input.value)) view.editing = undefined
        }
        input.onpointerdown = e => e.stopPropagation()
        input.focus()
        input.select()
      }
      return input
    },
    // Starts typing the name `key` (`field`).
    rename(key: string) {
      view.editing = key
    },
    // The picked track's patterns and the picked one's length, a row of controls at `at` on `panel`
    // (the roll's): PATTERN ◀ its name ▶ steps through the track's patterns, + adds an empty one a bar
    // long, × takes it away with every clip
    // of it; LENGTH ◀ its length in bars ▶ shortens or lengthens it by `step` ticks, every clip of it
    // with it. Each change is one step of undo.
    patternBar(panel: string, at: [number, number], step: number) {
      const [x, y] = at
      const pat = me.lane()
      const name = view.pattern
      me.el(panel, 'pattern:label', 'st-sub', [x, y + 8, 56, 12], 'PATTERN').style.position = 'absolute'
      me.kit.button(panel, 'pattern-', { at: [x + 58, y], size: [24, 28], label: '◀', onPress: () => me.stepPattern(-1) })
      me.kit.lcd(panel, 'pattern', { at: [x + 84, y], size: [120, 28], lines: [pat ? name.toUpperCase() : '—'] })
      me.kit.button(panel, 'pattern+', { at: [x + 206, y], size: [24, 28], label: '▶', onPress: () => me.stepPattern(1) })
      me.kit.button(panel, 'pattern:add', { at: [x + 236, y], size: [28, 28], label: '+', onPress: () => me.addPattern() })
      me.kit.button(panel, 'pattern:remove', { at: [x + 266, y], size: [28, 28], label: '×', onPress: () => me.removePattern() })
      me.el(panel, 'length:label', 'st-sub', [x + 306, y + 8, 48, 12], 'LENGTH').style.position = 'absolute'
      me.kit.button(panel, 'length-', { at: [x + 356, y], size: [24, 28], label: '◀', onPress: () => pat && me.setPatternLength(pat.length - step) })
      const bars = pat ? Math.round((playedOf(pat) / BAR) * 100) / 100 : 0
      me.kit.lcd(panel, 'length', { at: [x + 382, y], size: [110, 28], lines: [pat ? `${bars} BAR${bars === 1 ? '' : 'S'}` : '—'] })
      me.kit.button(panel, 'length+', { at: [x + 494, y], size: [24, 28], label: '▶', onPress: () => pat && me.setPatternLength(pat.length + step) })
    },

    // The bar along the top of a screen or a faceplate: an LED in `accent`, the name, the sub-line,
    // and under it the accent band.
    top(panel: string, width: number, name: string, sub: string, accent: string) {
      const bar = me.el(panel, 'top', 'st-top', [12, 12, width - 24, 40])
      if (!bar.firstChild) {
        const doc = bar.ownerDocument
        const led = doc.createElement('div')
        led.className = 'rd-led rd-on'
        const n = doc.createElement('span')
        n.className = 'st-name'
        const s = doc.createElement('span')
        s.className = 'st-sub'
        bar.append(led, n, s)
      }
      const [led, n, s] = [...bar.children] as HTMLElement[]
      if (led!.style.getPropertyValue('--accent') !== accent) led!.style.setProperty('--accent', accent)
      if (n!.textContent !== name) n!.textContent = name
      if (s!.textContent !== sub) s!.textContent = sub
      const band = me.el(panel, 'band', 'st-band', [12, 54, width - 24, 3])
      if (band.dataset.accent !== accent) {
        band.dataset.accent = accent
        band.style.background = accent
      }
    },

    tick(plugins: Plugins) {
      dom = plugins.renderdom as Renderdom
      audio = plugins.audiodaw as Audio
      store = plugins.store as Store
      if (!kit) {
        names = def(plugins.wire, 'player').studio as Names
        shipped = json(plugins.wire, names.presets) as Preset[]
        // Each song of the file opens as a copy of its project, so an edit never reaches the file's.
        const written = json(plugins.wire, names.songs) as { name: string; project: Project }[]
        list = [...songs, ...written.map(w => ({ name: w.name, make: () => structuredClone(w.project) }))]
        kit = controls(dom)
        dom.style(CHASSIS)
        me.open(0)
        // The first song is where the page starts, no step of undo away from the empty one.
        past = []
      }
      dom.keys(k => me.keyDown(k))
      dom.keyups(k => me.keyUp(k))
      // A song opened anew, or undone or redone back to, is loaded, the cycle with it, each automated
      // knob's travel the faceplates' (`rangeOf`); any other change, tracks and devices added and
      // taken away among them, is an edit.
      if (!heard || loaded !== view.song) {
        const c = me.controls
        audio.load(project, (k, p) => rangeOf(c, k, p))
        cycled = undefined
        heard = project
        loaded = view.song
      } else if (heard !== project) {
        audio.edit(project)
        heard = project
      }
      const cycle = view.cycle && project.loop !== undefined
      if (cycle !== cycled) {
        cycled = cycle
        audio.cycle(cycle)
      }
    },
    close() {
      down.clear()
    },
  }

  fit()
  return me
}

function sameList(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}
