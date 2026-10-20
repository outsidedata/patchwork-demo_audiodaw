// The mixer's look and hands, drawn while the studio shows it, beside the tracks: the rack, a
// strip per device, then one per return bus, then the master, and a button to add a bus. Every
// number of its layout is here. Each strip is a Tone.Channel's values, in its own units.
//   a device's strip  its number and name with an LED in its instrument's accent (lit while it is
//                     heard: not muted, and soloed when any device is), its preset, how many
//                     effects it has (a press opens them on the Effects panel), a send knob in dB per bus,
//                     pan, mute and solo (the Channel's own), a fader in dB (its `volume`), a meter
//                     (a Tone.Meter on the Channel) and × to take it away (the tracks that targeted
//                     it then target none). A press on its title picks it for the faceplate.
//   a bus's strip     its name, how many effects it has (a press opens them), its pan, × to take it
//                     away (and every send to it with it), a fader and a meter.
//   the master        how many effects it has, a fader (Tone.Destination's volume) and a meter.
// A fader runs from `FLOOR` dB, which is silence, to +6 dB. Every drag of a knob or a fader, a mute
// or a solo, a bus added or taken away, is one step of undo. The right button on a fader, a pan or a
// send a device has automates it (`studio.automate`); one some track is aimed at carries a dot.
//
// The master stays at the right of the mixer, + BUS beside it. The devices' and the buses' strips
// lie in a window left of them, a panel of their own that cuts off what lies outside it, and scroll
// along it while they are wider than it: the wheel over them, turned either way, and a scrollbar
// under them, shown while they are. A device picked anywhere but on its own strip, and a bus just
// added, are scrolled into view.
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { setChannel, setSend, sounds, type Effect, type Knob, type Project } from '#plugins/audiodaw/audiodaw.sim.ts'
import { LAYOUT, MASTER, RETURN, accentOf, type Studio, type Target } from './plugins/studio/studio.plugin.ts'

const P = 'mixer'
// The panel of the strips that scroll, over the mixer's, its own origin the same.
const STRIPS = 'mixer:strips'
const [VX, VY, W, H] = LAYOUT.view
const STRIP_W = 118
const STRIP_GAP = 4
const STRIP_X = 0
const STRIP_Y = 12
// The scrollbar under the strips.
const BAR_H = 10
const BAR_GAP = 4
const STRIP_H = H - STRIP_Y - 12 - BAR_GAP - BAR_H
const BAR_Y = STRIP_Y + STRIP_H + BAR_GAP
// The master at the right, + BUS left of it, and the window the other strips scroll in left of that.
const MASTER_X = W - 12 - STRIP_W
const ADD_W = 60
const ADD_X = MASTER_X - STRIP_GAP - ADD_W
export const WINDOW_W = ADD_X - STRIP_GAP - STRIP_X
// A wheel's line in pixels, as renderdom counts it.
const LINE = 16
const KNOB_W = 52
export const FLOOR = -60
export const CEIL = 6
const FADER_Y = STRIP_Y + 198
const FADER_H = STRIP_H - (FADER_Y - STRIP_Y) - 6
const METER_W = 8

// A fader's dB, Tone's volume: at the floor it is silence, -Infinity.
export const volumeOf = (d: number) => (d <= FLOOR ? -Infinity : Math.min(CEIL, d))
export const faderOf = (volume: number) => Math.max(FLOOR, Math.min(CEIL, volume))
const dbShown = (d: number) => (d <= FLOOR ? '-INF dB' : `${d >= 0 ? '+' : ''}${d.toFixed(1)} dB`)

// A chain in short: how many effects it holds.
export const short = (chain: Effect[]) => (chain.length ? `${chain.length} EFFECT${chain.length === 1 ? '' : 'S'}` : 'NO EFFECTS')

// Whether a device is heard: not muted, and soloed when any device is, as Tone.Channel hears it.
export const deviceHeard = (p: Project, d: number) => {
  const c = p.rack[d]!.channel
  return !c.mute && (!p.rack.some(x => x.channel.solo) || c.solo)
}

// Whether a track is heard: a note track's notes let through, to a device that is heard; an
// automation track not muted, aimed at a knob.
export const heard = (p: Project, i: number) => {
  const t = p.tracks[i]!
  if (t.kind === 'automation') return t.target !== undefined && sounds(p, i)
  return t.target !== undefined && sounds(p, i) && deviceHeard(p, t.target)
}

// The width of `count` strips side by side.
export const stripsWidth = (count: number) => Math.max(0, count * (STRIP_W + STRIP_GAP) - STRIP_GAP)
// The strips' scroll kept to them: from 0 to where the last strip ends at the window's right.
export const keepFrom = (from: number, count: number) => Math.max(0, Math.min(stripsWidth(count) - WINDOW_W, from))
// The scroll that shows strip `i` whole, moved as little as it can be from `from`.
export const revealFrom = (from: number, i: number) => Math.min(i * (STRIP_W + STRIP_GAP), Math.max(from, i * (STRIP_W + STRIP_GAP) + STRIP_W - WINDOW_W))

// The pixels the strips are scrolled along by; the device picked and the buses there were last frame,
// to scroll to a device picked elsewhere or a bus added; a device picked on its own strip, which is
// where it is; and the scrollbar's thumb being dragged, where it was pressed and the scroll then.
let from = 0
let lastDevice: number | undefined
let lastBuses: number | undefined
let pressed: number | undefined
let barring: { x: number; from: number } | undefined

export function setup() {}

function strip(s: Studio, panel: string, x: number, title: string, accent: string, lit: boolean, chain: Effect[], target: Target) {
  s.kit.module(panel, `strip:${title}`, { box: [x, STRIP_Y, STRIP_W, STRIP_H], title, lit, accent })
  s.el(panel, `strip:${title}:fx`, 'st-slot', [x + 6, STRIP_Y + 40, STRIP_W - 12, 18], short(chain))
  s.dom.surface(panel, `strip:${title}:open`, [x + 6, STRIP_Y + 40, STRIP_W - 12, 18], { down: () => (s.view.target = target) })
  s.dom.cursor(panel, `strip:${title}:open`, 'pointer')
  s.kit.meter(panel, `strip:${title}:meter`, { at: [x + STRIP_W - 6 - METER_W, FADER_Y + 12], size: [METER_W, FADER_H - 24], level: s.meter(target) })
}

// A strip's fader; its right button automates the strip's level (`knob`).
function fader(s: Studio, panel: string, key: string, x: number, volume: number, accent: string, set: (volume: number) => void, knob: Knob) {
  const el = s.kit.fader(panel, key, {
    at: [x + 26, FADER_Y],
    height: FADER_H,
    label: 'LEVEL',
    value: faderOf(volume),
    range: [FLOOR, CEIL],
    reset: 0,
    shown: dbShown,
    accent,
    onChange: d => set(volumeOf(d)),
    gesture: s.gesture,
    onMenu: () => s.automate(knob),
  })
  s.mark(el, knob)
}

const knobAt = (x: number, n: number): [number, number] => [x + 6 + (n % 2) * (KNOB_W + 2), STRIP_Y + 64 + Math.floor(n / 2) * 62]
const panShown = (v: number) => (Math.abs(v) < 0.005 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)

// The strips' scroll this frame: a device picked elsewhere or a bus just added scrolled to, and kept
// to the strips there are.
function scrolled(s: Studio) {
  const p = s.project
  const count = p.rack.length + Object.keys(p.buses).length
  const v = s.view
  if (v.device !== lastDevice && v.device !== pressed && p.rack[v.device]) from = revealFrom(from, v.device)
  if (lastBuses !== undefined && Object.keys(p.buses).length > lastBuses) from = revealFrom(from, count - 1)
  lastDevice = v.device
  lastBuses = Object.keys(p.buses).length
  pressed = undefined
  from = keepFrom(from, count)
}

// The scrollbar under the strips, while they are wider than the window: its thumb as wide as the
// share shown, dragged to scroll them, or put where the bar is pressed.
function scrollbar(s: Studio, count: number) {
  const all = stripsWidth(count)
  if (all <= WINDOW_W) return
  const w = Math.max(16, (WINDOW_W / all) * WINDOW_W)
  const x = (from / (all - WINDOW_W)) * (WINDOW_W - w)
  s.el(P, 'scroll', 'st-scroll', [STRIP_X, BAR_Y, WINDOW_W, BAR_H])
  s.el(P, 'scroll:thumb', 'st-thumb', [STRIP_X + x, BAR_Y + 1, w, BAR_H - 2])
  s.dom.surface(P, 'scroll:hands', [STRIP_X, BAR_Y, WINDOW_W, BAR_H], {
    down(px) {
      // A press off the thumb puts the thumb's middle there; then the drag moves it.
      if (px < x || px > x + w) from = keepFrom(((px - w / 2) / (WINDOW_W - w)) * (all - WINDOW_W), count)
      barring = { x: px, from }
    },
    move(px) {
      const b = barring
      if (!b) return
      from = keepFrom(b.from + ((px - b.x) / (WINDOW_W - w)) * (all - WINDOW_W), count)
    },
    up() {
      barring = undefined
    },
    wheel(_x, _y, _m, dx, dy) {
      from = keepFrom(from + (Math.abs(dx) > Math.abs(dy) ? dx : dy), count)
    },
  })
  s.dom.cursor(P, 'scroll:hands', 'grab')
}

export function tick(_row: Row, plugins: Plugins) {
  const s = plugins.studio as Studio
  if (s.view.screen !== 'mixer') {
    barring = undefined
    return
  }
  const p = s.project
  const buses = Object.keys(p.buses)
  const count = p.rack.length + buses.length
  scrolled(s)
  s.chassis(P, LAYOUT.view)
  // The strips that scroll, on their own panel over the window, which cuts off what lies outside it;
  // the wheel anywhere over them, turned either way, scrolls them.
  s.dom.style(`[data-panel="${STRIPS}"] { overflow: hidden; }`)
  s.dom.panel(STRIPS, [VX + STRIP_X, VY, WINDOW_W, BAR_Y]).onwheel = ev => {
    ev.preventDefault()
    const d = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY
    from = keepFrom(from + d * (ev.deltaMode === 1 ? LINE : ev.deltaMode === 2 ? innerHeight : 1), count)
  }
  scrollbar(s, count)
  let x = STRIP_X - from
  p.rack.forEach((t, i) => {
    const accent = accentOf(t.instrument)
    const title = `${i + 1} ${t.name}`
    strip(s, STRIPS, x, title, accent, deviceHeard(p, i), t.effects, i)
    s.el(STRIPS, `strip:${title}:patch`, 'st-slot', [x + 6, STRIP_Y + 20, STRIP_W - 12, 18], (s.presetName(i) ?? t.instrument.is).toUpperCase())
    s.dom.surface(STRIPS, `strip:${title}:pick`, [x, STRIP_Y, STRIP_W - 24, 18], {
      down: () => {
        // Picked where it is: the strips do not scroll under the press.
        pressed = i
        s.pickDevice(i)
      },
    })
    s.dom.cursor(STRIPS, `strip:${title}:pick`, 'pointer')
    s.kit.button(STRIPS, `strip:${title}:remove`, { at: [x + STRIP_W - 20, STRIP_Y + 1], size: [16, 14], label: '×', onPress: () => s.removeDevice(i) })
    // A send's knob automates the send once there is one; a strip with none sends nothing to aim at.
    buses.forEach((b, n) => {
      const send: Knob = { part: 'send', device: i, bus: b }
      const el = s.kit.knob(STRIPS, `strip:${title}:send:${b}`, {
        at: knobAt(x, n),
        label: b.toUpperCase(),
        value: faderOf(t.sends[b] ?? -Infinity),
        range: [FLOOR, CEIL],
        reset: FLOOR,
        shown: dbShown,
        accent,
        onChange: v => s.change(q => setSend(q, i, b, volumeOf(v))),
        gesture: s.gesture,
        ...(t.sends[b] === undefined ? {} : { onMenu: () => s.automate(send) }),
      })
      s.mark(el, send)
    })
    const pan: Knob = { part: 'pan', strip: { device: i } }
    const panEl = s.kit.knob(STRIPS, `strip:${title}:pan`, {
      at: knobAt(x, buses.length),
      label: 'PAN',
      value: t.channel.pan,
      range: [-1, 1],
      reset: 0,
      shown: panShown,
      accent,
      onChange: v => s.change(q => setChannel(q, i, 'pan', v)),
      gesture: s.gesture,
      onMenu: () => s.automate(pan),
    })
    s.mark(panEl, pan)
    const rows = Math.ceil((buses.length + 1) / 2)
    const msY = Math.min(FADER_Y - 24, STRIP_Y + 64 + rows * 62)
    s.kit.button(STRIPS, `strip:${title}:mute`, { at: [x + 6, msY], size: [50, 18], label: 'M', lit: t.channel.mute, accent: '#ef6a5a', onPress: () => s.muteDevice(i) })
    s.kit.button(STRIPS, `strip:${title}:solo`, { at: [x + 62, msY], size: [50, 18], label: 'S', lit: t.channel.solo, accent: '#e8d36a', onPress: () => s.soloDevice(i) })
    fader(s, STRIPS, `strip:${title}:fader`, x, t.channel.volume, accent, d => s.change(q => setChannel(q, i, 'volume', d)), { part: 'volume', strip: { device: i } })
    x += STRIP_W + STRIP_GAP
  })
  buses.forEach(b => {
    const bus = p.buses[b]!
    const title = `${b.toUpperCase()} RTN`
    const set = (q: Project, to: Partial<{ volume: number; pan: number }>): Project => ({ ...q, buses: { ...q.buses, [b]: { ...q.buses[b]!, ...to } } })
    strip(s, STRIPS, x, title, RETURN, true, bus.effects, b)
    s.el(STRIPS, `strip:${title}:patch`, 'st-slot', [x + 6, STRIP_Y + 20, STRIP_W - 12, 18], 'RETURN')
    const pan: Knob = { part: 'pan', strip: { bus: b } }
    const panEl = s.kit.knob(STRIPS, `strip:${title}:pan`, {
      at: knobAt(x, 0),
      label: 'PAN',
      value: bus.pan,
      range: [-1, 1],
      reset: 0,
      shown: panShown,
      accent: RETURN,
      onChange: v => s.change(q => set(q, { pan: v })),
      gesture: s.gesture,
      onMenu: () => s.automate(pan),
    })
    s.mark(panEl, pan)
    s.kit.button(STRIPS, `strip:${title}:remove`, { at: [x + 6 + KNOB_W + 2, STRIP_Y + 80], size: [50, 18], label: '× BUS', onPress: () => s.removeBus(b) })
    fader(s, STRIPS, `strip:${title}:fader`, x, bus.volume, RETURN, d => s.change(q => set(q, { volume: d })), { part: 'volume', strip: { bus: b } })
    x += STRIP_W + STRIP_GAP
  })
  // The master and + BUS, at the right whatever the scroll.
  s.kit.button(P, 'bus:add', { at: [ADD_X, STRIP_Y], size: [ADD_W, 24], label: '+ BUS', onPress: () => s.addBus() })
  strip(s, P, MASTER_X, 'MASTER', MASTER, true, p.master.effects, 'master')
  s.el(P, 'strip:MASTER:patch', 'st-slot', [MASTER_X + 6, STRIP_Y + 20, STRIP_W - 12, 18], 'STEREO OUT')
  fader(s, P, 'strip:MASTER:fader', MASTER_X, p.master.volume, MASTER, d => s.change(q => ({ ...q, master: { ...q.master, volume: d } })), { part: 'volume', strip: 'master' })
}

export function remove() {
  from = 0
  lastDevice = undefined
  lastBuses = undefined
  pressed = undefined
  barring = undefined
}
