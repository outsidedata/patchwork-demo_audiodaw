// The piano roll's look and hands, drawn while the studio shows the roll, beside the tracks: the
// picked track's pattern as a grid of rows (pitches) across ticks, the keys down its left, the
// velocity stems under it and a scrollbar under those when the pattern is longer than the view. A
// track picked on the left shows its pattern here; a track with no pattern shows nothing.
// Every number of its layout is here. The grid, the keys and the stems are one renderdom canvas
// each, drawn again every frame; their pointers are renderdom surfaces.
//
// Hover (`hover`, `leave`): the row under the pointer and its key are lit, its key named, a ghost
// note stands where a click would land (its start down to the grain, the length the last note drawn
// took), and the cursor is `ew-resize`
// over either edge of a note (`EDGE` pixels in from each end), `move` over its body and
// `crosshair` over empty grid.
//
// The grid's hands:
//   a press on a note's edge resizes it by the grain; the left edge moves its start and keeps its
//       end. The note's new length is the one the next note drawn takes.
//   a press on a note's body picks it (Shift adds or takes it away and drags nothing) and drags
//       every picked note together by the grain and by rows, clamped to the pattern.
//   a press on empty grid draws a note there, the last length long, and the drag grows it to the
//       pointer by the grain; with Alt held it draws a box instead, and the notes it touches are
//       picked (Shift adds them to what was picked). Either way the step clicked is where a paste
//       goes.
//   the right button on a note takes it away.
//   the wheel scrolls the rows; Shift+wheel scrolls time; Mod+wheel zooms time about the pointer.
// A note drawn, moved or resized over another of its pitch shortens the earlier one (`overlaps`);
// moved or resized with Alt held, the overlap is kept, which is how a slide is written.
// Every press that changes the pattern, from its first change to its letting go, is one step of undo.
//
// The stems: a press or a drag there sets the velocity, Tone's, from 0 at the bottom to 1 at the top,
// of every picked note, or with none picked, of every note starting in the grain under the pointer.
//
// A note is audiodaw's, `{ time, duration, note, velocity }` in ticks, its row its MIDI number
// (`row`) and a row's note Tone's name of it (`noteOf`).
//
// The playhead is drawn where the song is in the picked pattern's clip, playing and stopped (where
// play will start). While playing, the view turns a page whenever the playhead runs off it.
//
// The view's `low` (the lowest row shown), `from` (the first tick shown) and `zoom` (pixels a tick)
// are kept to the pattern and the room past its end (`roomOf`, where its end is dragged out into):
// `low` from 0 to the top row less the rows shown, `from` from 0 to that less the ticks shown, `zoom`
// from all of it across the grid to `MOST`.
//
// An automation track's pattern is edited here too, across the grid and the stems' height together:
// each automation note a shaded box from its time for its duration, its line from 0 at the bottom to
// 1 at the top through its points, each point a handle with the shape it is reached by named beside
// it. A knob Tone only sets draws its line as the steps it takes, one each 16th of the pattern. Down
// the left, the knob's own units at 0, a half and 1, and SWEEP or 16THS.
//   a press on empty ground draws a note there, the last length long, level at the value pressed, and
//       the drag grows it by the grain.
//   a press on a note's body drags it along by the grain; two presses there put a point where pressed.
//   a press on a note's right edge sets its length by the grain, its points stretching with it.
//   a press on a point drags it, in time between its neighbours and in value; the first and the last
//       move in value only. Two presses on a point between them take it away.
//   the right button on a point steps its shape (linear, exp, step); on a note's body, takes the note
//       away.
//
// The pattern's end is a bar across the grid at its `length`: a press on it and a drag sets where
// the pattern ends by the grain, every clip of it with it, one step of undo. Ticks a clip of it does
// not play, before its `from` and past its end, are shaded, and the notes kept there drawn faint.
// Over the grid runs the studio's pattern bar (`patternBar`): the track's patterns, a new one, one
// taken away, and the picked one's length stepped by the grain.
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Mods } from '#plugins/renderdom/renderdom.plugin.ts'
import {
  addAutomationNote, addPoint, automationNote, fromOf, level, moveAutomationNote, movePoint, noteTrack, removeAutomationNote, removePoint, valueAt,
  type AutomationNote, type AutomationPattern, type Knob, type Lane, type Note, type Pattern, type Shape,
} from '#plugins/audiodaw/audiodaw.sim.ts'
import { LAYOUT, VELOCITY, withPattern, type Studio } from './plugins/studio/studio.plugin.ts'
import { BAR, BEAT, GRAINS, TOP, boxed, end, floorTo, noteOf, overlaps, roundTo, row, shift } from './plugins/studio/edits.ts'

const P = 'roll'
const [, , W, H] = LAYOUT.view
// The pattern bar and the grain along the top; the grid's box in the panel, the keys' column left of
// it, the stems' lane and the scrollbar under it.
const BAR_Y = 12
const BAR_H = 28
const KEYS_X = 0
const KEYS_W = 44
const GRID_X = KEYS_X + KEYS_W
const GRID_Y = BAR_Y + BAR_H + 8
const GRID_W = W - GRID_X - 12
const LANE_H = 48
const SCROLL_H = 10
const GAP = 4
const GRID_H = H - GRID_Y - GAP - LANE_H - GAP - SCROLL_H - 12
const LANE_Y = GRID_Y + GRID_H + GAP
const SCROLL_Y = LANE_Y + LANE_H + GAP
// A row's height; the pixels from a note's end that count as its edge; the most pixels a tick.
export const ROW_H = 12
export const ROWS = Math.floor(GRID_H / ROW_H)
export const EDGE = 4
export const MOST = 8
// Rows a wheel's notch scrolls, ticks a notch scrolls per pixel shown, and how much a notch zooms.
const NOTCH = 100
const ZOOM_STEP = 1.25
export const geometry = { GRID_X, GRID_Y, GRID_W, GRID_H, LANE_Y, LANE_H, SCROLL_Y, KEYS_X, KEYS_W }

const BLACK = [1, 3, 6, 8, 10]
const C = {
  white: '#e9ecef',
  black: '#d4d9df',
  line: '#b7bec7',
  beat: '#9aa1ab',
  bar: '#5d6571',
  lit: '#f7f8fa',
  ink: '#232831',
  ghost: 'rgba(35,40,49,0.45)',
  pick: '#232831',
  head: '#ef6a5a',
  cue: 'rgba(239,106,90,0.5)',
  box: 'rgba(35,40,49,0.12)',
  key: '#f4f5f7',
  keyBlack: '#2a3039',
  stem: '#3b4250',
}

// A press under way: drawing a note, moving the picked ones, resizing one, a box, or the stems.
type Drag =
  | { kind: 'draw'; index: number; start: number }
  | { kind: 'move'; base: Pattern; t0: number; r0: number; picked: number[] }
  | { kind: 'resize'; base: Pattern; index: number; edge: 'left' | 'right' }
  | { kind: 'box'; t0: number; r0: number; t1: number; r1: number; was: number[] }
  | { kind: 'stems' }
  | { kind: 'end' }
let drag: Drag | undefined

// The room shown past a pattern's end: a quarter of it in whole beats, a beat at least.
export const roomOf = (length: number) => Math.max(BEAT, Math.round(length / 4 / BEAT) * BEAT)
// The ticks the roll can show: the pattern and the room past its end.
const viewLength = (pat: Lane | undefined) => (pat ? pat.length + roomOf(pat.length) : BAR)

export function setup() {}

// The tick and row at a point of the grid, and the note there with which part of it.
function at(s: Studio, x: number, y: number) {
  const v = s.view
  const tick = v.from + x / v.zoom
  const r = v.low + Math.floor((GRID_H - y) / ROW_H)
  const pat = s.pattern()
  let index = -1
  let over: 'edge' | 'body' | 'empty' = 'empty'
  let edge: 'left' | 'right' = 'right'
  if (pat) {
    // The latest note under the point is the one drawn over the rest.
    for (let i = pat.notes.length - 1; i >= 0; i--) {
      const n = pat.notes[i]!
      if (row(n) !== r) continue
      const x0 = (n.time - v.from) * v.zoom, x1 = (end(n) - v.from) * v.zoom
      if (x < x0 || x > x1) continue
      index = i
      const near = Math.min(EDGE, (x1 - x0) / 3)
      if (x - x0 <= near) [over, edge] = ['edge', 'left']
      else if (x1 - x <= near) [over, edge] = ['edge', 'right']
      else over = 'body'
      break
    }
  }
  return { tick, row: r, index, over, edge }
}

const grain = (s: Studio) => GRAINS[s.view.grain]!.ticks

// While playing, the view turns a page when the playhead runs off either side of it, so the notes
// sounding are shown; never while a press is under way, which would move them under the pointer.
function follow(s: Studio) {
  if (!s.playing || drag || scrolling) return
  const head = s.patternTick()
  if (head === undefined) return
  const v = s.view
  const shown = GRID_W / v.zoom
  if (head < v.from || head >= v.from + shown) v.from = head
}

// The view kept to the pattern.
function keep(s: Studio) {
  const v = s.view
  const length = viewLength(s.lane())
  const least = GRID_W / length
  if (!(v.zoom >= least)) v.zoom = least
  v.zoom = Math.min(MOST, v.zoom)
  v.from = Math.max(0, Math.min(length - GRID_W / v.zoom, v.from))
  v.low = Math.max(0, Math.min(TOP + 1 - ROWS, Math.round(v.low)))
}

// Navigation: the wheel over the grid.
export function wheel(s: Studio, x: number, mods: Mods, dx: number, dy: number) {
  const v = s.view
  const d = Math.abs(dy) >= Math.abs(dx) ? dy : dx
  if (!d) return
  if (mods.mod) {
    const t = v.from + x / v.zoom
    v.zoom = v.zoom * (d < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)
    keep(s)
    v.from = t - x / v.zoom
  } else if (mods.shift || (dx && Math.abs(dx) > Math.abs(dy))) v.from += (d / NOTCH) * (GRID_W / v.zoom) * 0.1
  else v.low += d < 0 ? 3 : -3
  keep(s)
}

function grid(s: Studio) {
  const v = s.view
  const g = grain(s)
  const hands = {
    hover(x: number, y: number) {
      const a = at(s, x, y)
      hoverX = x
      v.hover = { row: a.row, tick: a.tick, over: a.over }
    },
    leave() {
      hoverX = undefined
      v.hover = undefined
    },
    down(x: number, y: number, mods: Mods) {
      const a = at(s, x, y)
      v.hover = undefined
      const pat = s.pattern()
      if (pat && nearEnd(s, x)) {
        s.begin()
        drag = { kind: 'end' }
        return
      }
      if (pat && a.index >= 0) {
        if (a.over === 'edge') {
          s.begin()
          drag = { kind: 'resize', base: pat, index: a.index, edge: a.edge }
          if (!v.notes.includes(a.index)) v.notes = [a.index]
          return
        }
        if (mods.shift) {
          v.notes = v.notes.includes(a.index) ? v.notes.filter(i => i !== a.index) : [...v.notes, a.index]
          return
        }
        if (!v.notes.includes(a.index)) v.notes = [a.index]
        s.begin()
        drag = { kind: 'move', base: pat, t0: a.tick, r0: a.row, picked: [...v.notes] }
        return
      }
      const step = Math.max(0, floorTo(a.tick, g))
      v.step = step
      if (mods.alt) {
        drag = { kind: 'box', t0: a.tick, r0: a.row, t1: a.tick, r1: a.row, was: mods.shift ? [...v.notes] : [] }
        if (!mods.shift) v.notes = []
        return
      }
      if (a.row < 0 || a.row > TOP || !pat || step >= pat.length) return
      s.begin()
      const note: Note = { time: step, duration: Math.max(1, Math.min(pat.length - step, v.last)), note: noteOf(a.row), velocity: VELOCITY }
      const index = pat.notes.length
      s.write(p => ({ pattern: { ...p, notes: [...p.notes, note] }, picked: [index] }))
      drag = { kind: 'draw', index, start: step }
    },
    move(x: number, y: number, mods: Mods) {
      if (!drag) return
      const a = at(s, x, y)
      const d = drag
      if (d.kind === 'end') {
        s.setPatternLength(Math.max(g, roundTo(a.tick, g)))
      } else if (d.kind === 'draw') {
        const pat = s.pattern()!
        const length = Math.max(g, Math.ceil((a.tick - d.start) / g) * g)
        const n = pat.notes[d.index]!
        const next = Math.max(1, Math.min(pat.length - d.start, length))
        if (n.duration === next) return
        s.write(p => ({ pattern: { ...p, notes: p.notes.map((m, i) => (i === d.index ? { ...m, duration: next } : m)) }, picked: [d.index] }))
      } else if (d.kind === 'move') {
        const dt = roundTo(a.tick - d.t0, g)
        const dr = a.row - d.r0
        s.write(() => {
          const out = shift(d.base, d.picked, dt, dr)
          return mods.alt ? out : overlaps(out.pattern, out.picked)
        })
      } else if (d.kind === 'resize') {
        const n = d.base.notes[d.index]!
        const t = Math.max(0, Math.min(d.base.length, roundTo(a.tick, g)))
        const resized = d.edge === 'right'
          ? { ...n, duration: Math.max(1, Math.min(d.base.length - n.time, t - n.time)) }
          : { ...n, time: Math.min(end(n) - 1, t), duration: end(n) - Math.min(end(n) - 1, t) }
        s.write(() => {
          const notes = d.base.notes.map((m, i) => (i === d.index ? resized : m))
          const out = { pattern: { ...d.base, notes }, picked: [d.index] }
          return mods.alt ? out : overlaps(out.pattern, out.picked)
        })
      } else if (d.kind === 'box') {
        d.t1 = a.tick
        d.r1 = a.row
        const pat = s.pattern()
        if (pat) v.notes = [...new Set([...d.was, ...boxed(pat, d.t0, d.t1, d.r0, d.r1)])]
      }
    },
    up() {
      const d = drag
      drag = undefined
      if (!d) return
      if (d.kind === 'draw') {
        const pat = s.pattern()!
        v.last = pat.notes[d.index]!.duration
        s.write(p => overlaps(p, [d.index]))
      } else if (d.kind === 'resize') {
        const pat = s.pattern()!
        const i = v.notes[0]
        if (i !== undefined && pat.notes[i]) v.last = pat.notes[i]!.duration
      }
      if (d.kind !== 'box') s.end()
    },
    menu(x: number, y: number) {
      const a = at(s, x, y)
      if (a.index < 0) return
      const i = a.index
      s.edit(p => {
        const pat = noteTrack(p, v.track).patterns[v.pattern]!
        return withPattern(p, v.track, v.pattern, { ...pat, notes: pat.notes.filter((_, j) => j !== i) })
      }, { notes: v.notes.filter(j => j !== i).map(j => (j > i ? j - 1 : j)) })
    },
    wheel(x: number, _y: number, mods: Mods, dx: number, dy: number) {
      wheel(s, x, mods, dx, dy)
    },
  }
  s.dom.surface(P, 'grid:hands', [GRID_X, GRID_Y, GRID_W, GRID_H], hands)
  const onEnd = drag?.kind === 'end' || (!drag && hoverX !== undefined && nearEnd(s, hoverX))
  const over = drag?.kind === 'move' ? 'move' : drag?.kind === 'resize' || onEnd ? 'edge' : v.hover?.over
  s.dom.cursor(P, 'grid:hands', over === 'edge' ? 'ew-resize' : over === 'body' || over === 'move' ? 'move' : 'crosshair')
}

// The pointer's place along the grid while it hovers there.
let hoverX: number | undefined
// Whether `x` along the grid is on the pattern's end.
function nearEnd(s: Studio, x: number): boolean {
  const pat = s.lane()
  if (!pat) return false
  const v = s.view
  return Math.abs(x - (pat.length - v.from) * v.zoom) <= EDGE
}

function stems(s: Studio) {
  const v = s.view
  const set = (x: number, y: number) => {
    const pat = s.pattern()
    if (!pat) return
    const velocity = Math.max(0, Math.min(1, Math.round((1 - y / LANE_H) * 100) / 100))
    const g = grain(s)
    const cell = floorTo(v.from + x / v.zoom, g)
    const which = v.notes.length ? new Set(v.notes) : new Set(pat.notes.map((n, i) => (floorTo(n.time, g) === cell ? i : -1)).filter(i => i >= 0))
    if (!which.size) return
    s.write(p => ({ pattern: { ...p, notes: p.notes.map((n, i) => (which.has(i) ? { ...n, velocity } : n)) }, picked: v.notes }))
  }
  s.dom.surface(P, 'stems:hands', [GRID_X, LANE_Y, GRID_W, LANE_H], {
    down(x, y) {
      s.begin()
      drag = { kind: 'stems' }
      set(x, y)
    },
    move(x, y) {
      if (drag?.kind === 'stems') set(x, y)
    },
    up() {
      if (drag?.kind !== 'stems') return
      drag = undefined
      s.end()
    },
  })
  s.dom.cursor(P, 'stems:hands', 'ns-resize')
}

function scrollbar(s: Studio, pat: Lane) {
  const v = s.view
  const shown = GRID_W / v.zoom
  const all = viewLength(pat)
  if (shown >= all) return
  s.el(P, 'scroll', 'st-scroll', [GRID_X, SCROLL_Y, GRID_W, SCROLL_H])
  const w = Math.max(16, (shown / all) * GRID_W)
  const x = (v.from / (all - shown)) * (GRID_W - w)
  s.el(P, 'scroll:thumb', 'st-thumb', [GRID_X + x, SCROLL_Y + 1, w, SCROLL_H - 2])
  s.dom.surface(P, 'scroll:hands', [GRID_X, SCROLL_Y, GRID_W, SCROLL_H], {
    down(px) {
      // A press off the thumb puts the thumb's middle there; then the drag moves it.
      if (px < x || px > x + w) v.from = ((px - w / 2) / (GRID_W - w)) * (all - shown)
      keep(s)
      scrolling = { x: px, from: v.from }
    },
    move(px) {
      const g = scrolling
      if (!g) return
      v.from = g.from + ((px - g.x) / (GRID_W - w)) * (all - shown)
      keep(s)
    },
    up() {
      scrolling = undefined
    },
  })
  s.dom.cursor(P, 'scroll:hands', 'grab')
}
// The scrollbar's drag under way: where it was pressed and the view's first tick then.
let scrolling: { x: number; from: number } | undefined

function draw(s: Studio, pat: Pattern, accent: string) {
  const v = s.view
  const g = grain(s)
  const ctx = s.dom.canvas(P, 'grid', [GRID_X, GRID_Y, GRID_W, GRID_H])
  const x = (t: number) => (t - v.from) * v.zoom
  const y = (r: number) => GRID_H - (r - v.low + 1) * ROW_H
  for (let r = v.low; r < v.low + ROWS; r++) {
    ctx.fillStyle = v.hover?.row === r ? C.lit : BLACK.includes(r % 12) ? C.black : C.white
    ctx.fillRect(0, y(r), GRID_W, ROW_H)
    ctx.fillStyle = C.line
    ctx.fillRect(0, y(r) + ROW_H - 0.5, GRID_W, 0.5)
  }
  const length = pat.length
  const shown = GRID_W / v.zoom
  const first = Math.floor(v.from / g) * g
  for (let t = first; t <= Math.min(viewLength(pat), v.from + shown); t += g) {
    if (g * v.zoom < 4 && t % BEAT) continue
    ctx.fillStyle = t % BAR === 0 ? C.bar : t % BEAT === 0 ? C.beat : C.line
    ctx.fillRect(x(t), 0, t % BAR === 0 ? 1 : 0.5, GRID_H)
  }
  // What a clip does not play: before the pattern's `from` and past its end, shaded.
  const start = fromOf(pat)
  ctx.fillStyle = C.box
  if (start > v.from) ctx.fillRect(0, 0, x(start), GRID_H)
  if (length < v.from + shown) ctx.fillRect(x(length), 0, GRID_W - x(length), GRID_H)
  const picked = new Set(v.notes)
  pat.notes.forEach((n, i) => {
    const r = row(n)
    if (r < v.low || r >= v.low + ROWS) return
    const nx = x(n.time), w = Math.max(1, n.duration * v.zoom)
    if (nx + w < 0 || nx > GRID_W) return
    ctx.fillStyle = accent
    const kept = n.time < start || n.time >= length
    ctx.globalAlpha = kept ? 0.2 : 0.45 + 0.55 * n.velocity
    ctx.fillRect(nx, y(r) + 1, w, ROW_H - 2)
    ctx.globalAlpha = 1
    ctx.strokeStyle = picked.has(i) ? C.pick : C.bar
    ctx.lineWidth = picked.has(i) ? 2 : 1
    ctx.strokeRect(nx + 0.5, y(r) + 1.5, w - 1, ROW_H - 3)
  })
  // The ghost where a click would land.
  if (v.hover && !drag && v.hover.over === 'empty' && v.hover.row >= 0 && v.hover.row <= TOP) {
    const t = floorTo(v.hover.tick, g)
    ctx.strokeStyle = C.ghost
    ctx.lineWidth = 1
    ctx.setLineDash([3, 2])
    ctx.strokeRect(x(t) + 0.5, y(v.hover.row) + 1.5, Math.max(1, v.last * v.zoom) - 1, ROW_H - 3)
    ctx.setLineDash([])
  }
  if (drag?.kind === 'box') {
    const [t0, t1] = [Math.min(drag.t0, drag.t1), Math.max(drag.t0, drag.t1)]
    const [r0, r1] = [Math.min(drag.r0, drag.r1), Math.max(drag.r0, drag.r1)]
    ctx.fillStyle = C.box
    ctx.fillRect(x(t0), y(r1), (t1 - t0) * v.zoom, (r1 - r0 + 1) * ROW_H)
    ctx.strokeStyle = C.ink
    ctx.strokeRect(x(t0) + 0.5, y(r1) + 0.5, (t1 - t0) * v.zoom, (r1 - r0 + 1) * ROW_H)
  }
  // The pattern's end, a bar dragged to set it.
  ctx.fillStyle = C.ink
  ctx.fillRect(x(length) - 1.5, 0, 3, GRID_H)
  const head = s.patternTick()
  if (head !== undefined) {
    ctx.fillStyle = s.playing ? C.head : C.cue
    ctx.fillRect(x(head), 0, 1.5, GRID_H)
  }
}

function keysColumn(s: Studio, accent: string) {
  const v = s.view
  const ctx = s.dom.canvas(P, 'keys', [KEYS_X, GRID_Y, KEYS_W, GRID_H])
  const y = (r: number) => GRID_H - (r - v.low + 1) * ROW_H
  ctx.font = "8px 'Silkscreen', monospace"
  ctx.textBaseline = 'middle'
  for (let r = v.low; r < v.low + ROWS; r++) {
    const black = BLACK.includes(r % 12)
    ctx.fillStyle = v.hover?.row === r ? accent : black ? C.keyBlack : C.key
    ctx.fillRect(0, y(r), black ? KEYS_W * 0.62 : KEYS_W, ROW_H)
    ctx.fillStyle = C.line
    ctx.fillRect(0, y(r) + ROW_H - 0.5, KEYS_W, 0.5)
    if (r % 12 === 0 || v.hover?.row === r) {
      ctx.fillStyle = C.ink
      ctx.fillText(noteOf(r), KEYS_W * 0.64, y(r) + ROW_H / 2)
    }
  }
}

function stemsLane(s: Studio, pat: Pattern, accent: string) {
  const v = s.view
  const ctx = s.dom.canvas(P, 'stems', [GRID_X, LANE_Y, GRID_W, LANE_H])
  ctx.fillStyle = C.black
  ctx.fillRect(0, 0, GRID_W, LANE_H)
  const picked = new Set(v.notes)
  pat.notes.forEach((n, i) => {
    const sx = (n.time - v.from) * v.zoom
    if (sx < 0 || sx > GRID_W) return
    const h = n.velocity * (LANE_H - 4)
    ctx.fillStyle = picked.has(i) ? C.ink : C.stem
    ctx.fillRect(sx, LANE_H - h, 2, h)
    ctx.fillStyle = accent
    ctx.fillRect(sx - 2, LANE_H - h - 2, 6, 3)
  })
}

// ---------- automation ----------
// The picked automation track's pattern across the grid and the stems' height together, 0 at the
// bottom and 1 at the top, the knob's own units at 0, a half and 1 down the left.

const A_H = GRID_H + GAP + LANE_H
// Pixels from a point that take hold of it; a press again within this many ms is a double press.
const HANDLE = 6
const TWICE = 350
const SHAPES: Shape[] = ['linear', 'exp', 'step']
const SHAPE_MARK: Record<Shape, string> = { linear: 'LIN', exp: 'EXP', step: 'STEP' }

// A press under way on the automation: moving a note, setting its length, moving a point, drawing a
// new note, or the pattern's end.
type AutoDrag =
  | { kind: 'move'; index: number; base: AutomationNote; t0: number }
  | { kind: 'length'; index: number; base: AutomationNote }
  | { kind: 'point'; index: number; point: number }
  | { kind: 'draw'; index: number; start: number }
  | { kind: 'end' }
let autoDrag: AutoDrag | undefined
// The last press, for a double press on the same note or point.
let pressed: { index: number; point: number; at: number } | undefined

const yOfValue = (v: number) => A_H - 6 - v * (A_H - 12)
const valueOfY = (y: number) => Math.max(0, Math.min(1, Math.round(((A_H - 6 - y) / (A_H - 12)) * 1000) / 1000))

// The tick and value at a point, and the automation note there: one of its points within `HANDLE`
// pixels, its right edge, or its body.
function autoAt(s: Studio, lane: AutomationPattern, x: number, y: number) {
  const v = s.view
  const tick = v.from + x / v.zoom
  for (let i = lane.notes.length - 1; i >= 0; i--) {
    const n = lane.notes[i]!
    const x0 = (n.time - v.from) * v.zoom, x1 = (n.time + n.duration - v.from) * v.zoom
    const point = n.points.findIndex(q => Math.hypot((n.time + q.at - v.from) * v.zoom - x, yOfValue(q.value) - y) <= HANDLE)
    if (point >= 0) return { tick, value: valueOfY(y), index: i, point, over: 'point' as const }
    if (x < x0 || x > x1) continue
    return { tick, value: valueOfY(y), index: i, point: -1, over: x1 - x <= EDGE ? ('edge' as const) : ('body' as const) }
  }
  return { tick, value: valueOfY(y), index: -1, point: -1, over: 'empty' as const }
}

function autoDraw(s: Studio, lane: AutomationPattern, accent: string, steps: boolean) {
  const v = s.view
  const g = grain(s)
  const ctx = s.dom.canvas(P, 'auto', [GRID_X, GRID_Y, GRID_W, A_H])
  const x = (t: number) => (t - v.from) * v.zoom
  ctx.fillStyle = C.white
  ctx.fillRect(0, 0, GRID_W, A_H)
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    ctx.fillStyle = f === 0.5 ? C.beat : C.line
    ctx.fillRect(0, yOfValue(f), GRID_W, 0.5)
  }
  const shown = GRID_W / v.zoom
  for (let t = Math.floor(v.from / g) * g; t <= Math.min(viewLength(lane), v.from + shown); t += g) {
    if (g * v.zoom < 4 && t % BEAT) continue
    ctx.fillStyle = t % BAR === 0 ? C.bar : t % BEAT === 0 ? C.beat : C.line
    ctx.fillRect(x(t), 0, t % BAR === 0 ? 1 : 0.5, A_H)
  }
  const start = fromOf(lane)
  ctx.fillStyle = C.box
  if (start > v.from) ctx.fillRect(0, 0, x(start), A_H)
  if (lane.length < v.from + shown) ctx.fillRect(x(lane.length), 0, GRID_W - x(lane.length), A_H)
  ctx.font = "8px 'Silkscreen', monospace"
  ctx.textBaseline = 'bottom'
  const sixteenth = BEAT / 4
  lane.notes.forEach(n => {
    const x0 = x(n.time), x1 = x(n.time + n.duration)
    if (x1 < 0 || x0 > GRID_W) return
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.18
    ctx.fillRect(x0, 0, x1 - x0, A_H)
    ctx.globalAlpha = 1
    ctx.strokeStyle = C.bar
    ctx.lineWidth = 1
    ctx.strokeRect(x0 + 0.5, 0.5, x1 - x0 - 1, A_H - 1)
    // Its line: as the knob sweeps, or as the steps it is set on, each 16th of the pattern.
    ctx.beginPath()
    if (steps) {
      const at = [0]
      for (let k = Math.ceil((n.time + 1) / sixteenth) * sixteenth; k < n.time + n.duration; k += sixteenth) at.push(k - n.time)
      at.forEach((a, j) => {
        const value = valueAt(n, a)
        if (j === 0) ctx.moveTo(x(n.time), yOfValue(value))
        else ctx.lineTo(x(n.time + a), yOfValue(value))
        ctx.lineTo(x(n.time + (at[j + 1] ?? n.duration)), yOfValue(value))
      })
    } else {
      ctx.moveTo(x0, yOfValue(valueAt(n, 0)))
      for (let px = 2; px < x1 - x0; px += 2) ctx.lineTo(x0 + px, yOfValue(valueAt(n, px / v.zoom)))
      ctx.lineTo(x1, yOfValue(valueAt(n, n.duration)))
    }
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 2
    ctx.stroke()
    // Its points, each a handle, the shape it is reached by named beside it.
    n.points.forEach((q, j) => {
      const px = x(n.time + q.at), py = yOfValue(q.value)
      ctx.fillStyle = accent
      ctx.fillRect(px - 4, py - 4, 8, 8)
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 1.5
      ctx.strokeRect(px - 4, py - 4, 8, 8)
      if (j > 0) {
        ctx.fillStyle = C.ink
        ctx.fillText(SHAPE_MARK[q.shape], px + 6, py - 4)
      }
    })
  })
  ctx.fillStyle = C.ink
  ctx.fillRect(x(lane.length) - 1.5, 0, 3, A_H)
  const head = s.patternTick()
  if (head !== undefined) {
    ctx.fillStyle = s.playing ? C.head : C.cue
    ctx.fillRect(x(head), 0, 1.5, A_H)
  }
}

// The knob's own units at 0, a half and 1, down the keys' column, and whether it sweeps or steps.
function autoScale(s: Studio, knob: Knob | undefined, steps: boolean) {
  const ctx = s.dom.canvas(P, 'auto:scale', [KEYS_X, GRID_Y, KEYS_W, A_H])
  ctx.fillStyle = C.key
  ctx.fillRect(0, 0, KEYS_W, A_H)
  ctx.font = "8px 'Silkscreen', monospace"
  ctx.fillStyle = C.ink
  ctx.textBaseline = 'middle'
  const range = knob ? s.range(knob) : undefined
  for (const f of [0, 0.5, 1]) ctx.fillText(range ? shownValue(level(range, f)) : `${f}`, 3, Math.max(6, Math.min(A_H - 6, yOfValue(f))))
  ctx.textBaseline = 'top'
  ctx.fillText(steps ? '16THS' : 'SWEEP', 3, A_H / 2 - 26)
}
const shownValue = (v: number) => {
  const a = Math.abs(v)
  return a >= 1000 ? `${(v / 1000).toFixed(1)}k` : a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2)
}

function autoHands(s: Studio, lane: AutomationPattern) {
  const v = s.view
  const g = grain(s)
  const t = v.track, name = v.pattern
  const note = (i: number) => s.automation()?.notes[i]
  s.dom.surface(P, 'auto:hands', [GRID_X, GRID_Y, GRID_W, A_H], {
    hover(x) { hoverX = x },
    leave() { hoverX = undefined },
    down(x, y) {
      if (nearEnd(s, x)) {
        s.begin()
        autoDrag = { kind: 'end' }
        return
      }
      const a = autoAt(s, lane, x, y)
      const now = performance.now()
      const again = pressed && pressed.index === a.index && pressed.point === a.point && now - pressed.at <= TWICE
      pressed = { index: a.index, point: a.point, at: now }
      if (a.over === 'point') {
        const n = lane.notes[a.index]!
        // Two presses on a point between the first and the last take it away.
        if (again && a.point > 0 && a.point < n.points.length - 1) {
          pressed = undefined
          s.edit(p => removePoint(p, t, name, a.index, a.point))
          return
        }
        s.begin()
        autoDrag = { kind: 'point', index: a.index, point: a.point }
        return
      }
      if (a.over === 'edge') {
        s.begin()
        autoDrag = { kind: 'length', index: a.index, base: lane.notes[a.index]! }
        return
      }
      if (a.over === 'body') {
        const n = lane.notes[a.index]!
        // Two presses on a note's body put a point there, on the line or where pressed.
        if (again) {
          pressed = undefined
          const at = Math.round(a.tick - n.time)
          if (at > 0 && at < n.duration) s.edit(p => addPoint(p, t, name, a.index, { at, value: a.value, shape: 'linear' }))
          return
        }
        s.begin()
        autoDrag = { kind: 'move', index: a.index, base: n, t0: a.tick }
        return
      }
      // Empty: a new automation note from the grain pressed, the last length long, level at the
      // value pressed; the drag grows it to the pointer.
      const step = Math.max(0, floorTo(a.tick, g))
      if (step >= lane.length) return
      s.begin()
      const duration = Math.max(1, Math.min(lane.length - step, v.last))
      s.change(p => addAutomationNote(p, t, name, automationNote(step, duration, a.value, a.value)))
      autoDrag = { kind: 'draw', index: lane.notes.length, start: step }
    },
    move(x, y) {
      const d = autoDrag
      if (!d) return
      const tick = v.from + x / v.zoom
      if (d.kind === 'end') {
        s.setPatternLength(Math.max(g, roundTo(tick, g)))
      } else if (d.kind === 'move') {
        const time = Math.max(0, Math.min(lane.length - d.base.duration, d.base.time + roundTo(tick - d.t0, g)))
        if (note(d.index)?.time !== time) s.change(p => moveAutomationNote(p, t, name, d.index, { time }))
      } else if (d.kind === 'length' || d.kind === 'draw') {
        const n = note(d.index)
        if (!n) return
        const duration = Math.max(g, Math.min(lane.length - n.time, roundTo(tick - n.time, g)))
        if (duration !== n.duration) s.change(p => moveAutomationNote(p, t, name, d.index, { duration }))
      } else if (d.kind === 'point') {
        const n = note(d.index)
        if (!n) return
        s.change(p => movePoint(p, t, name, d.index, d.point, { at: Math.round(tick - n.time), value: valueOfY(y) }))
      }
    },
    up() {
      const d = autoDrag
      autoDrag = undefined
      if (!d) return
      if (d.kind === 'length' || d.kind === 'draw') {
        const n = note(d.index)
        if (n) v.last = n.duration
      }
      s.end()
    },
    // The right button on a point steps the shape it is reached by; on a note's body, takes the note
    // away.
    menu(x, y) {
      const a = autoAt(s, lane, x, y)
      if (a.over === 'point' && a.point > 0) {
        const q = lane.notes[a.index]!.points[a.point]!
        s.edit(p => movePoint(p, t, name, a.index, a.point, { shape: SHAPES[(SHAPES.indexOf(q.shape) + 1) % SHAPES.length]! }))
      } else if (a.over === 'body' || a.over === 'edge') s.edit(p => removeAutomationNote(p, t, name, a.index))
    },
    wheel(x, _y, mods, dx, dy) {
      wheel(s, x, mods, dx, dy)
    },
  })
  const over = autoDrag?.kind === 'move' ? 'body' : autoDrag?.kind === 'length' || (hoverX !== undefined && nearEnd(s, hoverX)) ? 'edge' : undefined
  s.dom.cursor(P, 'auto:hands', over === 'edge' ? 'ew-resize' : over === 'body' ? 'move' : 'crosshair')
}

export function tick(_row: Row, plugins: Plugins) {
  const s = plugins.studio as Studio
  if (s.view.screen !== 'roll') {
    drag = undefined
    autoDrag = undefined
    return
  }
  const v = s.view
  s.chassis(P, LAYOUT.view)
  const track = s.project.tracks[v.track]
  const lane = s.automation()
  if (track?.kind === 'automation' && lane) {
    drag = undefined
    follow(s)
    keep(s)
    s.patternBar(P, [KEYS_X, BAR_Y], grain(s))
    s.kit.switch(P, 'grain', {
      at: [W - 12 - 520, BAR_Y],
      width: 520,
      label: 'GRAIN',
      options: GRAINS.map(g => g.name),
      on: GRAINS[v.grain]!.name,
      onPick: name => (v.grain = GRAINS.findIndex(g => g.name === name)),
      gesture: { begin() {}, end() {} },
    })
    const steps = track.target ? s.glides(track.target) === false : false
    autoDraw(s, lane, track.color, steps)
    autoScale(s, track.target, steps)
    autoHands(s, lane)
    scrollbar(s, lane)
    return
  }
  autoDrag = undefined
  const pat = s.pattern()
  const t = track
  if (!pat || !t) {
    drag = undefined
    return
  }
  // Notes are drawn in their track's colour.
  const accent = t.color
  follow(s)
  keep(s)
  s.patternBar(P, [KEYS_X, BAR_Y], grain(s))
  s.kit.switch(P, 'grain', {
    at: [W - 12 - 520, BAR_Y],
    width: 520,
    label: 'GRAIN',
    options: GRAINS.map(g => g.name),
    on: GRAINS[v.grain]!.name,
    onPick: name => (v.grain = GRAINS.findIndex(g => g.name === name)),
    gesture: { begin() {}, end() {} },
  })
  draw(s, pat, accent)
  keysColumn(s, accent)
  stemsLane(s, pat, accent)
  grid(s)
  stems(s)
  scrollbar(s, pat)
}

export function remove() {
  drag = undefined
}
