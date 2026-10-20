// The transport's look: along the top of the studio, the song (◀ ▶ step through the studio's songs,
// `songs.ts`'s and the songs file's), play,
// stop (stopped already, it goes back to the start) and record, the tempo on a knob, where the song
// is (bar.beat.step, Tone's `transport.ticks`), the octave the note keys play, and the loop. Every
// number of its layout is here.
//
// The loop is the song's `loop`, Tone's loop points: LOOP turns the cycle on and off, FROM is the bar
// it starts at (◀ ▶ a bar either way) and BARS how many bars it runs (◀ ▶ a bar fewer or more), so a
// four-bar loop from bar 9 is FROM 9 and BARS 4. Each change is one step of undo.
//
// BUFFER, at the right, opens a menu over the screens below it, in a panel of its own: Tone's
// LOOKAHEAD (how far ahead of the audio each note is handed over, so a page busy that long is not
// late) and the browser's BUFFER (how much audio is mixed ahead of the speaker), each a knob, from
// what audiodaw holds when it opens; what the browser gave for the buffer it holds; and APPLY and
// CANCEL. Turning a knob changes nothing until APPLY, which stops play and makes the audio again on
// the values (`studio.retime`) and closes the menu; CANCEL, BUFFER again or Escape closes it unchanged.
// Larger values stutter less on a busy page and answer a key later.
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Timing } from '#plugins/audiodaw/audiodaw.plugin.ts'
import { knobSize } from '#plugins/renderdom/controls.ts'
import { LAYOUT, type Studio } from './plugins/studio/studio.plugin.ts'
import { BAR, where } from './plugins/studio/edits.ts'

const P = 'transport'
const MENU = 'transport:buffer'
const ACCENT = '#c9ced5'
const PLAY = '#6fd29b'
const REC = '#ef6a5a'
const LOOP = '#f0b45a'
// The loop a song with none starts from when FROM or BARS is first pressed: four bars from the first.
const FIRST = { start: 0, end: 4 * BAR }
// BUFFER's button at the right of the transport, and its menu under it, in the game's units: its
// width, a knob's place and size, the readout's and the buttons' rows.
const BUFFER_W = 96
const MENU_W = 236
const MENU_H = 168
const MENU_PAD = 12
const KNOBS_Y = 28
const KNOB_GAP = 40
const GOT_Y = 100
const ROW_H = 24
const ACT_Y = 132
// Each knob's travel in seconds, spaced by ratio.
const LOOKAHEAD: [number, number] = [0.01, 1]
const BUFFER: [number, number] = [0.005, 4]
// The values the menu shows while it is open, not yet applied.
let draft: Timing | undefined
const none = { begin() {}, end() {} }

// Seconds as a knob shows them: milliseconds under a tenth of a second.
export const seconds = (v: number) => (v < 0.1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`)

export function setup() {}

// The BUFFER menu, while open, at the transport's right edge under its button.
function bufferMenu(s: Studio, draft: Timing) {
  const kit = s.kit
  const [, , width, height] = LAYOUT.transport
  s.dom.panel(MENU, [width - 16 - MENU_W, height - 12, MENU_W, MENU_H])
  kit.module(MENU, 'box', { box: [0, 0, MENU_W, MENU_H], title: 'AUDIO BUFFER' })
  const knob = (key: string, label: string, x: number, value: number, range: [number, number], set: (v: number) => void) =>
    kit.knob(MENU, key, { at: [x, KNOBS_Y], label, value, range, log: true, reset: value, shown: seconds, accent: ACCENT, onChange: set, gesture: none })
  // The two knobs side by side, centred.
  const [kw] = knobSize()
  const kx = (MENU_W - 2 * kw - KNOB_GAP) / 2
  knob('lookahead', 'LOOKAHEAD', kx, draft.lookAhead, LOOKAHEAD, v => { draft.lookAhead = v })
  knob('buffer', 'BUFFER', kx + kw + KNOB_GAP, draft.latencyHint, BUFFER, v => { draft.latencyHint = v })
  kit.lcd(MENU, 'got', { at: [MENU_PAD, GOT_Y], size: [MENU_W - 2 * MENU_PAD, ROW_H], lines: [`BUFFER ${seconds(s.timing?.buffer ?? 0)}`] })
  const half = (MENU_W - 2 * MENU_PAD - 8) / 2
  kit.button(MENU, 'apply', { at: [MENU_PAD, ACT_Y], size: [half, ROW_H], label: 'APPLY', onPress: () => {
    s.retime({ ...draft })
    close()
  } })
  kit.button(MENU, 'cancel', { at: [MENU_PAD + half + 8, ACT_Y], size: [half, ROW_H], label: 'CANCEL', onPress: close })
}
const close = () => { draft = undefined }

export function tick(_row: Row, plugins: Plugins) {
  const s = plugins.studio as Studio
  const kit = s.kit
  const v = s.view
  const box = LAYOUT.transport
  const loop = s.project.loop ?? FIRST
  const from = Math.floor(loop.start / BAR) // the loop's first bar, from 0
  const bars = Math.max(1, Math.round((loop.end - loop.start) / BAR))
  // The loop set to start at bar `f` (from 0) and run `b` bars, neither below one; held at an edge,
  // it is no edit.
  const set = (f: number, b: number) => {
    const start = Math.max(0, f) * BAR
    const end = start + Math.max(1, b) * BAR
    if (s.project.loop && s.project.loop.start === start && s.project.loop.end === end) return
    s.edit(p => ({ ...p, loop: { start, end } }))
  }
  s.chassis(P, box)
  const songs = s.songs
  kit.button(P, 'song-', { at: [16, 20], size: [24, 24], label: '◀', onPress: () => s.open((v.song + songs.length - 1) % songs.length) })
  kit.lcd(P, 'song', { at: [44, 20], size: [150, 24], lines: [songs[v.song]!.name] })
  kit.button(P, 'song+', { at: [198, 20], size: [24, 24], label: '▶', onPress: () => s.open((v.song + 1) % songs.length) })
  kit.button(P, 'play', { at: [246, 20], size: [60, 24], label: 'PLAY', lit: s.playing, accent: PLAY, onPress: () => s.play() })
  kit.button(P, 'stop', { at: [310, 20], size: [60, 24], label: 'STOP', onPress: () => s.stop() })
  kit.button(P, 'rec', { at: [374, 20], size: [60, 24], label: 'REC', lit: v.armed, accent: REC, onPress: () => (v.armed = !v.armed) })
  kit.knob(P, 'bpm', {
    at: [450, 2],
    label: 'BPM',
    value: s.project.bpm,
    range: [20, 300],
    step: 1,
    reset: 120,
    shown: v => `${v}`,
    accent: ACCENT,
    onChange: v => s.change(p => ({ ...p, bpm: v })),
    gesture: s.gesture,
  })
  kit.lcd(P, 'pos', { at: [520, 20], size: [96, 24], lines: [where(s.playhead())] })
  kit.lcd(P, 'oct', { at: [624, 20], size: [64, 24], lines: [`OCT ${v.octave}`] })
  kit.button(P, 'loop', { at: [704, 20], size: [56, 24], label: 'LOOP', lit: v.cycle, accent: LOOP, onPress: () => s.cycleBy() })
  kit.button(P, 'from-', { at: [766, 20], size: [20, 24], label: '◀', onPress: () => set(from - 1, bars) })
  kit.lcd(P, 'from', { at: [788, 20], size: [76, 24], lines: [`FROM ${from + 1}`] })
  kit.button(P, 'from+', { at: [866, 20], size: [20, 24], label: '▶', onPress: () => set(from + 1, bars) })
  kit.button(P, 'bars-', { at: [894, 20], size: [20, 24], label: '◀', onPress: () => set(from, bars - 1) })
  kit.lcd(P, 'bars', { at: [916, 20], size: [76, 24], lines: [`BARS ${bars}`] })
  kit.button(P, 'bars+', { at: [994, 20], size: [20, 24], label: '▶', onPress: () => set(from, bars + 1) })
  kit.lcd(P, 'loop:range', { at: [1020, 20], size: [92, 24], lines: [s.project.loop ? `${where(loop.start)}–${where(loop.end)}` : '—'] })
  kit.button(P, 'buffer', { at: [box[2] - 16 - BUFFER_W, 20], size: [BUFFER_W, 24], label: 'BUFFER', lit: draft !== undefined, accent: ACCENT, onPress: () => {
    const t = s.timing
    draft = draft || !t ? undefined : { lookAhead: t.lookAhead, latencyHint: t.latencyHint }
  } })
  if (!draft) return
  s.dom.keys(k => {
    if (k.code !== 'Escape' || !draft) return false
    close()
    return true
  })
  bufferMenu(s, draft)
}

export function remove() {
  draft = undefined
}
