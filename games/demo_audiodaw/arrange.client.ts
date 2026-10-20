// The tracks and the arrangement: a row per track, its header down the left and its clips along the
// song. Every number of its layout is here; the clips are one renderdom canvas, their pointer a
// surface.
//
// The tracks' panel is drawn whatever the screen is: over the headers, ARRANGE, PIANO ROLL and MIXER
// pick the screen beside them, the one showing lit. The arrangement is that screen while ARRANGE is
// lit; the roll and the mixer take its place otherwise, and the headers stay as they are.
//
// The view. The song is shown from `view.songFrom` at `view.songZoom` pixels a tick; a zoom of 0 is
// the whole song across, one bar past the furthest of the span's end, the last clip and the loop,
// room to drag the end out into. Mod+wheel zooms about the pointer (out past the whole song is the
// whole song); over the rows Shift+wheel, or the wheel turned sideways, scrolls along it, and over
// the ruler and the span the wheel does too. Zoomed in, a scrollbar along the bottom of the
// arrangement, beside + TRACK, scrolls along it as well.
//
// The tracks. Each track is a row `ROW_H` tall, its header on the tracks' panel and its clips on the
// arrangement beside it, in a window from the song's top down to + TRACK, which stays at the bottom
// of the tracks' panel. The rows scroll in the window, headers and clips together, by
// `view.tracksTop` pixels: the wheel over the rows or anywhere on the tracks' panel, and a
// scrollbar down the left of the headers and another down the right of the song, each shown while
// the tracks are more than the window holds. What lies outside the window is cut off and takes no
// press. A track picked anywhere but by a press on its own row (`view.reveal`) is scrolled into
// view; a drag of clips, of a box or of a track's grip held past the window's top or bottom scrolls
// the tracks on under it.
//
// Along the top runs the playhead's strip: a press there, or a drag along it, puts the playhead at
// the pointer (`locate`). The playhead is drawn playing and stopped, where play will start: its mark
// in that strip and its line down through everything under it, in front of all of it and taking no
// press. Under the strip runs the song's span, a dark band from the song's start to its end (0 to its
// last clip's end until it is set): either edge drags by the bar, and dragging the end past the right
// of the view carries the view on with it. The song outside the span is shaded, its clips kept and
// not heard. Under the span runs the ruler, the song's loop (Tone's loop points) on it as a band, lit
// while cycle is on: a press let go without moving goes there (`locate`); a drag draws a new loop by
// the bar and turns cycle on.
//
// A clip is a box of its track's colour, its pattern's name along its top and the notes it plays
// drawn small: a clip plays its pattern once, from the pattern's `from` to its `length`, and is as
// long as that. Clips are picked as the roll's notes are: a press picks one (Shift adds or takes it
// away), a drag moves every picked clip together by the grain along the song and by tracks up and
// down, a clip moved onto another track carrying its pattern there; Alt held as a clip is pressed
// drags copies of the picked clips and leaves them where they were. With Alt held a drag on empty
// song draws a box and picks the clips it touches. The right edge of a clip sets where its pattern
// ends and the left edge trims its start (`resizeClip`), so every clip of that pattern follows.
// Two presses anywhere on a clip open its pattern on the roll (RENAME on its menu renames it); two
// presses on empty song make a new clip of a new empty pattern a bar
// long, at the bar pressed. A press on empty song is where a paste goes, and picks that track. The
// right button on a clip opens its menu: OPEN, RENAME, DUPLICATE, MAKE UNIQUE (a pattern of its own)
// and DELETE; a press anywhere else or Escape closes it. Hover sets the cursors: `ew-resize` on an
// edge, `move` on a body and `crosshair` on empty song. Copy, paste, duplicate, nudges and taking
// away are the studio's keys. Every change is one step of undo.
//
// An automation track's clip draws each of its automation notes as its line, 0 at the bottom of the
// clip to 1 at its top, filled under; a knob Tone only sets draws as the steps it takes, one each 16th
// of the song.
//
// A track's header: a grip in its colour down its left, dragged up or down to move the track; its
// number and name; for a note track, the device of the rack its notes go to, a list of every device
// and none, and for an automation track the knob it moves, a list of every knob of the song and none
// (a pick retargets the track); then two square buttons. They are M and S, which hold back its notes
// or let only the soloed tracks' through; an automation track has M alone. Two presses on the name swap them for C, which steps its colour
// through the palette, and ×, which takes the track away with its clips, so × never sits by S. Two
// presses on the name again, or picking another track, put M and S back. The right button on the
// name renames it. A press on the header picks the track for the rack and the roll, which shows that
// track's pattern.
// A track not heard (held back, targeting none, or into a device muted or soloed out) has its header
// and clips dimmed. + TRACK, at the bottom of the tracks' panel, adds a track of no notes targeting
// the picked track's device, and scrolls to it.
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Mods } from '#plugins/renderdom/renderdom.plugin.ts'
import { clipEnd, fromOf, patternOf, spanOf, valueAt, type AutomationPattern, type Project } from '#plugins/audiodaw/audiodaw.sim.ts'
import { sameKnob } from './plugins/studio/faceplate.ts'
import { LAYOUT, type Screen, type Studio } from './plugins/studio/studio.plugin.ts'
import { heard } from './mixer.client.ts'
import { BAR, BEAT, GRAINS, boxedClips, copyInPlace, dragClips, duplicateClips, floorTo, loopBetween, removeClips, resizeClip, roundTo, row, songEnd } from './plugins/studio/edits.ts'

const P = 'arrange'
const TRACKS = 'tracks'
const [, , W, H] = LAYOUT.view
const NAMES_X = 12
const NAMES_W = 240
// The screens, each a button over the headers, side by side across them.
const SCREENS: [Screen, string][] = [['arrange', 'ARRANGE'], ['roll', 'PIANO ROLL'], ['mixer', 'MIXER']]
const SCREEN_Y = 14
const SCREEN_H = 28
const SCREEN_GAP = 3
const SCREEN_W = (NAMES_W - (SCREENS.length - 1) * SCREEN_GAP) / SCREENS.length
const PLAY = '#6fd29b'
// The grip down the left of a header; the two square buttons at its right (M and S, or C and ×);
// the name and target between them.
const GRIP_W = 10
const MS_W = 20
const MS_GAP = 3
const BUTTONS = 2
const LABEL_X = NAMES_X + GRIP_W + 2
const LABEL_W = NAMES_W - GRIP_W - 2 - BUTTONS * (MS_W + MS_GAP)
// The tracks' scrollbars: down the left of the headers, and down the right of the song.
const BAR_W = 8
const BAR_GAP = 4
const TRACKS_BAR_X = 2
// The song, on the screen's panel beside the tracks', its scrollbar at its right.
const SONG_X = 0
const SONG_W = W - SONG_X - 12 - BAR_GAP - BAR_W
const SONG_BAR_X = SONG_X + SONG_W + BAR_GAP
// The playhead's strip along the top, the song's span strip under it, the ruler under that.
const HEAD_Y = 6
const HEAD_H = 12
const SPAN_Y = HEAD_Y + HEAD_H
const SPAN_H = 14
const RULER_Y = SPAN_Y + SPAN_H + 2
const RULER_H = 20
const SONG_Y = RULER_Y + RULER_H + 4
const SONG_H = H - SONG_Y - 12
// The + TRACK button at the bottom of the tracks' panel, and the gap over it.
const ADD_H = 24
const ADD_GAP = 4
// A track's row, its header and its clips, and the window the rows scroll in: from the song's top
// down to over + TRACK, on both panels.
export const ROW_H = 64
export const ROWS_H = SONG_H - ADD_GAP - ADD_H
// Pixels a frame the tracks scroll, the fewest and the most, while a drag holds the pointer past the
// window's top or bottom; the further past, the faster.
const CREEP_LEAST = 2
const CREEP_MOST = 16
// A wheel's line in pixels, as renderdom counts it.
const LINE = 16
export const EDGE = 6
// The band along a clip's top holding its pattern's name.
const NAME_H = 14
// Two presses within this many ms are one double press.
const TWICE = 350
// Pixels a press on the ruler moves before it is a loop drawn, not a place gone to.
const SLOP = 3
// How opaque a track not heard is drawn.
const UNHEARD = 0.35
// The bar shown past the song's end, room to drag the end out into, and the fewest shown.
const ROOM = BAR
const LEAST = BAR
// Pixels either side of a span edge that take hold of it.
const GRIP = 8
// The most pixels a tick, a wheel notch's zoom, and pixels from the view's right where a dragged span
// end carries the view on, and how far it carries it a frame.
const MOST = 0.5
const ZOOM_STEP = 1.25
const CARRY = 24
const CARRY_STEP = BEAT
// The menu's width and an item's height.
const MENU_W = 140
const ITEM_H = 22
export const geometry = { SONG_X, SONG_Y, SONG_W, SONG_H, SONG_BAR_X, TRACKS_BAR_X, BAR_W, ADD_H, ADD_GAP, RULER_Y, RULER_H, SPAN_Y, SPAN_H, NAMES_X, GRIP_W, LABEL_X, LABEL_W, MS_W, MS_GAP, NAME_H, MENU_W, ITEM_H }
const C = {
  lane: '#d4d9df',
  alt: '#cdd2d8',
  beat: '#b7bec7',
  bar: '#5d6571',
  ink: '#232831',
  head: '#ef6a5a',
  cue: 'rgba(239,106,90,0.5)',
  box: 'rgba(35,40,49,0.12)',
  text: '#232831',
  loop: '#f0b45a',
  loopOff: '#aab1ba',
  loopShade: 'rgba(240,180,90,0.14)',
  span: '#3b4250',
  spanEdge: '#e8ebef',
  outside: 'rgba(35,40,49,0.18)',
  drop: '#232831',
}
const MUTE = '#ef6a5a'
const SOLO = '#e8d36a'

// The arrangement's own stylesheet: the menu and the track's grip.
const STYLE = `
.ar-menu { position: absolute; box-sizing: border-box; background: #f4f5f7; border: 1px solid #232831; box-shadow: 2px 3px 0 rgba(0,0,0,.25); }
.ar-item { position: absolute; box-sizing: border-box; font: 9px/${ITEM_H}px 'Silkscreen', monospace; color: #232831; padding: 0 10px; cursor: pointer; white-space: nowrap; }
.ar-item:hover { background: #232831; color: #f4f5f7; }
.ar-grip { position: absolute; box-sizing: border-box; border: 1px solid #5d6571; background-image: repeating-linear-gradient(0deg, rgba(0,0,0,.25) 0 1px, transparent 1px 4px); }
`

// The tracks' scroll kept to them: from 0 to where the last track's row ends at the window's bottom.
export const keepTop = (top: number, count: number) => Math.max(0, Math.min(count * ROW_H - ROWS_H, top))
// The scroll that shows track `i` whole, moved as little as it can be from `top`.
export const revealTop = (top: number, i: number) => Math.min(i * ROW_H, Math.max(top, (i + 1) * ROW_H - ROWS_H))
// The track at `y` down the window with the tracks scrolled by `top`.
export const trackAt = (y: number, top: number) => Math.floor((y + top) / ROW_H)
// What an element at `y`, `h` tall, on the tracks' panel or the arrangement's, shows inside the
// window: a CSS clip-path cutting off what lies above or below it, and so its pointer there too;
// all of it cut when none is inside, '' when all is.
export function cutOf(y: number, h: number): string {
  const above = Math.max(0, SONG_Y - y), below = Math.max(0, y + h - (SONG_Y + ROWS_H))
  if (!above && !below) return ''
  if (above + below >= h) return 'inset(100% 0 0 0)'
  return `inset(${above}px 0 ${below}px 0)`
}
// Pixels the tracks scroll this frame while a drag holds the pointer at `y` down the window.
export function creep(y: number): number {
  const past = y < 0 ? y : y > ROWS_H ? y - ROWS_H : 0
  if (!past) return 0
  return Math.sign(past) * Math.min(CREEP_MOST, Math.max(CREEP_LEAST, Math.abs(past) / 4))
}
// The ticks of the whole song: whole bars, one past the furthest of the song's end, its last clip
// and its loop.
export const shownLength = (p: Project) => Math.max(LEAST, Math.ceil(Math.max(spanOf(p).end, songEnd(p), p.loop?.end ?? 0) / BAR) * BAR + ROOM)

type Drag =
  | { kind: 'move'; base: Project; t0: number; k0: number; picked: number[] }
  | { kind: 'resize'; base: Project; clip: number; edge: 'left' | 'right' }
  | { kind: 'box'; t0: number; k0: number; t1: number; k1: number; was: number[] }
let drag: Drag | undefined
// The last press on the song: the clip it was on (or the track, on empty song), when, and whether
// it was on a clip's name.
let pressed: { clip?: number; track: number; at: number } | undefined
// The last press on a track's name, for two presses swapping its buttons.
let named: { track: number; at: number } | undefined
// The track whose header shows C and × in place of M and S.
let tools: number | undefined
// The whole song's length when a drag began, held so the view does not rescale under the pointer.
let held: number | undefined
// A press on the ruler under way: where it went down, in pixels and ticks, and whether it has
// moved far enough to draw a loop.
let ruling: { x: number; tick: number; looping: boolean } | undefined
// An edge of the song's span being dragged, and the pointer's last place along the view.
let spanning: { edge: 'start' | 'end'; x: number } | undefined
// The span's edge the pointer is over.
let over: 'start' | 'end' | undefined
// A track's grip being dragged: the track, the place it would go, and the pointer's last place down
// the window, so a grip held past its edge goes on as the tracks scroll under it.
let moving: { from: number; to: number; y: number } | undefined
// The last point a drag on the song reached, kept for the same.
let aim: { x: number; y: number } | undefined
// A tracks' scrollbar's thumb being dragged, on either panel: where it was pressed and the scroll
// then.
let barring: { y: number; top: number } | undefined
// The song's scrollbar's thumb being dragged: where it was pressed and the view's first tick then.
let sliding: { x: number; from: number } | undefined
// The clip menu open: its clip and where it opened, in the panel's units.
let menu: { clip: number; x: number; y: number } | undefined

export function setup() {}

// The view: its first tick, its pixels a tick and the ticks it shows, kept to the song.
function viewOf(s: Studio) {
  const v = s.view
  const length = held ?? shownLength(s.project)
  const fit = SONG_W / length
  const zoom = v.songZoom > fit ? Math.min(MOST, v.songZoom) : fit
  const shown = SONG_W / zoom
  const from = zoom === fit ? 0 : Math.max(0, Math.min(length - shown, v.songFrom))
  return { from, zoom, shown, length, fit }
}

// The view zoomed by `k` about the point `x` along it, or scrolled `d` pixels.
function zoomBy(s: Studio, x: number, k: number) {
  const v = s.view
  const { from, zoom, fit } = viewOf(s)
  const tick = from + x / zoom
  const next = Math.min(MOST, zoom * k)
  if (next <= fit) {
    v.songZoom = 0
    v.songFrom = 0
    return
  }
  v.songZoom = next
  v.songFrom = Math.max(0, tick - x / next)
}
function scrollBy(s: Studio, d: number) {
  const { from, zoom, length, shown } = viewOf(s)
  s.view.songFrom = Math.max(0, Math.min(length - shown, from + d / zoom))
}
// The wheel over the ruler and the span: Mod zooms about the pointer, else it scrolls along the song.
const wheel = (s: Studio) => (x: number, _y: number, mods: Mods, dx: number, dy: number) => {
  const d = Math.abs(dy) >= Math.abs(dx) ? dy : dx
  if (!d) return
  if (mods.mod) zoomBy(s, x, d < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)
  else scrollBy(s, d)
}
// The wheel over the rows, as over the roll's grid: it scrolls the tracks; Shift, or a wheel turned
// sideways, scrolls along the song; Mod zooms about the pointer.
const rowsWheel = (s: Studio) => (x: number, y: number, mods: Mods, dx: number, dy: number) => {
  if (mods.mod || mods.shift || Math.abs(dx) > Math.abs(dy)) wheel(s)(x, y, mods, dx, dy)
  else scrollTracks(s, dy)
}
function scrollTracks(s: Studio, d: number) {
  s.view.tracksTop = keepTop(s.view.tracksTop + d, s.project.tracks.length)
}

// The song's scrollbar along the bottom of the arrangement, beside + TRACK, while the view is zoomed
// in on part of the song: its thumb as wide as the share shown, dragged to scroll along the song, or
// put where the bar is pressed.
const SONG_BAR_Y = SONG_Y + ROWS_H + ADD_GAP + (ADD_H - BAR_W) / 2
function songBar(s: Studio) {
  const { from, shown, length, zoom, fit } = viewOf(s)
  if (zoom <= fit) return
  const w = Math.max(16, (shown / length) * SONG_W)
  const x = (from / (length - shown)) * (SONG_W - w)
  s.el(P, 'song:bar', 'st-scroll', [SONG_X, SONG_BAR_Y, SONG_W, BAR_W])
  s.el(P, 'song:thumb', 'st-thumb', [SONG_X + x, SONG_BAR_Y + 1, w, BAR_W - 2])
  const to = (px: number) => Math.max(0, Math.min(length - shown, (px / (SONG_W - w)) * (length - shown)))
  s.dom.surface(P, 'song:bar:hands', [SONG_X, SONG_BAR_Y, SONG_W, BAR_W], {
    down(px) {
      menu = undefined
      // A press off the thumb puts the thumb's middle there; then the drag moves it.
      if (px < x || px > x + w) s.view.songFrom = to(px - w / 2)
      sliding = { x: px, from: s.view.songFrom }
    },
    move(px) {
      const b = sliding
      if (!b) return
      s.view.songFrom = Math.max(0, Math.min(length - shown, b.from + ((px - b.x) / (SONG_W - w)) * (length - shown)))
    },
    up() {
      sliding = undefined
    },
    wheel: wheel(s),
  })
  s.dom.cursor(P, 'song:bar:hands', 'grab')
}

// The tracks' scrollbar at `x` on `panel`, down the window, while the tracks are more than it
// shows: its thumb as long as the share shown, dragged to scroll them, or put where the bar is
// pressed. On the arrangement the wheel over it scrolls them; on the tracks' panel the panel's own
// wheel does.
function tracksBar(s: Studio, panel: string, x: number) {
  const v = s.view
  const count = s.project.tracks.length
  const all = count * ROW_H
  if (all <= ROWS_H) return
  const h = Math.max(16, (ROWS_H / all) * ROWS_H)
  const y = (v.tracksTop / (all - ROWS_H)) * (ROWS_H - h)
  s.el(panel, 'tracks:bar', 'st-scroll', [x, SONG_Y, BAR_W, ROWS_H])
  s.el(panel, 'tracks:thumb', 'st-thumb', [x + 1, SONG_Y + y, BAR_W - 2, h])
  s.dom.surface(panel, 'tracks:bar:hands', [x, SONG_Y, BAR_W, ROWS_H], {
    down(_x, py) {
      menu = undefined
      // A press off the thumb puts the thumb's middle there; then the drag moves it.
      if (py < y || py > y + h) v.tracksTop = keepTop(((py - h / 2) / (ROWS_H - h)) * (all - ROWS_H), count)
      barring = { y: py, top: v.tracksTop }
    },
    move(_x, py) {
      const b = barring
      if (!b) return
      v.tracksTop = keepTop(b.top + ((py - b.y) / (ROWS_H - h)) * (all - ROWS_H), count)
    },
    up() {
      barring = undefined
    },
    ...(panel === P ? { wheel: (_x: number, _y: number, _m: Mods, _dx: number, dy: number) => scrollTracks(s, dy) } : {}),
  })
  s.dom.cursor(panel, 'tracks:bar:hands', 'grab')
}

// An element on the tracks' panel or the arrangement's at `y`, `h` tall, cut to the window
// (`cutOf`).
function cut(e: HTMLElement, y: number, h: number) {
  const css = cutOf(y, h)
  if (e.dataset.cut === css) return
  e.dataset.cut = css
  e.style.clipPath = css
}

function at(s: Studio, x: number, y: number) {
  const p = s.project
  const { from, zoom } = viewOf(s)
  const tick = from + x / zoom
  const track = trackAt(y, s.view.tracksTop)
  let clip: number | undefined
  let part: 'edge' | 'body' | 'empty' = 'empty'
  let edge: 'left' | 'right' = 'right'
  for (let ci = p.clips.length - 1; ci >= 0; ci--) {
    const c = p.clips[ci]!
    if (c.track !== track) continue
    const x0 = (c.start - from) * zoom, x1 = (clipEnd(p, c) - from) * zoom
    if (x < x0 || x > x1) continue
    clip = ci
    if (x - x0 <= EDGE) [part, edge] = ['edge', 'left']
    else if (x1 - x <= EDGE) [part, edge] = ['edge', 'right']
    else part = 'body'
    break
  }
  return { tick, track, clip, over: part, edge }
}

// A drag on the song taken to the point `x`, `y` of the window: the picked clips moved there, a clip's
// edge set there, or the box drawn to it.
function dragTo(s: Studio, x: number, y: number) {
  const d = drag
  if (!d) return
  const v = s.view
  const g = GRAINS[v.grain]!.ticks
  const a = at(s, x, y)
  // A press that drags is no half of two presses.
  if (d.kind !== 'box') pressed = undefined
  if (d.kind === 'move') s.change(() => dragClips(d.base, d.picked, roundTo(a.tick - d.t0, g), a.track - d.k0), { clips: d.picked })
  else if (d.kind === 'resize') s.change(() => resizeClip(d.base, d.clip, d.edge, roundTo(a.tick, g)))
  else {
    d.t1 = a.tick
    d.k1 = a.track
    v.clips = [...d.was, ...boxedClips(s.project, d.t0, d.t1, d.k0, d.k1).filter(r => !d.was.includes(r))]
  }
}

function hands(s: Studio) {
  const v = s.view
  const g = GRAINS[v.grain]!.ticks
  s.dom.surface(P, 'song:hands', [SONG_X, SONG_Y, SONG_W, ROWS_H], {
    hover(x, y) {
      const a = at(s, x, y)
      v.hover = { row: a.track, tick: a.tick, over: a.over }
    },
    leave() {
      v.hover = undefined
    },
    down(x, y, mods: Mods) {
      menu = undefined
      const a = at(s, x, y)
      v.hover = undefined
      const now = performance.now()
      const twice = pressed && now - pressed.at <= TWICE && pressed.clip === a.clip && pressed.track === a.track
      if (a.clip !== undefined) {
        const clip = a.clip
        if (twice) {
          pressed = undefined
          s.openClip(clip)
          return
        }
        pressed = { clip, track: a.track, at: now }
        held = shownLength(s.project)
        if (a.over === 'edge') {
          s.begin()
          drag = { kind: 'resize', base: s.project, clip, edge: a.edge }
          return
        }
        if (mods.shift) {
          v.clips = v.clips.includes(clip) ? v.clips.filter(r => r !== clip) : [...v.clips, clip]
          return
        }
        if (!v.clips.includes(clip)) v.clips = [clip]
        s.begin()
        if (mods.alt) {
          // Copies of the picked clips, left where they are as the originals are dragged off them.
          const copied = copyInPlace(s.project, v.clips)
          s.change(() => copied.project, { clips: copied.picked })
          drag = { kind: 'move', base: copied.project, t0: a.tick, k0: a.track, picked: copied.picked }
          return
        }
        drag = { kind: 'move', base: s.project, t0: a.tick, k0: a.track, picked: [...v.clips] }
        return
      }
      if (twice && s.project.tracks[a.track]) {
        pressed = undefined
        s.newClip(a.track, Math.max(0, floorTo(a.tick, BAR)))
        return
      }
      pressed = { track: a.track, at: now }
      v.songStep = Math.max(0, floorTo(a.tick, g))
      // A track picked by pressing on its row is where it is: the tracks do not scroll under the press.
      if (s.project.tracks[a.track] && a.track !== v.track) {
        s.pick(a.track)
        v.reveal = undefined
      }
      if (mods.alt) {
        drag = { kind: 'box', t0: a.tick, k0: a.track, t1: a.tick, k1: a.track, was: mods.shift ? [...v.clips] : [] }
        if (!mods.shift) v.clips = []
        return
      }
      v.clips = []
    },
    move(x, y) {
      if (!drag) return
      aim = { x, y }
      dragTo(s, x, y)
    },
    up() {
      const d = drag
      drag = undefined
      aim = undefined
      held = undefined
      if (d && d.kind !== 'box') s.end()
    },
    menu(x, y) {
      const a = at(s, x, y)
      if (a.clip === undefined) {
        menu = undefined
        return
      }
      if (!v.clips.includes(a.clip)) v.clips = [a.clip]
      menu = { clip: a.clip, x: SONG_X + x, y: SONG_Y + y }
    },
    wheel: rowsWheel(s),
  })
  const cursor = drag?.kind === 'move' ? 'body' : drag?.kind === 'resize' ? 'edge' : v.hover?.over
  s.dom.cursor(P, 'song:hands', cursor === 'edge' ? 'ew-resize' : cursor === 'body' ? 'move' : 'crosshair')
}

// The clip menu, while open: its items, each a press.
function clipMenu(s: Studio) {
  const m = menu
  if (!m || !s.project.clips[m.clip]) {
    menu = undefined
    return
  }
  const i = m.clip
  const items: [string, () => void][] = [
    ['OPEN', () => s.openClip(i)],
    ['RENAME', () => { s.view.clips = [i]; s.rename(`clip:${i}`) }],
    ['DUPLICATE', () => {
      const out = duplicateClips(s.project, [i])
      if (out.picked.length) s.edit(() => out.project, { clips: out.picked })
    }],
    ['MAKE UNIQUE', () => s.uniqueClip(i)],
    ['DELETE', () => s.edit(p => removeClips(p, [i]), { clips: [] })],
  ]
  const x = Math.min(W - 12 - MENU_W, m.x)
  const y = Math.min(H - 12 - items.length * ITEM_H - 2, m.y)
  s.el(P, 'menu', 'ar-menu', [x, y, MENU_W, items.length * ITEM_H + 2])
  items.forEach(([label, act], k) => {
    const e = s.el(P, `menu:${label}`, 'ar-item', [x + 1, y + 1 + k * ITEM_H, MENU_W - 2, ITEM_H], label)
    e.onpointerdown = ev => {
      if (ev.button !== 0) return
      ev.stopPropagation()
      menu = undefined
      act()
    }
  })
}

// The ruler's hands: a press let go where it went down goes there; a drag draws the loop by the bar.
function rulerHands(s: Studio) {
  const { from, zoom, length } = viewOf(s)
  const tickAt = (x: number) => Math.max(0, Math.min(length, from + x / zoom))
  s.dom.surface(P, 'ruler:hands', [SONG_X, RULER_Y, SONG_W, RULER_H], {
    down(x) {
      menu = undefined
      ruling = { x, tick: tickAt(x), looping: false }
      held = length
    },
    move(x) {
      const r = ruling
      if (!r) return
      if (!r.looping && Math.abs(x - r.x) < SLOP) return
      if (!r.looping) {
        r.looping = true
        s.begin()
      }
      s.change(p => ({ ...p, loop: loopBetween(r.tick, tickAt(x), BAR, length) }))
      s.view.cycle = true
    },
    up() {
      const r = ruling
      ruling = undefined
      held = undefined
      if (!r) return
      if (r.looping) s.end()
      else s.locate(floorTo(r.tick, GRAINS[s.view.grain]!.ticks))
    },
    wheel: wheel(s),
  })
  s.dom.cursor(P, 'ruler:hands', 'text')
}

// The span's end dragged to the pointer at `x` along the view, by the bar, a bar past the start at
// least; the start likewise, a bar before the end at most.
function spanTo(s: Studio, edge: 'start' | 'end', x: number) {
  const { from, zoom } = viewOf(s)
  const { start, end } = spanOf(s.project)
  const t = roundTo(Math.max(0, from + x / zoom), BAR)
  if (edge === 'start') s.setSpan({ start: Math.min(t, end - BAR), end })
  else s.setSpan({ start, end: Math.max(t, start + BAR) })
}

// The span strip's hands: a press near an edge takes hold of it (the nearer of the two), and a drag
// moves it by the bar, one step of undo; the start never passes the end.
function spanHands(s: Studio) {
  const { from, zoom, length } = viewOf(s)
  const xOf = (t: number) => (t - from) * zoom
  const edgeAt = (x: number): 'start' | 'end' | undefined => {
    const { start, end } = spanOf(s.project)
    const a = Math.abs(x - xOf(start)), b = Math.abs(x - xOf(end))
    if (Math.min(a, b) > GRIP) return undefined
    return b <= a ? 'end' : 'start'
  }
  s.dom.surface(P, 'span:hands', [SONG_X, SPAN_Y, SONG_W, SPAN_H], {
    hover(x) {
      over = edgeAt(x)
    },
    leave() {
      over = undefined
    },
    down(x) {
      menu = undefined
      const edge = edgeAt(x)
      if (!edge) return
      spanning = { edge, x }
      held = length
      s.begin()
    },
    move(x) {
      if (!spanning) return
      spanning.x = x
      spanTo(s, spanning.edge, x)
    },
    up() {
      if (!spanning) return
      spanning = undefined
      held = undefined
      s.end()
    },
    wheel: wheel(s),
  })
  s.dom.cursor(P, 'span:hands', spanning || over ? 'ew-resize' : 'default')
}

// A span end held past the right of the view carries the view on, a beat a frame: the whole song
// shown grows under it, and a zoomed view scrolls along.
function carry(s: Studio) {
  if (spanning?.edge !== 'end' || spanning.x < SONG_W - CARRY) return
  const { end } = spanOf(s.project)
  held = Math.max(held ?? 0, end + CARRY_STEP + ROOM)
  const v = viewOf(s)
  if (v.zoom > v.fit) s.view.songFrom = Math.max(0, end + CARRY_STEP - v.shown + ROOM / 2)
  s.setSpan({ start: spanOf(s.project).start, end: end + CARRY_STEP })
}

// The span strip: the song from its start to its end as a dark band with a grip at each edge, the
// rest of the strip pale.
function spanStrip(s: Studio) {
  const { from, zoom } = viewOf(s)
  const { start, end } = spanOf(s.project)
  const x = (t: number) => (t - from) * zoom
  const c = s.dom.canvas(P, 'span', [SONG_X, SPAN_Y, SONG_W, SPAN_H])
  c.fillStyle = C.lane
  c.fillRect(0, 0, SONG_W, SPAN_H)
  c.fillStyle = C.span
  c.fillRect(x(start), 0, x(end) - x(start), SPAN_H)
  c.fillStyle = C.spanEdge
  c.fillRect(x(start), 0, 3, SPAN_H)
  c.fillRect(x(end) - 3, 0, 3, SPAN_H)
}

// The playhead's strip: a press there, or a drag along it, puts the playhead at the pointer, down to
// the grain.
function headHands(s: Studio) {
  const { from, zoom, length } = viewOf(s)
  const c = s.dom.canvas(P, 'head', [SONG_X, HEAD_Y, SONG_W, HEAD_H])
  c.fillStyle = C.lane
  c.fillRect(0, 0, SONG_W, HEAD_H)
  const place = (x: number) => s.locate(floorTo(Math.max(0, Math.min(length, from + x / zoom)), GRAINS[s.view.grain]!.ticks))
  s.dom.surface(P, 'head:hands', [SONG_X, HEAD_Y, SONG_W, HEAD_H], {
    down(x) {
      menu = undefined
      place(x)
    },
    move(x) {
      place(x)
    },
    wheel: wheel(s),
  })
  s.dom.cursor(P, 'head:hands', 'pointer')
}

// The playhead in front of everything on the arrangement: its mark in the playhead's strip and its
// line down through the span, the ruler and the rows. It takes no press, so what is under it does.
function playhead(s: Studio) {
  const { from, zoom } = viewOf(s)
  const tall = SONG_Y + ROWS_H - HEAD_Y
  const c = s.dom.canvas(P, 'playhead', [SONG_X, HEAD_Y, SONG_W, tall])
  if (c.canvas.style.pointerEvents !== 'none') c.canvas.style.pointerEvents = 'none'
  const at = (s.playhead() - from) * zoom
  c.fillStyle = s.playing ? C.head : C.cue
  c.fillRect(at - 0.75, HEAD_H - 2, 1.5, tall - HEAD_H + 2)
  c.fillStyle = C.head
  c.beginPath()
  c.moveTo(at, 0)
  c.lineTo(at + HEAD_H / 2, HEAD_H / 2)
  c.lineTo(at, HEAD_H)
  c.lineTo(at - HEAD_H / 2, HEAD_H / 2)
  c.closePath()
  c.fill()
}

// A header's or a toggle's accent, whether it is on, and what a press on it does.
function paint(e: HTMLElement, accent: string, on: boolean, press: () => void) {
  if (e.style.getPropertyValue('--accent') !== accent) e.style.setProperty('--accent', accent)
  if (e.classList.contains('st-on') !== on) e.classList.toggle('st-on', on)
  e.onpointerdown = ev => {
    if (ev.button !== 0) return
    ev.stopPropagation()
    menu = undefined
    press()
  }
}

const escape = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')

// Where a track's grip held at `y` down the window would put it.
function movingTo(s: Studio, y: number) {
  return Math.max(0, Math.min(s.project.tracks.length - 1, trackAt(y, s.view.tracksTop)))
}

// A track's header: its grip, its name or the field renaming it, its target, and C, M, S and ×, each
// cut to the window.
function header(s: Studio, i: number) {
  const p = s.project
  const v = s.view
  const t = p.tracks[i]!
  const y = SONG_Y + i * ROW_H - v.tracksTop + 2
  const hh = ROW_H - 4
  const dim = heard(p, i) ? '' : `${UNHEARD}`
  // The grip, dragged to move the track.
  const grip = s.el(TRACKS, `track:${i}:grip`, 'ar-grip', [NAMES_X, y, GRIP_W, hh])
  if (grip.style.backgroundColor !== t.color) grip.style.backgroundColor = t.color
  cut(grip, y, hh)
  const hands = s.dom.surface(TRACKS, `track:${i}:grip:hands`, [NAMES_X, y, GRIP_W, hh], {
    down(_x, gy) {
      menu = undefined
      moving = { from: i, to: i, y: y - SONG_Y + gy }
    },
    move(_x, gy) {
      if (!moving) return
      moving.y = y - SONG_Y + gy
      moving.to = movingTo(s, moving.y)
    },
    up() {
      const m = moving
      moving = undefined
      if (m && m.to !== m.from) s.moveTrack(m.from, m.to)
    },
  })
  cut(hands, y, hh)
  s.dom.cursor(TRACKS, `track:${i}:grip:hands`, moving ? 'grabbing' : 'grab')
  // The name and the target, or the field renaming it.
  const name = s.el(TRACKS, `track:${i}`, 'st-track', [LABEL_X, y, LABEL_W, hh])
  cut(name, y, hh)
  if (!name.firstChild) {
    const doc = name.ownerDocument
    const pick = doc.createElement('select')
    pick.className = 'st-target'
    pick.setAttribute('aria-label', 'Target device')
    // A press on the list opens it and picks no track.
    pick.onpointerdown = ev => ev.stopPropagation()
    name.append(doc.createElement('div'), pick)
    name.children[0]!.className = 'st-track-name'
  }
  const [title, pick] = [...name.children] as [HTMLElement, HTMLSelectElement]
  const html = `<b>${i + 1}</b>${escape(t.name)}`
  if (title.innerHTML !== html) title.innerHTML = html
  // A note track's list: none, then every device of the rack, by its place. An automation track's:
  // none, then every knob of the song (`knobs`), its own knob among them. A pick retargets the track.
  const knobs = t.kind === 'automation' ? s.knobs() : []
  const own = t.kind === 'automation' && t.target ? knobs.findIndex(k => sameKnob(k.knob, t.target)) : -1
  const listed = t.kind === 'automation' && t.target && own < 0 ? [...knobs, { knob: t.target, name: s.knobName(t.target) }] : knobs
  const options = t.kind === 'notes' ? ['→ NONE', ...p.rack.map((d, k) => `→ ${k + 1} ${d.name}`)] : ['→ NONE', ...listed.map(k => `→ ${k.name}`)]
  if (pick.options.length !== options.length || options.some((o, k) => pick.options[k]!.text !== o)) {
    pick.replaceChildren(...options.map((o, k) => {
      const opt = pick.ownerDocument.createElement('option')
      opt.value = k === 0 ? '' : `${k - 1}`
      opt.text = o
      return opt
    }))
  }
  const value = t.kind === 'notes'
    ? (t.target === undefined ? '' : `${t.target}`)
    : (t.target ? `${own < 0 ? listed.length - 1 : own}` : '')
  if (pick.value !== value) pick.value = value
  pick.onchange = () => {
    if (t.kind === 'notes') s.retarget(i, pick.value === '' ? undefined : Number(pick.value))
    else s.retargetKnob(i, pick.value === '' ? undefined : listed[Number(pick.value)]!.knob)
  }
  paint(name, t.color, i === v.track, () => {
    const now = performance.now()
    if (named && named.track === i && now - named.at <= TWICE) {
      named = undefined
      tools = tools === i ? undefined : i
      return
    }
    named = { track: i, at: now }
    s.pick(i)
    // Picked where it is, so a second press lands on it.
    v.reveal = undefined
  })
  // The right button on the name renames the track.
  name.oncontextmenu = ev => {
    ev.preventDefault()
    ev.stopPropagation()
    menu = undefined
    s.pick(i)
    s.rename(`track:${i}`)
  }
  if (name.style.opacity !== dim) name.style.opacity = dim
  const fh = Math.min(20, hh - 4)
  const field = s.field(TRACKS, `track:${i}`, [LABEL_X + 4, y + 2, LABEL_W - 8, fh], t.name, typed => s.renameTrack(i, typed))
  if (field) cut(field, y + 2, fh)
  // M and S, or C and ×, square, side by side and centred on the row.
  const my = y + Math.round((hh - MS_W) / 2)
  const bx = (k: number) => LABEL_X + LABEL_W + MS_GAP + k * (MS_W + MS_GAP)
  const square = (key: string, k: number, label: string) => {
    const e = s.el(TRACKS, `track:${i}:${key}`, 'st-ms', [bx(k), my, MS_W, MS_W], label)
    cut(e, my, MS_W)
    return e
  }
  if (tools === i) {
    const swatch = square('color', 0, 'C')
    if (swatch.style.background !== t.color) swatch.style.background = t.color
    paint(swatch, t.color, false, () => s.colorTrack(i))
    paint(square('remove', 1, '×'), MUTE, false, () => {
      tools = undefined
      s.removeTrack(i)
    })
    return
  }
  paint(square('mute', 0, 'M'), MUTE, t.mute, () => s.muteBy(i))
  // An automation track has no solo, so no S.
  if (t.kind === 'notes') paint(square('solo', 1, 'S'), SOLO, t.solo, () => s.soloBy(i))
}

// The tracks' scroll this frame: a track just picked scrolled to, a grip held past the window's edge
// creeping on, and kept to the tracks there are.
function scrolled(s: Studio) {
  const v = s.view
  if (v.reveal !== undefined) {
    v.tracksTop = revealTop(v.tracksTop, v.reveal)
    v.reveal = undefined
  }
  if (moving) {
    const d = creep(moving.y)
    if (d) {
      scrollTracks(s, d)
      moving.to = movingTo(s, moving.y)
    }
  }
  v.tracksTop = keepTop(v.tracksTop, s.project.tracks.length)
}

// The tracks' panel: the screens' buttons, a header per track in the window, their scrollbar down
// its left, + TRACK at the bottom. The wheel anywhere on it scrolls the tracks.
function tracks(s: Studio) {
  const v = s.view
  const p = s.project
  if (tools !== undefined && tools !== v.track) tools = undefined
  scrolled(s)
  s.chassis(TRACKS, LAYOUT.tracks)
  s.dom.panel(TRACKS, [...LAYOUT.tracks]).onwheel = ev => {
    ev.preventDefault()
    scrollTracks(s, ev.deltaY * (ev.deltaMode === 1 ? LINE : ev.deltaMode === 2 ? innerHeight : 1))
  }
  SCREENS.forEach(([screen, label], k) =>
    s.kit.button(TRACKS, `screen:${screen}`, { at: [NAMES_X + k * (SCREEN_W + SCREEN_GAP), SCREEN_Y], size: [SCREEN_W, SCREEN_H], label, lit: v.screen === screen, accent: PLAY, onPress: () => s.show(screen) }),
  )
  p.tracks.forEach((_, i) => header(s, i))
  tracksBar(s, TRACKS, TRACKS_BAR_X)
  s.kit.button(TRACKS, 'track:add', { at: [NAMES_X, SONG_Y + ROWS_H + ADD_GAP], size: [NAMES_W, ADD_H], label: '+ TRACK', onPress: () => s.addTrack() })
}

export function tick(_row: Row, plugins: Plugins) {
  const s = plugins.studio as Studio
  s.dom.style(STYLE)
  tracks(s)
  if (s.view.screen !== 'arrange') {
    drag = undefined
    ruling = undefined
    spanning = undefined
    over = undefined
    menu = undefined
    held = undefined
    aim = undefined
    sliding = undefined
    return
  }
  const v = s.view
  const p = s.project
  s.dom.keys(k => {
    if (k.code !== 'Escape' || !menu) return false
    menu = undefined
    return true
  })
  carry(s)
  // Clips dragged or a box drawn with the pointer held past the window's top or bottom: the tracks
  // creep on under it, and the drag goes on with them.
  if (aim && (drag?.kind === 'move' || drag?.kind === 'box')) {
    const d = creep(aim.y)
    if (d) {
      scrollTracks(s, d)
      dragTo(s, aim.x, aim.y)
    }
  }
  const top = v.tracksTop
  const { from, zoom, shown } = viewOf(s)
  const x = (t: number) => (t - from) * zoom
  s.chassis(P, LAYOUT.view)
  headHands(s)
  spanStrip(s)
  spanHands(s)
  // The ruler: the loop's band, then a number on each bar.
  const ruler = s.dom.canvas(P, 'ruler', [SONG_X, RULER_Y, SONG_W, RULER_H])
  if (p.loop) {
    ruler.fillStyle = v.cycle ? C.loop : C.loopOff
    ruler.fillRect(x(p.loop.start), 0, x(p.loop.end) - x(p.loop.start), RULER_H)
  }
  ruler.font = "8px 'Silkscreen', monospace"
  ruler.textBaseline = 'middle'
  // Every bar numbered while a bar is wide enough for its number, else every fourth.
  const every = BAR * zoom >= 24 ? 1 : 4
  for (let b = Math.floor(from / BAR); b * BAR <= from + shown; b++) {
    if (b % every) continue
    const bx = x(b * BAR)
    ruler.fillStyle = C.bar
    ruler.fillRect(bx, 0, 1, RULER_H)
    ruler.fillStyle = C.text
    ruler.fillText(`${b + 1}`, bx + 4, RULER_H / 2)
  }
  rulerHands(s)
  // The rows, in the window: drawn down the whole song of tracks, moved up by the scroll, the canvas
  // cutting off what lies outside.
  const ctx = s.dom.canvas(P, 'song', [SONG_X, SONG_Y, SONG_W, ROWS_H])
  ctx.save()
  ctx.translate(0, -top)
  const tall = ROW_H * p.tracks.length
  p.tracks.forEach((_, i) => {
    ctx.fillStyle = i % 2 ? C.alt : C.lane
    ctx.fillRect(0, i * ROW_H, SONG_W, ROW_H)
  })
  if (p.loop && v.cycle) {
    ctx.fillStyle = C.loopShade
    ctx.fillRect(x(p.loop.start), 0, x(p.loop.end) - x(p.loop.start), tall)
  }
  for (let t = Math.floor(from / BEAT) * BEAT; t <= from + shown; t += BEAT) {
    if (BEAT * zoom < 3 && t % BAR) continue
    ctx.fillStyle = t % BAR === 0 ? C.bar : C.beat
    ctx.fillRect(x(t), 0, t % BAR === 0 ? 1 : 0.5, tall)
  }
  ctx.font = "8px 'Silkscreen', monospace"
  ctx.textBaseline = 'top'
  p.clips.forEach((c, ci) => {
    const t = p.tracks[c.track]!
    const ti = c.track
    const pat = patternOf(p, c)
    const x0 = x(c.start), w = x(clipEnd(p, c)) - x0
    if (x0 + w < 0 || x0 > SONG_W) return
    if ((ti + 1) * ROW_H <= top || ti * ROW_H >= top + ROWS_H) return
    ctx.globalAlpha = heard(p, ti) ? 1 : UNHEARD
    const picked = v.clips.includes(ci)
    ctx.fillStyle = t.color
    ctx.fillRect(x0 + 1, ti * ROW_H + 3, w - 2, ROW_H - 6)
    ctx.strokeStyle = picked ? C.ink : C.bar
    ctx.lineWidth = picked ? 2 : 1
    ctx.strokeRect(x0 + 1.5, ti * ROW_H + 3.5, w - 3, ROW_H - 7)
    ctx.fillStyle = 'rgba(35,40,49,0.12)'
    ctx.fillRect(x0 + 2, ti * ROW_H + 4, w - 4, NAME_H - 2)
    ctx.fillStyle = C.text
    ctx.fillText(c.pattern.toUpperCase(), x0 + 6, ti * ROW_H + 6)
    // An automation clip's notes, each its line from 0 at the bottom to 1 at the top, filled under:
    // a knob that sweeps drawn as it moves, one set on 16ths as the steps it takes.
    if (t.kind === 'automation') {
      const lane = t.patterns[c.pattern] as AutomationPattern
      const roof = ti * ROW_H + NAME_H + 4, bottom = ti * ROW_H + ROW_H - 6
      const yOf = (value: number) => bottom - value * (bottom - roof)
      const steps = t.target ? s.glides(t.target) === false : false
      const sixteenth = BEAT / 4
      for (const n of lane.notes) {
        if (n.time < fromOf(pat) || n.time >= pat.length) continue
        const end = Math.min(n.time + n.duration, pat.length)
        const from = c.start + n.time - fromOf(pat)
        const long = end - n.time
        ctx.beginPath()
        ctx.moveTo(x(from), bottom)
        if (steps) {
          // Set on its first tick and on every 16th of the song after, each value held to the next.
          const at = [0]
          for (let k = Math.ceil((from + 1) / sixteenth) * sixteenth; k < from + long; k += sixteenth) at.push(k - from)
          at.forEach((a, j) => {
            const value = valueAt(n, a)
            ctx.lineTo(x(from + a), yOf(value))
            ctx.lineTo(x(from + (at[j + 1] ?? long)), yOf(value))
          })
        } else {
          for (let px = 0; px < long * zoom; px += 2) ctx.lineTo(x(from) + px, yOf(valueAt(n, px / zoom)))
          ctx.lineTo(x(from + long), yOf(valueAt(n, long)))
        }
        ctx.lineTo(x(from + long), bottom)
        ctx.closePath()
        ctx.fillStyle = 'rgba(35,40,49,0.18)'
        ctx.fill()
        ctx.strokeStyle = C.ink
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
      return
    }
    // The notes it plays, small, from the pattern's `from` to its end.
    const notes = t.patterns[c.pattern]!
    const playing = notes.notes.filter(n => n.time >= fromOf(pat) && n.time < pat.length)
    if (!playing.length) return
    const rows = playing.map(row)
    const lo = Math.min(...rows), hi = Math.max(...rows)
    ctx.fillStyle = 'rgba(35,40,49,0.55)'
    playing.forEach((n, j) => {
      const at = c.start + n.time - fromOf(pat)
      const yy = ti * ROW_H + ROW_H - 8 - (hi > lo ? ((rows[j]! - lo) / (hi - lo)) * (ROW_H - 26) : (ROW_H - 26) / 2)
      ctx.fillRect(x(at) + 1, yy, Math.max(1, Math.min(n.duration, pat.length - n.time) * zoom - 1), 2)
    })
  })
  ctx.globalAlpha = 1
  // Outside the song's span is shaded: what is there is kept and not heard.
  const span = spanOf(p)
  ctx.fillStyle = C.outside
  if (x(span.start) > 0) ctx.fillRect(0, 0, x(span.start), tall)
  if (x(span.end) < SONG_W) ctx.fillRect(x(span.end), 0, SONG_W - x(span.end), tall)
  if (drag?.kind === 'box') {
    const k0 = Math.min(drag.k0, drag.k1), k1 = Math.max(drag.k0, drag.k1)
    ctx.fillStyle = C.box
    ctx.fillRect(x(Math.min(drag.t0, drag.t1)), k0 * ROW_H, Math.abs(drag.t1 - drag.t0) * zoom, (k1 - k0 + 1) * ROW_H)
  }
  // Where a track dragged by its grip would go.
  if (moving && moving.to !== moving.from) {
    ctx.fillStyle = C.drop
    ctx.fillRect(0, (moving.to > moving.from ? moving.to + 1 : moving.to) * ROW_H - 1, SONG_W, 2)
  }
  ctx.restore()
  hands(s)
  tracksBar(s, P, SONG_BAR_X)
  songBar(s)
  playhead(s)
  // The clips' names being typed, over the song, cut to the window.
  p.clips.forEach((c, ci) => {
    const x0 = Math.max(0, x(c.start))
    const fy = SONG_Y + c.track * ROW_H - top + 3
    const field = s.field(P, `clip:${ci}`, [SONG_X + x0 + 2, fy, Math.max(100, Math.min(SONG_W - x0 - 4, x(clipEnd(p, c)) - x0 - 4)), 18], c.pattern, typed => s.renamePattern(c.track, c.pattern, typed))
    if (field) cut(field, fy, 18)
  })
  clipMenu(s)
}

export function remove() {
  spanning = undefined
  over = undefined
  drag = undefined
  pressed = undefined
  named = undefined
  ruling = undefined
  moving = undefined
  menu = undefined
  held = undefined
  aim = undefined
  barring = undefined
  sliding = undefined
}
