// The rack's look and hands: the picked device's faceplate (the device the picked track targets, or
// the strip pressed on the mixer), and beside it the Effects panel. Every number of their layout is
// here. The faceplate's sub-line names the device and the tracks that target it.
//
// Over the faceplate and the Effects panel together, in a panel of their own, runs a tab per device
// of the rack, the picked one lit; a press on one picks it,
// whether any track targets it or none. The + tab opens a button per instrument a preset is shipped
// or saved for; a press adds a device of it from its first preset, targeted by no track until one
// is pointed at it, and picks it.
//
// A faceplate is the device's instrument's own panel (`studio.plate()`, from `panels.ts`): sections in
// the order its sound flows, split by grooves, each with its title, its knobs, its wave tiles and
// choice cells, its steppers, its screens (an oscillator's scope, a filter's response, an envelope
// with its curve tags) and, for a kit, its pads. A knob's turn, or a press on a tile, a cell, a
// stepper's half or a tag, is one edit, which audiodaw hands to Tone as `instrument.set`; a press on
// a pad picks it, and on a DuoSynth's VOICE 1 / VOICE 2 shows that voice. It lies under a
// header holding the instrument's name, its sub-line, the preset LCD with ◀ ▶ (the presets of that
// instrument in order, then the ones saved, which the page keeps across a reload) and Save. Save
// opens a real text input for the name; OK keeps the instrument under it, Cancel closes it. Keys
// typed into the input reach no shortcut and play no note (renderdom keeps them).
//
// The Effects panel shows whose chain the studio's `target` names (the picked device, or a bus or the
// master opened from the mixer): one module per effect in order, each with its number and Tone's
// name, an ON or OFF switch (off is `wet = 0`; an effect Tone gives no `wet`, a Compressor or a
// Limiter, has none), every option Tone holds for it (`studio.effectControls`), and × to take it
// away; a drag on a module's title moves it to where it is let go; the last module, ADD EFFECT,
// holds every effect of the catalogue in switches, as many to a row as fit, and a press on one adds
// it at the end with Tone's defaults. The wheel scrolls the panel when the chain is taller than it.
//
// The right button on a knob that is a Tone option, of the instrument (a kit pad's and the kit's
// level among them) or of an effect, automates it (`studio.automate`): the automation track aimed at
// it, a new one at the bottom of the list when there is none, picked on the arrangement. A knob some
// track is aimed at carries a dot. The knobs the panel works out itself (harmonics, partials, a pad's
// pitch) are not Tone options and are not automated.
//
// Every control's drag, a switch's pick, a preset stepped, and an effect added, moved, turned or
// taken away is one step of undo.
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { addEffect, moveEffect, removeEffect, turnEffect, type Effect, type Knob } from '#plugins/audiodaw/audiodaw.sim.ts'
import { switchWidth as labelsWidth } from '#plugins/renderdom/controls.ts'
import { INSTRUMENTS, LAYOUT, MASTER, RETURN, accentOf, chainOf, type Studio, type Target } from './plugins/studio/studio.plugin.ts'
import type { Control } from './plugins/studio/faceplate.ts'
import { icon, type Panel, type Placed } from './plugins/studio/panels.ts'

const RACK = 'rack'
const INS = 'inserts'
// A module's padding, its header's height, the gap between its controls and between modules; a
// knob's and a switch's size (the kit's; a switch is as wide as the kit says its labels need).
const PAD = 8
const HEAD = 16
const GAP = 6
const KNOB = [56, 60] as const
const SWITCH_H = 28
const MODULE_H = HEAD + PAD + KNOB[1] + PAD
const TOP_Y = 64

// A value as a knob writes it under itself.
export function shown(v: number): string {
  const a = Math.abs(v)
  return a >= 1000 ? `${(v / 1000).toFixed(a >= 10000 ? 1 : 2)}k` : a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2)
}

// A switch's width: the least its labels, as drawn in capitals, need.
const switchWidth = (options: readonly string[]) => labelsWidth(options.map(o => o.toUpperCase()))

type Box4 = [number, number, number, number]

// Boxes of the sizes `sizes` flowed into `width` from `top`, left to right and wrapping, each row as
// tall as its tallest: each box in the panel's units.
function flow(sizes: [number, number][], width: number, top: number): Box4[] {
  const out: Box4[] = []
  let x = 12, y = top, tall = 0
  for (const [w, h] of sizes) {
    if (x + w > width - 12 && x > 12) {
      x = 12
      y += tall + GAP
      tall = 0
    }
    out.push([x, y, w, h])
    x += w + GAP
    tall = Math.max(tall, h)
  }
  return out
}
// The width a control takes in a module: a knob's, or what a switch's labels need.
const widthOf = (c: Control) => (c.kind === 'knob' ? KNOB[0] : switchWidth(c.options))

// Controls of the widths `widths` laid in rows no wider than `most` inside a module: each one's
// place from the module's top left, and the module's size.
function lay(widths: number[], most: number): { places: [number, number][]; size: [number, number] } {
  const places: [number, number][] = []
  let x = 0, y = 0, widest = 0
  for (const w of widths) {
    if (x > 0 && x + w > most) {
      x = 0
      y += KNOB[1] + GAP
    }
    places.push([PAD + x, HEAD + PAD + y])
    x += w + GAP
    widest = Math.max(widest, x - GAP)
  }
  return { places, size: [PAD * 2 + Math.max(widest, 80), HEAD + PAD * 2 + y + KNOB[1]] }
}

// A control drawn at `x`, `y` in its panel: a knob, or a switch centred in a knob's height. A knob of
// an effect (`knob` its place) is automated from its right button.
function draw(s: Studio, panel: string, key: string, c: Control, x: number, y: number, accent: string, knob?: Knob) {
  if (c.kind === 'knob') {
    const el = s.kit.knob(panel, `${key}:${c.key}`, {
      at: [x, y],
      label: c.label,
      value: c.value,
      range: [c.min, c.max],
      log: c.log,
      ...(c.step === undefined ? {} : { step: c.step }),
      reset: c.reset,
      shown: c.shown ?? shown,
      accent,
      onChange: v => c.set(v),
      gesture: s.gesture,
      ...(knob ? { onMenu: () => s.automate(knob) } : {}),
    })
    if (knob) s.mark(el, knob)
    return
  }
  s.kit.switch(panel, `${key}:${c.key}`, {
    at: [x, y + (KNOB[1] - SWITCH_H) / 2],
    width: switchWidth(c.options),
    label: c.label,
    options: c.options,
    on: c.on,
    onPick: o => c.pick(o),
    gesture: s.gesture,
  })
}

// The Save input open, and the + tab's list of instruments open.
let saving = false
let adding = false

// The tabs, a panel of their own across the faceplate and the Effects panel both, since a device is
// its instrument and its effects: one per device of the rack, lit on the picked one, in its
// instrument's accent. A press picks it; two presses rename it; a drag along the tabs moves it to
// where it is let go (a mark shows where), every track still targeting the device it did; × takes
// it away, the tracks that targeted it then targeting none. The + tab opens the instruments a device
// can be added of.
const TABS = 'tabs'
const TABS_Y = 8
const TAB_H = 24
const TAB_W = 160
const PLUS_W = 40
const X_W = 16
const FACE_Y = TOP_Y
// A tab pressed: which, where along the tabs, and the place it would go; and the last press, for two
// presses renaming it.
let tabbing: { from: number; x: number; to: number; moved: boolean } | undefined
let tapped: { device: number; at: number } | undefined
function tabs(s: Studio) {
  const p = s.project
  const box = LAYOUT.tabs
  const W = box[2]
  s.chassis(TABS, box)
  const w = Math.min(TAB_W, (W - 24 - PLUS_W - GAP) / Math.max(1, p.rack.length) - 4)
  const tabX = (i: number) => 12 + i * (w + 4)
  p.rack.forEach((d, i) => {
    s.kit.button(TABS, `tab:${i}`, {
      at: [tabX(i), TABS_Y],
      size: [w, TAB_H],
      label: `${i + 1} ${d.name}`,
      // Lit while the section below is that device: not while + is open or a bus's or the master's
      // effects are shown.
      lit: !adding && i === s.view.device && s.view.target === i,
      accent: accentOf(d.instrument),
      onPress: () => {},
    })
    s.dom.surface(TABS, `tab:${i}:hands`, [tabX(i), TABS_Y, w - X_W - 2, TAB_H], {
      down(x) {
        tabbing = { from: i, x: tabX(i) + x, to: i, moved: false }
      },
      move(x) {
        const t = tabbing
        if (!t) return
        const at = tabX(i) + x
        if (!t.moved && Math.abs(at - t.x) < 4) return
        t.moved = true
        t.to = Math.max(0, Math.min(p.rack.length - 1, Math.floor((at - 12) / (w + 4))))
      },
      up() {
        const t = tabbing
        tabbing = undefined
        if (!t) return
        if (t.moved) {
          if (t.to !== t.from) s.moveDevice(t.from, t.to)
          return
        }
        const now = performance.now()
        if (tapped && tapped.device === i && now - tapped.at <= 350) {
          tapped = undefined
          s.rename(`device:${i}`)
          return
        }
        tapped = { device: i, at: now }
        adding = false
        s.pickDevice(i)
      },
    })
    s.dom.cursor(TABS, `tab:${i}:hands`, tabbing?.moved ? 'grabbing' : 'pointer')
    s.kit.button(TABS, `tab:${i}:remove`, { at: [tabX(i) + w - X_W - 2, TABS_Y + (TAB_H - 14) / 2], size: [X_W, 14], label: '×', onPress: () => s.removeDevice(i) })
    s.field(TABS, `device:${i}`, [tabX(i) + 2, TABS_Y + 2, w - X_W - 6, TAB_H - 4], d.name, typed => s.renameDevice(i, typed))
  })
  // Where a dragged tab would go.
  if (tabbing?.moved && tabbing.to !== tabbing.from) {
    const at = tabbing.to > tabbing.from ? tabX(tabbing.to) + w + 1 : tabX(tabbing.to) - 3
    s.el(TABS, 'tab:drop', 'st-band', [at, TABS_Y - 2, 2, TAB_H + 4]).style.background = '#232831'
  }
  s.kit.button(TABS, 'tab:add', { at: [tabX(p.rack.length), TABS_Y], size: [PLUS_W, TAB_H], label: '+', lit: adding, onPress: () => (adding = !adding) })
}

// The instruments a device can be added of, every one a preset is shipped or saved for, a button
// each: a press adds a device of it from its first preset, used by no track until one targets it.
function instruments(s: Studio, W: number) {
  const kinds = [...new Set([...s.shipped, ...s.saved].map(q => q.instrument.is))]
  const box: [number, number, number, number] = [12, FACE_Y, W - 24, MODULE_H]
  s.kit.module(RACK, 'add', { box, title: 'ADD A DEVICE' })
  const per = Math.ceil(kinds.length / 2)
  const w = (box[2] - PAD * 2 - GAP * (per - 1)) / per
  kinds.forEach((k, i) => {
    const look = INSTRUMENTS[k]
    s.kit.button(RACK, `add:${k}`, {
      at: [box[0] + PAD + (i % per) * (w + GAP), box[1] + HEAD + PAD + Math.floor(i / per) * (TAB_H + GAP)],
      size: [w, TAB_H],
      label: look?.name ?? k.toUpperCase(),
      ...(look ? { accent: look.accent } : {}),
      onPress: () => { adding = false; s.addDevice(k) },
    })
  })
}

function faceplate(s: Studio) {
  const v = s.view
  const p = s.project
  const t = p.rack[v.device]
  const box = LAYOUT.rack
  s.chassis(RACK, box)
  if (adding || !t) {
    s.top(RACK, box[2], 'RACK', `${p.rack.length} DEVICE${p.rack.length === 1 ? '' : 'S'}`, MASTER)
    instruments(s, box[2])
    return
  }
  const look = INSTRUMENTS[t.instrument.is] ?? { name: t.instrument.is.toUpperCase(), sub: '', accent: accentOf(t.instrument) }
  const W = box[2]
  const from = p.tracks.flatMap((x, i) => (x.kind === 'notes' && x.target === v.device ? [`${i + 1}`] : []))
  s.top(RACK, W, look.name, `${t.name} / ${from.length ? `FROM TRACK${from.length === 1 ? '' : 'S'} ${from.join(' ')}` : 'NO TRACK'}`, look.accent)
  const preset = s.presetName() ?? 'CUSTOM'
  // The preset: ◀ the LCD ▶ and Save, at the bar's right.
  const right = W - 24
  if (saving) {
    const input = s.el<HTMLInputElement>(RACK, 'save:name', 'st-input', [right - 24 - 64 - 64 - 220, 19, 220, 26], undefined, 'input')
    if (!input.dataset.made) {
      input.dataset.made = '1'
      input.value = preset
      input.setAttribute('aria-label', 'Preset name')
      input.focus()
    }
    s.kit.button(RACK, 'save:ok', { at: [right - 64 - 64 - 8, 20], size: [60, 24], label: 'OK', onPress: () => { s.savePreset(input.value); saving = false } })
    s.kit.button(RACK, 'save:cancel', { at: [right - 64, 20], size: [60, 24], label: 'CANCEL', onPress: () => (saving = false) })
  } else {
    s.kit.button(RACK, 'patch-', { at: [right - 60 - 28 - 230 - 28, 20], size: [24, 24], label: '◀', onPress: () => s.stepPreset(-1) })
    s.kit.lcd(RACK, 'patch', { at: [right - 60 - 28 - 230, 18], size: [226, 28], lines: [preset.toUpperCase()] })
    s.kit.button(RACK, 'patch+', { at: [right - 60 - 28, 20], size: [24, 24], label: '▶', onPress: () => s.stepPreset(1) })
    s.kit.button(RACK, 'save', { at: [right - 60, 20], size: [60, 24], label: 'SAVE', onPress: () => (saving = true) })
  }
  const plate = s.plate([0, FACE_Y, W, box[3] - FACE_Y], look.accent)
  if (plate) drawPanel(s, RACK, plate, look.accent)
}

// One press as one gesture: a pick, a step or a tag, each one step of undo when it changed the song.
const once = (s: Studio, act: () => void) => {
  s.gesture.begin()
  act()
  s.gesture.end()
}

// A faceplate's panel (`panels.ts`) drawn on `panel`: its grooves, each section's title, and every
// control in its box.
function drawPanel(s: Studio, name: string, p: Panel, accent: string) {
  p.dividers.forEach((d, i) => s.el(name, `groove:${i}`, 'st-groove', d))
  p.sections.forEach((sec, i) => {
    if (sec.title) s.el(name, `title:${i}`, 'st-sectitle', [sec.box[0] + 14, sec.box[1] + 8, sec.box[2] - 28, 14], sec.title)
    for (const it of sec.items) drawItem(s, name, it, accent)
  })
}

// A tile, a cell or a pad lit while picked, in the instrument's accent, which its own element carries.
function lit(el: HTMLElement, on: boolean, accent: string) {
  if (el.style.getPropertyValue('--accent') !== accent) el.style.setProperty('--accent', accent)
  if (el.classList.contains('st-on') !== on) el.classList.toggle('st-on', on)
}

function drawItem(s: Studio, name: string, it: Placed, accent: string) {
  const [x, y, w, h] = it.box
  const key = `p:${it.key}`
  switch (it.kind) {
    case 'knob': {
      // A knob that is a Tone option of the picked device's instrument is automated from its right button.
      const knob: Knob | undefined = it.option ? { part: 'instrument', device: s.view.device, path: it.option } : undefined
      const el = s.kit.knob(name, key, {
        at: [x, y], label: it.label, value: it.value, range: [it.min, it.max], log: it.log, ...(it.step === undefined ? {} : { step: it.step }),
        reset: it.reset, shown: it.shown ?? shown, accent, dial: it.dial, onChange: v => it.set(v), gesture: s.gesture,
        ...(knob ? { onMenu: () => s.automate(knob) } : {}),
      })
      if (knob) s.mark(el, knob)
      return
    }
    case 'tiles':
    case 'seg': {
      const rows = Math.ceil(it.options.length / it.cols)
      const gap = it.kind === 'tiles' ? 4 : 0
      const cw = (w - gap * (it.cols - 1)) / it.cols, ch = (h - gap * (rows - 1)) / rows
      it.options.forEach((o, i) => {
        const box: [number, number, number, number] = [x + (i % it.cols) * (cw + gap), y + Math.floor(i / it.cols) * (ch + gap), cw, ch]
        const cell = s.el(name, `${key}:${i}`, it.kind === 'tiles' ? 'st-tile' : 'st-cell', box)
        const inner = it.kind === 'tiles' ? `<svg viewBox="-2 -2 44 24"><path d="${icon(o.icon ?? '')}" fill="none" stroke="#2f3642" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg><span>${o.name}</span>` : o.name
        if (cell.dataset.made !== inner) {
          cell.dataset.made = inner
          cell.innerHTML = inner
        }
        lit(cell, o.value === it.on, accent)
        s.dom.surface(name, `${key}:${i}:press`, box, { down: () => { if (o.value !== it.on) once(s, () => it.pick(o.value)) } })
        s.dom.cursor(name, `${key}:${i}:press`, 'pointer')
      })
      return
    }
    case 'step': {
      const el = s.el(name, key, 'st-step', it.box)
      const inner = `<b>${it.label}</b><span>◂</span><span>${it.shown}</span><span>▸</span>`
      if (el.dataset.made !== inner) {
        el.dataset.made = inner
        el.innerHTML = inner
      }
      s.dom.surface(name, `${key}:less`, [x, y, w / 2, h], { down: () => once(s, () => it.step(-1)) })
      s.dom.surface(name, `${key}:more`, [x + w / 2, y, w / 2, h], { down: () => once(s, () => it.step(1)) })
      s.dom.cursor(name, `${key}:less`, 'pointer')
      s.dom.cursor(name, `${key}:more`, 'pointer')
      return
    }
    case 'screen': {
      const el = s.el(name, key, 'st-screen', it.box)
      const drawn = it.svg(Math.round(w), Math.round(h))
      if (el.dataset.drawn !== drawn) {
        el.dataset.drawn = drawn
        el.innerHTML = drawn
      }
      // The curve tags along the screen's top right, a press stepping each.
      let tx = x + w - 6
      for (const t of [...(it.tags ?? [])].reverse()) {
        const tw = 12 + t.shown.length * 6
        tx -= tw
        const box: [number, number, number, number] = [tx, y + 5, tw, 16]
        s.el(name, `${key}:${t.key}`, 'st-tag', box, t.shown)
        s.dom.surface(name, `${key}:${t.key}:press`, box, { down: () => once(s, t.step) })
        s.dom.cursor(name, `${key}:${t.key}:press`, 'pointer')
        tx -= 4
      }
      return
    }
    case 'pads': {
      const gap = 8, cols = 4, rows = Math.ceil(it.pads.length / cols)
      const pw = (w - gap * (cols - 1)) / cols, ph = (h - gap * (rows - 1)) / rows
      it.pads.forEach((pad, i) => {
        const box: [number, number, number, number] = [x + (i % cols) * (pw + gap), y + Math.floor(i / cols) * (ph + gap), pw, ph]
        const el = s.el(name, `${key}:${pad.note}`, 'st-pad', box)
        const inner = `<b>${pad.name}</b><i>${pad.note}</i>`
        if (el.dataset.made !== inner) {
          el.dataset.made = inner
          el.innerHTML = inner
        }
        lit(el, pad.on, accent)
        s.dom.surface(name, `${key}:${pad.note}:press`, box, { down: () => pad.pick() })
        s.dom.cursor(name, `${key}:${pad.note}:press`, 'pointer')
      })
      return
    }
  }
}

// Whose chain, its name, and its accent.
function whose(s: Studio, target: Target): { chain: Effect[]; sub: string; accent: string } {
  const p = s.project
  if (typeof target === 'number') {
    const d = p.rack[target]!
    return { chain: d.effects, sub: `DEVICE ${target + 1} / ${d.name}`, accent: accentOf(d.instrument) }
  }
  if (target === 'master') return { chain: p.master.effects, sub: 'MASTER', accent: MASTER }
  return { chain: p.buses[target]!.effects, sub: `BUS ${target.toUpperCase()}`, accent: RETURN }
}

const STATE = ['ON', 'OFF']
// The effects' scroll, in panel units, and an effect being dragged to a new place.
let scroll = 0
let moving: { from: number; to: number } | undefined

function effectsPanel(s: Studio) {
  const box = LAYOUT.inserts
  const W = box[2], H = box[3]
  const target = s.view.target
  const chainAt = chainOf(target)
  const { chain, sub, accent } = whose(s, target)
  const catalogue = s.effects
  const kinds = Object.keys(catalogue)
  s.chassis(INS, box)
  s.top(INS, W, 'EFFECTS', sub, accent)
  s.kit.lcd(INS, 'count', { at: [W - 24 - 170, 18], size: [170, 28], lines: [`CHAIN: ${chain.length} EFFECT${chain.length === 1 ? '' : 'S'}`] })
  const plateOf = (u: Effect) => catalogue[u.is] ?? { wet: true }
  const controls = chain.map((u, i) => s.effectControls(chainAt, i, u))
  const laid = chain.map((u, i) => lay([...(plateOf(u).wet ? [switchWidth(STATE)] : []), ...controls[i]!.map(widthOf)], W - 24 - PAD * 2))
  // The effects to add, as many to a row of the ADD EFFECT module as their labels fit.
  const inner = W - 24 - PAD * 2
  const rows: string[][] = []
  for (const k of kinds) {
    const last = rows[rows.length - 1]
    if (last && switchWidth([...last, k]) <= inner) last.push(k)
    else rows.push([k])
  }
  const ROW_PITCH = KNOB[1] - SWITCH_H
  const boxes = flow([...laid.map(l => l.size), [W - 24, MODULE_H + (rows.length - 1) * ROW_PITCH] as [number, number]], W, TOP_Y - scroll)
  const tall = boxes[boxes.length - 1]![1] + boxes[boxes.length - 1]![3] + scroll - TOP_Y
  const room = H - TOP_Y - 12
  scroll = Math.max(0, Math.min(Math.max(0, tall - room), scroll))
  // The wheel over the panel scrolls it.
  s.dom.surface(INS, 'scroll', [0, TOP_Y, W, room], {
    wheel(_x, _y, _m, _dx, dy) {
      scroll = Math.max(0, Math.min(Math.max(0, tall - room), scroll + dy))
    },
  })
  chain.forEach((u, i) => {
    const b = boxes[i]!
    if (b[1] < TOP_Y || b[1] + b[3] > H) return
    const key = `u:${i}:${u.is}`
    const plate = plateOf(u)
    const places = laid[i]!.places
    s.kit.module(INS, key, { box: b, title: `${i + 1}  ${u.is.toUpperCase()}`, lit: u.on, accent })
    if (moving && moving.to === i && moving.from !== i) s.el(INS, `${key}:drop`, 'st-band', [b[0], b[1] - 4, b[2], 3]).style.background = accent
    // The title is the handle that moves the effect.
    s.dom.surface(INS, `${key}:handle`, [b[0], b[1], b[2] - 24, HEAD], {
      down() {
        moving = { from: i, to: i }
      },
      move(x, y) {
        if (!moving) return
        const px = b[0] + x, py = b[1] + y
        const to = boxes.slice(0, chain.length).findIndex(o => px >= o[0] && px <= o[0] + o[2] && py >= o[1] && py <= o[1] + o[3])
        if (to >= 0) moving.to = to
      },
      up() {
        const m = moving
        moving = undefined
        if (m && m.to !== m.from) s.edit(p => moveEffect(p, chainAt, m.from, m.to))
      },
    })
    s.dom.cursor(INS, `${key}:handle`, 'grab')
    s.kit.button(INS, `${key}:x`, { at: [b[0] + b[2] - 20, b[1] + 1], size: [16, 14], label: '×', onPress: () => s.edit(p => removeEffect(p, chainAt, i)) })
    const shift = plate.wet ? 1 : 0
    if (plate.wet) {
      const [x, y] = places[0]!
      s.kit.switch(INS, `${key}:state`, {
        at: [b[0] + x, b[1] + y + (KNOB[1] - SWITCH_H) / 2],
        width: switchWidth(STATE),
        label: 'STATE',
        options: STATE,
        on: u.on ? 'ON' : 'OFF',
        onPick: o => s.change(p => turnEffect(p, chainAt, i, o === 'ON')),
        gesture: s.gesture,
      })
    }
    controls[i]!.forEach((c, j) => {
      const [x, y] = places[j + shift]!
      draw(s, INS, key, c, b[0] + x, b[1] + y, accent, { part: 'effect', chain: chainAt, effect: i, path: c.key.split('.') })
    })
  })
  const a = boxes[chain.length]!
  if (a[1] >= TOP_Y && a[1] + a[3] <= H) {
    s.kit.module(INS, 'add', { box: a, title: '+ ADD EFFECT' })
    rows.forEach((row, r) => {
      s.kit.switch(INS, `add:type${r}`, {
        at: [a[0] + PAD, a[1] + HEAD + PAD + r * ROW_PITCH],
        width: a[2] - PAD * 2,
        // Every row keeps a label's height, so the rows are evenly apart.
        label: r === 0 ? 'TYPE' : ' ',
        options: row.map(n => n.toUpperCase()),
        on: '',
        onPick: o => s.change(p => addEffect(p, chainAt, { is: kinds.find(n => n.toUpperCase() === o)!, on: true, options: {} })),
        gesture: s.gesture,
      })
    })
  }
}

export function setup() {}

export function tick(_row: Row, plugins: Plugins) {
  const s = plugins.studio as Studio
  tabs(s)
  faceplate(s)
  effectsPanel(s)
}

export function remove() {
  saving = false
  adding = false
  tabbing = undefined
  tapped = undefined
  moving = undefined
  scroll = 0
}
