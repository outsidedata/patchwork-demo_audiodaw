// The faceplate of every instrument, pure: what each one shows and where, as the mockup the studio's
// author approved lays them out. A panel is sections in columns, left to right in the order the
// sound flows through them (the oscillators, the filter, the envelopes that move them, then glide,
// tune and level), each section a title and rows of controls laid in its box. `panel` hands back
// every section with its box and every control with its own, in the faceplate's units, for the rack
// to draw (`rack.client.ts`); nothing here draws, plays or reads a key.
//
// The values. Each control reads Tone's options as Tone holds them (`optionsOf`, its `get()`, so a
// fat oscillator's `count` and `spread` are there), and writes the song's own options (only what was
// asked), at Tone's path for it, as the whole new instrument (`write`): one step of undo. Its range,
// label and reset are the definition's (`studio.controls`, by `faceplate.ts`'s `lookup`), its label
// changed where the panel names it for what it does (a filter envelope's `baseFrequency` is CUTOFF,
// its `octaves` ENV AMT). A knob resets to Tone's own default for it.
//
// The instruments, by Tone's class:
//   MonoSynth   OSCILLATOR | FILTER | FILTER ENVELOPE over AMP ENVELOPE | OUT
//   Synth       OSCILLATOR | AMP ENVELOPE | OUT (Tone's Synth has no filter)
//   FMSynth     CARRIER over FM | MODULATOR | MODULATION ENVELOPE over AMP ENVELOPE | OUT
//   AMSynth     the same, AM in place of FM, with no INDEX
//   DuoSynth    VOICE 1 / VOICE 2 picked over that voice's OSCILLATOR | FILTER | its envelopes, then
//               LINK (voice 2's pitch ratio, the vibrato) | OUT
//   MembraneSynth  PITCH SWEEP | TONE | AMP ENVELOPE | OUT
//   MetalSynth  METAL | ENVELOPE (no sustain) | OUT
//   NoiseSynth  NOISE | AMP ENVELOPE | OUT
//   PluckSynth  STRING | OUT
// Every synth's OUT starts with VOICES, how many of it the device plays at once. A drum
// kit is PADS (a pad each, its choke group, the kit's level) | the picked pad's SOUND over that drum's
// panel, its own PITCH and LEVEL in place of OUT.
//
// An oscillator is its WAVE, its SOURCE (plain, fat, AM, FM, pulse, PWM), HARMONICS, the options its
// source brings (a fat one's VOICES and SPREAD, AM's RATIO and MOD WAVE, FM's RATIO and INDEX, a
// pulse's WIDTH, PWM's RATE), a custom wave's partials H1… a knob each, and its scope. A change of wave
// or source writes the oscillator anew, keeping its `phase`, so nothing of the old source is left.
// Every envelope has its screen, with the curve of its attack, decay and release as tags on it, a
// press stepping each. Tone's options a panel leaves off are the ones that do nothing a player hears
// apart from another control: an oscillator's `phase` and a filter's `detune` (the cutoff's own).
import { DRUM_KIT, type Instrument, type KitOptions, type Pad } from '#plugins/audiodaw/audiodaw.sim.ts'
import { knobSize } from '#plugins/renderdom/controls.ts'
import * as Tone from 'tone'
import { lookup, parseType, setAt, typeOf, type Controls, type Kind, type Source, type Wave } from './faceplate.ts'
import * as draw from './screens.ts'

export type Box = [number, number, number, number]
// `option`: the knob's path in the instrument's options (a kit pad's under `pads.<note>.options`),
// for one that is a Tone option, so an automation track can aim at it; none for a knob the panel
// works out itself (harmonics, partials, a pad's pitch).
export type KnobItem = { kind: 'knob'; key: string; label: string; value: number; min: number; max: number; log: boolean; step?: number; reset: number; dial: number; shown?: (v: number) => string; set(v: number): void; option?: string[] }
export type Choice = { value: string | number; name: string; icon?: string }
export type TilesItem = { kind: 'tiles'; key: string; options: Choice[]; on: string | number; cols: number; pick(v: string | number): void }
export type SegItem = { kind: 'seg'; key: string; options: Choice[]; on: string | number; cols: number; pick(v: string | number): void }
export type StepItem = { kind: 'step'; key: string; label: string; shown: string; step(by: number): void }
export type Tag = { key: string; shown: string; step(): void }
export type ScreenItem = { kind: 'screen'; key: string; svg(w: number, h: number): string; tags?: Tag[] }
export type PadsItem = { kind: 'pads'; key: string; pads: { name: string; note: string; on: boolean; pick(): void }[] }
export type Item = KnobItem | TilesItem | SegItem | StepItem | ScreenItem | PadsItem
export type Placed = Item & { box: Box }
export type Section = { title: string; box: Box; items: Placed[] }
export type Panel = { sections: Section[]; dividers: Box[] }

// A row of a section: knobs spread across it, or one or more controls filling its width (`full`), of
// a fixed height or sharing what is left (`fill`, no less than `min`).
type Row = { items: Item[]; full?: boolean; fill?: number }
type SectionSpec = { title: string; rows: Row[] }
type Col = { w: number | 'fr'; fr?: number; stack: Stack[] }
type Stack = { sec: SectionSpec; weight?: number } | { cols: Col[]; weight?: number }

// The dials: big for a section's main knobs, the kit's own size, small for the rest.
export const DIAL = { L: 50, M: 40, S: 28 } as const
const PAD_X = 14, PAD_TOP = 8, PAD_BOTTOM = 10, TITLE_H = 14, GAP = 8
const TILE_H = 38, SEG_H = 24, STEP_H = 22

// ---------- layout ----------
function heightOf(row: Row): number {
  if (row.fill !== undefined) return row.fill
  const first = row.items[0]!
  if (first.kind === 'knob') return Math.max(...row.items.map(i => (i.kind === 'knob' ? knobSize(i.dial)[1] : 0)))
  if (first.kind === 'tiles') return TILE_H * Math.ceil(first.options.length / first.cols) + 4 * (Math.ceil(first.options.length / first.cols) - 1)
  if (first.kind === 'seg') return SEG_H * Math.ceil(first.options.length / first.cols)
  if (first.kind === 'step') return STEP_H
  return 40
}
// A section with no title gives its title's room to its rows.
const head = (s: SectionSpec) => (s.title ? TITLE_H + GAP : 0)
const natural = (s: SectionSpec) => PAD_TOP + head(s) + s.rows.reduce((a, r) => a + heightOf(r), 0) + GAP * (s.rows.length - 1) + PAD_BOTTOM

function placeSection(s: SectionSpec, box: Box): Section {
  const [x, y, w, h] = box
  const iw = w - PAD_X * 2
  const fixed = s.rows.filter(r => r.fill === undefined).reduce((a, r) => a + heightOf(r), 0)
  const fills = s.rows.filter(r => r.fill !== undefined)
  const room = h - PAD_TOP - head(s) - PAD_BOTTOM - GAP * (s.rows.length - 1) - fixed
  const fillMin = fills.reduce((a, r) => a + r.fill!, 0)
  const extra = fills.length ? Math.max(0, room - fillMin) / fills.length : 0
  let ry = y + PAD_TOP + head(s)
  const items: Placed[] = []
  for (const r of s.rows) {
    const rh = r.fill !== undefined ? r.fill + extra : heightOf(r)
    if (r.full || r.items[0]!.kind !== 'knob') {
      const each = (iw - GAP * (r.items.length - 1)) / r.items.length
      r.items.forEach((it, i) => items.push({ ...it, box: [x + PAD_X + i * (each + GAP), ry, each, rh] }))
    } else {
      // Knobs spread across the row, each with an even share of the room around it, sat on its floor.
      const sizes = r.items.map(it => knobSize((it as KnobItem).dial))
      const free = (iw - sizes.reduce((a, [kw]) => a + kw, 0)) / r.items.length
      let kx = x + PAD_X + free / 2
      r.items.forEach((it, i) => {
        const [kw, kh] = sizes[i]!
        items.push({ ...it, box: [kx, ry + rh - kh, kw, kh] })
        kx += kw + free
      })
    }
    ry += rh + GAP
  }
  return { title: s.title, box, items }
}

function placeCols(cols: Col[], box: Box, out: Panel) {
  const [x, y, w, h] = box
  const fixed = cols.reduce((a, c) => a + (c.w === 'fr' ? 0 : c.w), 0)
  const frs = cols.reduce((a, c) => a + (c.w === 'fr' ? c.fr ?? 1 : 0), 0)
  let cx = x
  cols.forEach((c, i) => {
    const cw = c.w === 'fr' ? ((w - fixed) * (c.fr ?? 1)) / frs : c.w
    if (i > 0) out.dividers.push([cx, y, 1, h])
    placeStack(c.stack, [cx, y, cw, h], out)
    cx += cw
  })
}
function placeStack(stack: Stack[], box: Box, out: Panel) {
  const [x, y, w, h] = box
  // A part with no weight is as tall as it needs; the rest share what is left by weight.
  const sized = stack.map(s => ('sec' in s && s.weight === undefined ? natural(s.sec) : 0))
  const weights = stack.reduce((a, s, i) => a + (sized[i] ? 0 : s.weight ?? 1), 0)
  const left = h - sized.reduce((a, b) => a + b, 0)
  let sy = y
  stack.forEach((s, i) => {
    const sh = sized[i] || (left * (s.weight ?? 1)) / weights
    if (i > 0) out.dividers.push([x, sy, w, 1])
    if ('sec' in s) out.sections.push(placeSection(s.sec, [x, sy, w, sh]))
    else placeCols(s.cols, [x, sy, w, sh], out)
    sy += sh
  })
}

// ---------- binding ----------
const at = (o: unknown, path: string[]): unknown => path.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o)
function defaultsOf(is: string): object {
  const made = (Tone as unknown as Record<string, { getDefaults?: () => object }>)[is]
  return made?.getDefaults?.() ?? {}
}

// Where a panel reads and writes: the Tone class whose ranges and defaults apply, Tone's options as
// it holds them, the song's own, and what takes the song's new ones.
// `prefix`: where its options lie in the instrument's (a kit pad's: `pads.<note>.options`).
export type Root = { is: string; live: object; song: object; write(options: object): void; accent: string; c: Controls; voices?: Item; prefix: string[] }

const shown = (v: number) => {
  const a = Math.abs(v)
  return a >= 1000 ? `${(v / 1000).toFixed(a >= 10000 ? 1 : 2)}k` : a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2)
}

function knob(r: Root, path: string, dial: number, label?: string, key = path): KnobItem {
  const p = path.split('.')
  const range = lookup(r.c.knobs, r.is, p)
  if (!range) throw new Error(`panels: ${r.is}.${path} has no range`)
  const value = at(r.live, p)
  if (typeof value !== 'number') throw new Error(`panels: Tone holds no number at ${r.is}.${path}`)
  const fallback = at(defaultsOf(r.is), p)
  return {
    kind: 'knob', key, label: label ?? range.label, value, min: range.min, max: range.max, log: range.curve === 'log',
    ...(range.step === undefined ? {} : { step: range.step }), reset: typeof fallback === 'number' ? fallback : value, dial,
    shown: range.step === 1 ? (v: number) => String(Math.round(v)) : shown,
    set: v => r.write(setAt(r.song, p, v)),
    option: [...r.prefix, ...p],
  }
}

// A switch's choices from the definition, by key.
function choices(r: Root, key: string): { values: (string | number)[]; names: string[] } {
  const ch = r.c.switches[key]
  if (!ch) throw new Error(`panels: the definition has no switch ${key}`)
  return ch
}
const options = (r: Root, key: string): Choice[] => { const ch = choices(r, key); return ch.values.map((value, i) => ({ value, name: ch.names[i]! })) }

function seg(r: Root, path: string, key: string, cols?: number): SegItem {
  const p = path.split('.')
  const opts = options(r, key)
  const on = at(r.live, p) as string | number
  if (!opts.some(o => o.value === on)) throw new Error(`panels: ${r.is}.${path} is ${String(on)}, none of the ${key} switch's`)
  return { kind: 'seg', key: path, options: opts, on, cols: cols ?? opts.length, pick: v => r.write(setAt(r.song, p, v)) }
}

// An envelope's screen and its stages' curves, and its knobs: attack, decay, sustain (unless it has
// none), release, and a filter envelope's curve.
function envelope(r: Root, path: string, title: string, o: { dial?: number; short?: boolean; curve?: boolean; noSustain?: boolean } = {}): SectionSpec {
  const e = at(r.live, path.split('.')) as draw.Envelope & Record<string, unknown>
  const stages = ['attack', 'decay', ...(o.noSustain ? [] : ['sustain']), 'release']
  const dial = o.dial ?? DIAL.M
  const tag = (curve: string, letter: string): Tag => {
    const ch = choices(r, curve)
    const now = e[curve] as string
    const i = ch.values.indexOf(now)
    return { key: `${path}.${curve}`, shown: `${letter} ${ch.names[i] ?? String(now).toUpperCase()}`, step: () => r.write(setAt(r.song, [...path.split('.'), curve], ch.values[(i + 1) % ch.values.length])) }
  }
  const knobs = stages.map(s => knob(r, `${path}.${s}`, dial, o.short ? s[0]!.toUpperCase() : undefined))
  if (o.curve) knobs.push(knob(r, `${path}.exponent`, dial, o.short ? 'CRV' : 'CURVE'))
  return {
    title,
    rows: [
      { items: [{ kind: 'screen', key: `${path}:screen`, svg: (w, h) => draw.envelope(w, h, e, r.accent), tags: [tag('attackCurve', 'A'), tag('decayCurve', 'D'), tag('releaseCurve', 'R')] }], fill: 40 },
      { items: knobs },
    ],
  }
}

const WAVE_ICON: Record<string, string> = {
  sine: 'M0 10 C 6 -4, 14 -4, 20 10 S 34 24, 40 10',
  square: 'M0 18 V2 H20 V18 H40 V2',
  sawtooth: 'M0 18 L20 2 V18 L40 2 V18',
  triangle: 'M0 18 L10 2 L20 18 L30 2 L40 18',
  custom: 'M0 14 C4 0 8 0 10 10 S 16 20 20 8 S 28 2 30 12 S 38 18 40 6',
  pulse: 'M0 18 V2 H8 V18 H20 V2 H28 V18 H40',
  white: 'M0 10 L2 4 L4 15 L6 6 L8 13 L10 3 L12 16 L14 8 L16 12 L18 2 L20 17 L22 7 L24 14 L26 4 L28 15 L30 9 L32 12 L34 3 L36 16 L38 6 L40 11',
  pink: 'M0 10 L3 6 L6 13 L9 7 L12 12 L15 5 L18 14 L21 8 L24 11 L27 6 L30 13 L33 8 L36 12 L40 9',
  brown: 'M0 12 L5 9 L10 11 L15 7 L20 9 L25 6 L30 10 L35 12 L40 9',
}
export const icon = (name: string) => WAVE_ICON[name]

// An oscillator's rows: its wave (or its source, for a pulse), its source, its harmonics and what its
// source brings, a custom wave's partials, and its scope.
function oscillator(r: Root, path: string, o: { waves?: Wave[]; sources?: Source[]; sourceCols?: number; waveCols?: number } = {}): Row[] {
  const p = path.split('.')
  const live = at(r.live, p) as draw.Oscillator & Record<string, unknown>
  const song = (at(r.song, p) ?? {}) as Record<string, unknown>
  const kind = parseType(live.type)
  const partials = (live.partials ?? []) as number[]
  const write = (k: Kind, own?: number[]) => {
    const fresh: Record<string, unknown> = {}
    if (song.phase !== undefined) fresh.phase = song.phase
    if (k.wave === 'custom' && k.source !== 'pulse' && k.source !== 'pwm') fresh.partials = own ?? (partials.length ? partials : [1, 0.5, 0.33, 0.25])
    fresh.type = typeOf(k)
    r.write(setAt(r.song, p, fresh))
  }
  const pulsing = kind.source === 'pulse' || kind.source === 'pwm'
  const waveCh = choices(r, 'wave'), srcCh = choices(r, 'source')
  const waves = (o.waves ?? (waveCh.values as Wave[])).map(w => ({ value: w, name: waveCh.names[waveCh.values.indexOf(w)]!, icon: w }))
  const sources = (o.sources ?? (srcCh.values as Source[])).map(s => ({ value: s, name: srcCh.names[srcCh.values.indexOf(s)]! }))
  const rows: Row[] = [
    pulsing
      ? { items: [{ kind: 'tiles', key: `${path}.wave`, options: [{ value: kind.source, name: kind.source.toUpperCase(), icon: 'pulse' }], on: kind.source, cols: 1, pick: () => {} }] }
      : { items: [{ kind: 'tiles', key: `${path}.wave`, options: waves, on: kind.wave, cols: o.waveCols ?? waves.length, pick: v => write({ ...kind, wave: v as Wave }) }] },
    {
      items: [{
        kind: 'seg', key: `${path}.source`, options: sources, on: kind.source, cols: o.sourceCols ?? 3,
        pick: v => {
          const source = v as Source
          const was = kind.source === 'pulse' || kind.source === 'pwm'
          write({ source, wave: was ? 'sawtooth' : kind.wave, count: was ? 0 : kind.count })
        },
      }],
    },
  ]
  const knobs: KnobItem[] = []
  const harmonics = lookup(r.c.knobs, r.is, ['harmonics'])!
  if (!pulsing && kind.wave !== 'custom')
    knobs.push({ kind: 'knob', key: `${path}.harmonics`, label: harmonics.label, value: kind.count, min: harmonics.min, max: harmonics.max, log: false, step: 1, reset: 0, dial: DIAL.S, shown: v => (Math.round(v) ? String(Math.round(v)) : 'ALL'), set: n => write({ ...kind, count: Math.round(n) }) })
  if (!pulsing && kind.wave === 'custom')
    knobs.push({ kind: 'knob', key: `${path}.harmonics`, label: harmonics.label, value: partials.length, min: 1, max: 8, log: false, step: 1, reset: 4, dial: DIAL.S, shown: v => String(Math.round(v)), set: n => write(kind, Array.from({ length: Math.max(1, Math.round(n)) }, (_, i) => partials[i] ?? 0)) })
  const brought: Record<string, string[]> = { fat: ['count', 'spread'], am: ['harmonicity'], fm: ['harmonicity', 'modulationIndex'], pulse: ['width'], pwm: ['modulationFrequency'] }
  for (const k of brought[kind.source] ?? []) knobs.push(knob(r, `${path}.${k}`, DIAL.S))
  if (knobs.length) rows.push({ items: knobs })
  if (kind.source === 'am' || kind.source === 'fm') rows.push({ items: [seg(r, `${path}.modulationType`, 'modulationType')] })
  if (!pulsing && kind.wave === 'custom') {
    // The partials four to a row, so eight fit the narrowest oscillator.
    const partial = lookup(r.c.knobs, r.is, ['partial'])!
    const knobs = partials.map((v, i) => ({
      kind: 'knob' as const, key: `${path}.partials.${i}`, label: `H${i + 1}`, value: v, min: partial.min, max: partial.max, log: false, reset: 1 / (i + 1), dial: DIAL.S, shown,
      set: (x: number) => write(kind, partials.map((q, j) => (j === i ? x : q))),
    }))
    for (let i = 0; i < knobs.length; i += 4) rows.push({ items: knobs.slice(i, i + 4) })
  }
  rows.push({ items: [{ kind: 'screen', key: `${path}:scope`, svg: (w, h) => draw.scope(w, h, live, r.accent) }], fill: 30 })
  return rows
}

function filterSection(r: Root, path: string, envPath: string, title: string, o: { typeCols?: number } = {}): SectionSpec {
  const f = at(r.live, path.split('.')) as Record<string, number | string>
  const env = at(r.live, envPath.split('.')) as Record<string, number>
  const shelf = ['lowshelf', 'highshelf', 'peaking'].includes(f.type as string)
  const step = (key: string, label: string): StepItem => {
    const ch = choices(r, key)
    const i = ch.values.indexOf(f.rolloff as number)
    return { kind: 'step', key: `${path}.rolloff`, label, shown: `${ch.names[i]} dB`, step: by => r.write(setAt(r.song, [...path.split('.'), 'rolloff'], ch.values[(i + by + ch.values.length) % ch.values.length])) }
  }
  return {
    title,
    rows: [
      { items: [{ kind: 'screen', key: `${path}:screen`, svg: (w, h) => draw.filter(w, h, { type: f.type as string, cutoff: env.baseFrequency!, Q: f.Q as number, rolloff: f.rolloff as number, gain: f.gain as number }, r.accent) }], fill: 60 },
      { items: [{ ...seg(r, `${path}.type`, 'filter.type', o.typeCols ?? 4), options: FILTER_ORDER.map(value => ({ value, name: FILTER_NAMES[value]! })) }] },
      { items: [knob(r, `${envPath}.baseFrequency`, DIAL.L, 'CUTOFF'), knob(r, `${path}.Q`, DIAL.L), knob(r, `${envPath}.octaves`, DIAL.M, 'ENV AMT')] },
      { items: [step('rolloff', 'SLOPE')] },
      ...(shelf ? [{ items: [knob(r, `${path}.gain`, DIAL.M)] }] : []),
    ],
  }
}
// The filter types in the order a synth's filter offers them, the passes first, spelled out.
const FILTER_ORDER = ['lowpass', 'highpass', 'bandpass', 'notch', 'lowshelf', 'highshelf', 'peaking', 'allpass']
const FILTER_NAMES: Record<string, string> = { lowpass: 'LOWPASS', highpass: 'HIGHPASS', bandpass: 'BANDPASS', notch: 'NOTCH', lowshelf: 'LO SHELF', highshelf: 'HI SHELF', peaking: 'PEAK', allpass: 'ALLPASS' }

// OUT: a synth's voices, glide and tune where the instrument has them, and its level.
function out(r: Root, o: { glide?: boolean } = {}): SectionSpec {
  const items: Item[] = r.voices ? [r.voices] : []
  if (o.glide) items.push(knob(r, 'portamento', DIAL.M, 'GLIDE'), knob(r, 'detune', DIAL.M, 'TUNE'))
  items.push(knob(r, 'volume', DIAL.L))
  return { title: 'OUT', rows: items.map(i => ({ items: [i], fill: 0 })) }
}

// ---------- the instruments ----------
type Body = { cols: Col[] }
const col = (w: number | 'fr', ...stack: Stack[]): Col => ({ w, stack })
const sec = (s: SectionSpec, weight?: number): Stack => (weight === undefined ? { sec: s } : { sec: s, weight })

function body(r: Root, tail: Col[] = [], width = 960): Body {
  const outCol = tail.length ? tail : [col(96, sec(out(r, { glide: r.is !== 'MetalSynth' && r.is !== 'NoiseSynth' && r.is !== 'PluckSynth' && r.is !== 'MembraneSynth' }), 1))]
  const narrow = width < 900
  switch (r.is) {
    case 'MonoSynth': {
      const env = { dial: narrow ? DIAL.S : DIAL.M, short: narrow }
      return { cols: [col(narrow ? 215 : 250, sec({ title: 'OSCILLATOR', rows: oscillator(r, 'oscillator') }, 1)), col(narrow ? 250 : 268, sec(filterSection(r, 'filter', 'filterEnvelope', 'FILTER'), 1)), col('fr', sec(envelope(r, 'filterEnvelope', 'FILTER ENVELOPE', { ...env, curve: true }), 1), sec(envelope(r, 'envelope', 'AMP ENVELOPE', env), 1)), ...outCol] }
    }
    case 'Synth':
      return { cols: [col(narrow ? 220 : 300, sec({ title: 'OSCILLATOR', rows: oscillator(r, 'oscillator') }, 1)), col('fr', sec(envelope(r, 'envelope', 'AMP ENVELOPE'), 1)), ...outCol] }
    case 'FMSynth':
    case 'AMSynth': {
      const fm = r.is === 'FMSynth'
      const ratio: SectionSpec = { title: fm ? 'FM' : 'AM', rows: [{ items: [knob(r, 'harmonicity', DIAL.L), ...(fm ? [knob(r, 'modulationIndex', DIAL.L)] : [])], fill: 0 }] }
      return {
        cols: [
          col(narrow ? 205 : 'fr', sec({ title: 'CARRIER', rows: oscillator(r, 'oscillator') }, 2), sec(ratio, 1)),
          col(narrow ? 205 : 'fr', sec({ title: 'MODULATOR', rows: oscillator(r, 'modulation') }, 1)),
          col('fr', sec(envelope(r, 'modulationEnvelope', 'MODULATION ENVELOPE', { dial: narrow ? DIAL.S : DIAL.M, short: narrow }), 1), sec(envelope(r, 'envelope', 'AMP ENVELOPE', { dial: narrow ? DIAL.S : DIAL.M, short: narrow }), 1)),
          ...outCol,
        ],
      }
    }
    case 'MembraneSynth':
      return {
        cols: [
          col(narrow ? 170 : 'fr', sec({ title: 'PITCH SWEEP', rows: [{ items: [{ kind: 'screen', key: 'sweep', svg: (w, h) => draw.sweep(w, h, r.live as { octaves: number; pitchDecay: number }, r.accent) }], fill: 60 }, { items: [knob(r, 'octaves', narrow ? DIAL.M : DIAL.L, 'SWEEP'), knob(r, 'pitchDecay', narrow ? DIAL.M : DIAL.L, narrow ? 'TIME' : 'SWEEP TIME')] }] }, 1)),
          col(narrow ? 150 : 230, sec({ title: 'TONE', rows: oscillator(r, 'oscillator', { waves: ['sine', 'square', 'sawtooth', 'triangle'], waveCols: 2, sources: ['', 'fat', 'am', 'fm'], sourceCols: 2 }) }, 1)),
          col('fr', sec(envelope(r, 'envelope', 'AMP ENVELOPE', { dial: narrow ? DIAL.S : DIAL.M, short: narrow }), 1)),
          ...outCol,
        ],
      }
    case 'MetalSynth':
      return {
        cols: [
          col('fr', sec({ title: 'METAL', rows: [{ items: [{ kind: 'screen', key: 'metal', svg: (w, h) => draw.metal(w, h, r.live as { harmonicity: number; modulationIndex: number; resonance: number }, r.accent) }], fill: 60 }, { items: [knob(r, 'resonance', narrow ? DIAL.M : DIAL.L), knob(r, 'harmonicity', DIAL.M), knob(r, 'modulationIndex', DIAL.M), knob(r, 'octaves', DIAL.M)] }] }, 1)),
          col(narrow ? 210 : 'fr', sec(envelope(r, 'envelope', 'ENVELOPE', { noSustain: true, short: narrow }), 1)),
          ...outCol,
        ],
      }
    case 'NoiseSynth': {
      const n = (r.live as { noise: { type: string } }).noise
      const colours = options(r, 'noise.type').map(c => ({ ...c, icon: c.value as string }))
      return {
        cols: [
          col(narrow ? 230 : 300, sec({ title: 'NOISE', rows: [
            { items: [{ kind: 'tiles', key: 'noise.type', options: colours, on: n.type, cols: 3, pick: v => r.write(setAt(r.song, ['noise', 'type'], v)) }] },
            { items: [{ kind: 'screen', key: 'noise', svg: (w, h) => draw.noise(w, h, n.type, r.accent) }], fill: 40 },
            { items: [knob(r, 'noise.playbackRate', DIAL.M), knob(r, 'noise.fadeIn', DIAL.S), knob(r, 'noise.fadeOut', DIAL.S)] },
          ] }, 1)),
          col('fr', sec(envelope(r, 'envelope', 'AMP ENVELOPE', { short: narrow, dial: narrow ? DIAL.S : DIAL.M }), 1)),
          ...outCol,
        ],
      }
    }
    case 'PluckSynth':
      return {
        cols: [
          col('fr', sec({ title: 'STRING', rows: [{ items: [{ kind: 'screen', key: 'string', svg: (w, h) => draw.string(w, h, r.live as { resonance: number; dampening: number; release: number }, r.accent) }], fill: 60 }, { items: [knob(r, 'attackNoise', narrow ? DIAL.M : DIAL.L, 'PICK'), knob(r, 'dampening', narrow ? DIAL.M : DIAL.L), knob(r, 'resonance', narrow ? DIAL.M : DIAL.L, 'SUSTAIN'), knob(r, 'release', narrow ? DIAL.M : DIAL.L)] }] }, 1)),
          ...outCol,
        ],
      }
    default:
      throw new Error(`panels: no faceplate for Tone's ${r.is}`)
  }
}

// A DuoSynth: the picked voice's oscillator, filter and envelopes under a VOICE 1 / VOICE 2 switch,
// then LINK and OUT.
function duo(r: Root, voice: 0 | 1, pickVoice: (v: 0 | 1) => void): Body {
  const v = `voice${voice}`
  const tab: SectionSpec = { title: '', rows: [{ items: [{ kind: 'seg', key: 'part', options: [{ value: 0, name: 'VOICE 1' }, { value: 1, name: 'VOICE 2' }], on: voice, cols: 2, pick: x => pickVoice(x as 0 | 1) }] }] }
  return {
    cols: [
      col('fr', sec(tab), {
        cols: [
          col(205, sec({ title: `VOICE ${voice + 1} OSCILLATOR`, rows: oscillator(r, `${v}.oscillator`) }, 1)),
          col(262, sec(filterSection(r, `${v}.filter`, `${v}.filterEnvelope`, `VOICE ${voice + 1} FILTER`), 1)),
          col('fr', sec(envelope(r, `${v}.filterEnvelope`, 'FILTER ENVELOPE', { dial: DIAL.S, short: true, curve: true }), 1), sec(envelope(r, `${v}.envelope`, 'AMP ENVELOPE', { dial: DIAL.S, short: true }), 1)),
        ],
        weight: 1,
      }),
      col(150, sec({ title: 'LINK', rows: [{ items: [knob(r, 'harmonicity', DIAL.L, 'V2 RATIO')], fill: 0 }, { items: [knob(r, 'vibratoAmount', DIAL.M)], fill: 0 }, { items: [knob(r, 'vibratoRate', DIAL.M)], fill: 0 }] }, 1)),
      col(96, sec(out(r, { glide: true }), 1)),
    ],
  }
}

// VOICES: how many of a synth the device plays at once, a press a voice more or less.
function voices(c: Controls, instrument: Instrument, write: (i: Instrument) => void): Item {
  const most = c.knobs.voices!
  const n = instrument.voices ?? 1
  return { kind: 'step', key: 'voices', label: most.label, shown: String(n), step: by => write({ ...instrument, voices: Math.min(most.max, Math.max(most.min, n + by)) }) }
}

export type PanelOptions = { c: Controls; accent: string; pad?: string; pickPad(note: string): void; voice: 0 | 1; pickVoice(v: 0 | 1): void }

// The faceplate of `instrument`, from Tone's `get()` of it (`live`), laid in `box`, each control
// writing the whole new instrument to `write`.
export function panel(instrument: Instrument, live: object, box: Box, write: (i: Instrument) => void, o: PanelOptions): Panel {
  const out: Panel = { sections: [], dividers: [] }
  const root = (is: string, song: object, tree: object, w: (options: object) => void, prefix: string[] = []): Root => ({ is, live: tree, song, write: w, accent: o.accent, c: o.c, prefix })
  if (instrument.is === DRUM_KIT) {
    const kit = instrument.options as KitOptions
    const tree = live as KitOptions
    const notes = Object.keys(kit.pads).sort((a, b) => Tone.Frequency(a).toMidi() - Tone.Frequency(b).toMidi())
    const picked = o.pad && kit.pads[o.pad] ? o.pad : notes[0]!
    const pad = kit.pads[picked]!
    const setPad = (next: Pad) => write({ ...instrument, options: { ...kit, pads: { ...kit.pads, [picked]: next } } })
    const chokes = o.c.switches.choke!
    const ci = chokes.values.indexOf(pad.choke ?? '')
    const level = o.c.knobs.volume!
    const left: SectionSpec = {
      title: 'PADS',
      rows: [
        { items: [{ kind: 'pads', key: 'pads', pads: notes.map(n => ({ name: kit.pads[n]!.name, note: n, on: n === picked, pick: () => o.pickPad(n) })) }], fill: 120 },
        { items: [{ kind: 'step', key: 'choke', label: 'CHOKE', shown: chokes.names[ci]!, step: by => { const v = chokes.values[(ci + by + chokes.values.length) % chokes.values.length] as string; const { choke: _was, ...rest } = pad; setPad(v ? { ...rest, choke: v } : rest) } }] },
        { items: [{ kind: 'knob', key: 'kit.volume', label: 'KIT LEVEL', value: tree.volume ?? 0, min: level.min, max: level.max, log: false, reset: 0, dial: DIAL.M, shown, set: v => write({ ...instrument, options: { ...kit, volume: v } }), option: ['volume'] }] },
      ],
    }
    const drums = o.c.switches.drum!
    const sound: SectionSpec = {
      title: `PAD ${pad.name} · SOUND`,
      rows: [{ items: [{ kind: 'seg', key: 'pad.is', options: drums.values.map((value, i) => ({ value, name: drums.names[i]! })), on: pad.is, cols: drums.values.length, pick: is => { const { pitch: _p, ...rest } = pad; setPad({ ...rest, is: is as string, options: { volume: (pad.options as { volume?: number }).volume ?? 0 }, ...(is === 'NoiseSynth' ? {} : { pitch: pad.pitch ?? 'C2' }) }) } }] }],
    }
    const r = root(pad.is, pad.options, tree.pads[picked]!.options, options => setPad({ ...pad, options }), ['pads', picked, 'options'])
    const pitched = pad.is !== 'NoiseSynth'
    const pitch = o.c.knobs['pitch.note']!
    const padOut: SectionSpec = {
      title: 'PAD',
      rows: [
        ...(pitched ? [{ items: [{ kind: 'knob' as const, key: 'pad.pitch', label: pitch.label, value: Tone.Frequency(pad.pitch ?? 'C1').toMidi(), min: pitch.min, max: pitch.max, log: false, step: 1, reset: Tone.Frequency('C1').toMidi(), dial: DIAL.M, shown: (v: number) => Tone.Frequency(Math.round(v), 'midi').toNote(), set: (v: number) => setPad({ ...pad, pitch: Tone.Frequency(Math.round(v), 'midi').toNote() }) }], fill: 0 }] : []),
        { items: [knob(r, 'volume', DIAL.M, 'LEVEL', 'pad.volume')], fill: 0 },
      ],
    }
    const inner = body(r, [col(84, sec(padOut, 1))], 690)
    placeCols([col(270, sec(left, 1)), col('fr', sec(sound), { cols: inner.cols, weight: 1 })], box, out)
    return out
  }
  const r = { ...root(instrument.is, instrument.options, live, options => write({ ...instrument, options })), voices: voices(o.c, instrument, write) }
  placeCols(instrument.is === 'DuoSynth' ? duo(r, o.voice, o.pickVoice).cols : body(r).cols, box, out)
  return out
}
