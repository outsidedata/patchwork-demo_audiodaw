import '#plugins/audiodaw/nodeaudio'
import { describe, expect, it } from 'vitest'
import { audiodaw } from '#plugins/audiodaw/audiodaw.plugin.ts'
import { DRUM_KIT, type Device, type Instrument, type KitOptions, type Preset, type Project } from '#plugins/audiodaw/audiodaw.sim.ts'
import type { Controls } from './faceplate.ts'
import { panel, type Box, type KnobItem, type Panel, type Placed, type ScreenItem, type SegItem, type StepItem, type TilesItem, type PadsItem } from './panels.ts'
import defs from '../../assets/demo_audiodaw.json' with { type: 'json' }
import presets from '../../assets/presets.json' with { type: 'json' }

const controls = defs.player.studio.controls as Controls
const shipped = presets as Preset[]
// The faceplate's place under its header, as the rack lays it.
const BOX: Box = [0, 64, 960, 400]

const device = (instrument: Instrument): Device => ({ name: 'd', instrument, effects: [], channel: { volume: 0, pan: 0, mute: false, solo: false }, sends: {} })
const song = (rack: Device[]): Project => ({ bpm: 120, timeSignature: 4, swing: 0, swingSubdivision: '8n', ppq: 192, rack, tracks: [], buses: {}, master: { volume: 0, effects: [] }, clips: [] })

// The panel of `instrument` as audiodaw's Tone holds it, and what its controls last wrote and picked.
function plate(instrument: Instrument, o: { pad?: string; voice?: 0 | 1 } = {}) {
  const daw = audiodaw()
  daw.load(song([device(instrument)]))
  const last: { written?: Instrument; pad?: string; voice?: 0 | 1 } = {}
  const p = panel(instrument, daw.optionsOf(0), BOX, i => (last.written = i), {
    c: controls, accent: '#b7a4ff', ...(o.pad ? { pad: o.pad } : {}), pickPad: n => (last.pad = n), voice: o.voice ?? 0, pickVoice: v => (last.voice = v),
  })
  daw.dispose()
  return { p, last }
}
const items = (p: Panel) => p.sections.flatMap(s => s.items)
function find<T extends Placed>(p: Panel, key: string): T {
  const it = items(p).find(i => i.key === key)
  if (!it) throw new Error(`no ${key} among ${items(p).map(i => i.key).join(' ')}`)
  return it as T
}
const inside = (a: Box, b: Box) => a[0] >= b[0] - 0.5 && a[1] >= b[1] - 0.5 && a[0] + a[2] <= b[0] + b[2] + 0.5 && a[1] + a[3] <= b[1] + b[3] + 0.5
const overlap = (a: Box, b: Box) => a[0] < b[0] + b[2] - 0.5 && b[0] < a[0] + a[2] - 0.5 && a[1] < b[1] + b[3] - 0.5 && b[1] < a[1] + a[3] - 0.5
// The widest a choice's name is drawn: 9px Silkscreen, 6px a letter, a margin each side.
const needs = (name: string) => name.length * 6 + 4

// Every section in the faceplate; every control in its section's box, clear of every other one and of
// the section's title; every choice's cell wide enough for its name.
function sound(p: Panel, what: string) {
  expect(p.sections.length, what).toBeGreaterThan(1)
  for (const s of p.sections) {
    expect(inside(s.box, BOX), `${what}: ${s.title} lies outside the faceplate`).toBe(true)
    const title: Box = [s.box[0], s.box[1], s.box[2], s.title ? 22 : 0]
    s.items.forEach((a, i) => {
      expect(inside(a.box, s.box), `${what}: ${a.key} runs out of ${s.title} (${a.box.map(Math.round)} in ${s.box.map(Math.round)})`).toBe(true)
      expect(a.box[2], `${what}: ${a.key} has no width`).toBeGreaterThan(0)
      expect(a.box[3], `${what}: ${a.key} has no height`).toBeGreaterThan(0)
      if (s.title) expect(overlap(a.box, title), `${what}: ${a.key} lies over ${s.title}'s title`).toBe(false)
      s.items.slice(i + 1).forEach(b => expect(overlap(a.box, b.box), `${what}: ${a.key} lies over ${b.key}`).toBe(false))
      if (a.kind === 'tiles' || a.kind === 'seg') {
        const cw = a.box[2] / a.cols
        for (const o of a.options) expect(cw, `${what}: ${a.key}'s ${o.name} does not fit its cell`).toBeGreaterThanOrEqual(needs(o.name) - (a.kind === 'tiles' ? 8 : 0))
      }
    })
  }
}

describe('faceplate layout', () => {
  it('lays out every shipped preset, every pad of every kit, and every sound a pad can be, inside its sections', () => {
    for (const pre of shipped) {
      if (pre.instrument.is !== DRUM_KIT) { sound(plate(pre.instrument).p, pre.name); continue }
      const kit = pre.instrument.options as KitOptions
      for (const note of Object.keys(kit.pads)) {
        sound(plate(pre.instrument, { pad: note }).p, `${pre.name} ${note}`)
        for (const is of controls.switches.drum!.values as string[]) {
          const pad = { ...kit.pads[note]!, is, options: {}, ...(is === 'NoiseSynth' ? {} : { pitch: 'C2' }) }
          sound(plate({ ...pre.instrument, options: { ...kit, pads: { ...kit.pads, [note]: pad } } }, { pad: note }).p, `${pre.name} ${note} as ${is}`)
        }
      }
    }
  })

  it('lays out a MonoSynth with every source and wave, a custom wave of eight partials, and every filter type', () => {
    for (const source of ['', 'fat', 'am', 'fm']) for (const wave of ['sine', 'square', 'sawtooth', 'triangle']) sound(plate({ is: 'MonoSynth', options: { oscillator: { type: `${source}${wave}` } } }).p, `${source}${wave}`)
    for (const type of ['pulse', 'pwm']) sound(plate({ is: 'MonoSynth', options: { oscillator: { type } } }).p, type)
    sound(plate({ is: 'MonoSynth', options: { oscillator: { type: 'custom', partials: [1, 0.5, 0.3, 0.2, 0.1, 0.1, 0.05, 0.05] } } }).p, 'custom 8')
    for (const type of controls.switches['filter.type']!.values as string[]) sound(plate({ is: 'MonoSynth', options: { filter: { type } } }).p, type)
  })

  it('lays out every instrument, of one voice and of six, and a DuoSynth on each voice', () => {
    for (const is of ['MonoSynth', 'Synth', 'FMSynth', 'AMSynth', 'DuoSynth']) sound(plate({ is, voices: 6, options: {} }).p, `${is} of 6`)
    for (const is of ['MonoSynth', 'Synth', 'FMSynth', 'AMSynth', 'DuoSynth', 'MembraneSynth', 'MetalSynth', 'NoiseSynth', 'PluckSynth']) sound(plate({ is, options: {} }).p, is)
    sound(plate({ is: 'DuoSynth', options: {} }, { voice: 1 }).p, 'duo voice 2')
  })
})

describe('faceplate controls', () => {
  const acid = shipped.find(x => x.name === 'Acid Line')!.instrument

  it("binds a filter's cutoff and amount to its envelope, its resonance, type and slope to the filter", () => {
    const { p, last } = plate(acid)
    const cutoff = find<KnobItem & Placed>(p, 'filterEnvelope.baseFrequency')
    cutoff.set(900)
    expect((last.written!.options as { filterEnvelope: object }).filterEnvelope).toMatchObject({ baseFrequency: 900, octaves: 4.2 })
    find<KnobItem & Placed>(p, 'filter.Q').set(14)
    expect((last.written!.options as { filter: object }).filter).toEqual({ type: 'lowpass', rolloff: -24, Q: 14 })
    const type = find<SegItem & Placed>(p, 'filter.type')
    type.pick('highpass')
    expect((last.written!.options as { filter: { type: string } }).filter.type).toBe('highpass')
    const slope = find<StepItem & Placed>(p, 'filter.rolloff')
    slope.step(1)
    expect((last.written!.options as { filter: { rolloff: number } }).filter.rolloff).toBe(-48)
    slope.step(-1)
    expect((last.written!.options as { filter: { rolloff: number } }).filter.rolloff).toBe(-12)
    // The gain shows only on a shelf or the peak, where it does anything.
    expect(items(p).map(i => i.key)).not.toContain('filter.gain')
    expect(items(plate({ ...acid, options: { ...acid.options, filter: { type: 'peaking' } } }).p).map(i => i.key)).toContain('filter.gain')
  })

  it("draws a filter's response, an envelope's shape and an oscillator's scope from what Tone holds", () => {
    const { p } = plate(acid)
    const w = 200, h = 80
    for (const key of ['filter:screen', 'filterEnvelope:screen', 'envelope:screen', 'oscillator:scope']) expect(find<ScreenItem & Placed>(p, key).svg(w, h)).toMatch(/^<svg viewBox="0 0 200 80"/)
  })

  it("steps an envelope's curves from the tags on its screen", () => {
    const { p, last } = plate(acid)
    const tags = find<ScreenItem & Placed>(p, 'envelope:screen').tags!
    tags[0]!.step()
    expect((last.written!.options as { envelope: { attackCurve: string } }).envelope.attackCurve).toBe('exponential')
    tags[1]!.step()
    expect((last.written!.options as { envelope: { decayCurve: string } }).envelope.decayCurve).toBe('linear')
  })

  it("picks an oscillator's wave and source, and shows what that source brings", () => {
    const { p, last } = plate(acid)
    const wave = find<TilesItem & Placed>(p, 'oscillator.wave')
    wave.pick('square')
    expect((last.written!.options as { oscillator: object }).oscillator).toEqual({ type: 'square' })
    find<SegItem & Placed>(p, 'oscillator.source').pick('fat')
    const fat = plate(last.written!)
    expect([find<KnobItem & Placed>(fat.p, 'oscillator.count').value, find<KnobItem & Placed>(fat.p, 'oscillator.spread').value]).toEqual([3, 20])
    find<SegItem & Placed>(fat.p, 'oscillator.source').pick('fm')
    expect((fat.last.written!.options as { oscillator: object }).oscillator).toEqual({ type: 'fmsawtooth' })
    const fm = plate(fat.last.written!)
    expect(items(fm.p).map(i => i.key)).toEqual(expect.arrayContaining(['oscillator.harmonicity', 'oscillator.modulationIndex', 'oscillator.modulationType']))
    expect(items(fm.p).map(i => i.key)).not.toContain('oscillator.count')
    find<SegItem & Placed>(fm.p, 'oscillator.source').pick('pulse')
    const pulse = plate(fm.last.written!).p
    expect(find<TilesItem & Placed>(pulse, 'oscillator.wave').options.map(o => o.name)).toEqual(['PULSE'])
    expect(items(pulse).map(i => i.key)).toContain('oscillator.width')
    expect(items(pulse).map(i => i.key)).not.toContain('oscillator.harmonics')
  })

  it('sums as many harmonics as HARMONICS says, and gives a custom wave a knob a partial', () => {
    const { p, last } = plate({ is: 'Synth', options: { oscillator: { type: 'triangle' } } })
    const harmonics = find<KnobItem & Placed>(p, 'oscillator.harmonics')
    expect(harmonics.shown!(0)).toBe('ALL')
    harmonics.set(6)
    expect((last.written!.options as { oscillator: object }).oscillator).toEqual({ type: 'triangle6' })
    find<TilesItem & Placed>(p, 'oscillator.wave').pick('custom')
    const custom = plate(last.written!)
    expect(items(custom.p).filter(i => i.key.startsWith('oscillator.partials.')).map(i => (i as KnobItem).label)).toEqual(['H1', 'H2', 'H3', 'H4'])
    find<KnobItem & Placed>(custom.p, 'oscillator.partials.2').set(0.9)
    expect((custom.last.written!.options as { oscillator: object }).oscillator).toEqual({ partials: [1, 0.5, 0.9, 0.25], type: 'custom' })
  })

  it("steps a synth's voices from 1, a voice a press, within the definition's range", () => {
    const one: Instrument = { is: 'Synth', options: { volume: -8 } }
    const a = plate(one)
    const voices = find<StepItem & Placed>(a.p, 'voices')
    expect(voices.shown).toBe('1')
    voices.step(1)
    expect(a.last.written).toEqual({ is: 'Synth', voices: 2, options: { volume: -8 } })
    voices.step(-1)
    expect(a.last.written!.voices).toBe(1)
    const most = plate({ is: 'Synth', voices: controls.knobs.voices!.max, options: {} })
    find<StepItem & Placed>(most.p, 'voices').step(1)
    expect(most.last.written!.voices).toBe(controls.knobs.voices!.max)
  })

  it("shows a DuoSynth's picked voice, and binds its controls to that voice", () => {
    const duo = shipped.find(x => x.name === 'Twin Lead')!.instrument
    const one = plate(duo)
    expect(one.p.sections.map(s => s.title)).toContain('VOICE 1 OSCILLATOR')
    find<SegItem & Placed>(one.p, 'part').pick(1)
    expect(one.last.voice).toBe(1)
    const two = plate(duo, { voice: 1 })
    expect(find<TilesItem & Placed>(two.p, 'voice1.oscillator.wave').on).toBe('square')
    find<KnobItem & Placed>(two.p, 'voice1.filterEnvelope.baseFrequency').set(1200)
    expect((two.last.written!.options as { voice1: { filterEnvelope: { baseFrequency: number } } }).voice1.filterEnvelope.baseFrequency).toBe(1200)
  })

  it("shows a kit's pads and the picked pad's drum, its sound, choke, pitch and level", () => {
    const kit = shipped.find(x => x.name === 'Beatbox')!.instrument
    const pads = (kit.options as KitOptions).pads
    const { p, last } = plate(kit)
    const strip = find<PadsItem & Placed>(p, 'pads')
    expect(strip.pads.filter(x => x.on).map(x => x.note)).toEqual(['C1'])
    strip.pads[5]!.pick()
    expect(last.pad).toBe('A#1')
    find<KnobItem & Placed>(p, 'octaves').set(3)
    expect((last.written!.options as KitOptions).pads.C1!.options).toMatchObject({ octaves: 3, pitchDecay: 0.05 })
    expect((last.written!.options as KitOptions).pads.D1).toBe(pads.D1)
    expect(find<KnobItem & Placed>(p, 'pad.pitch').shown!(find<KnobItem & Placed>(p, 'pad.pitch').value)).toBe('C1')
    const hat = plate(kit, { pad: 'A#1' })
    expect(find<StepItem & Placed>(hat.p, 'choke').shown).toBe('A')
    find<StepItem & Placed>(hat.p, 'choke').step(-1)
    expect((hat.last.written!.options as KitOptions).pads['A#1']).not.toHaveProperty('choke')
    const snare = plate(kit, { pad: 'D1' })
    expect(items(snare.p).map(i => i.key)).not.toContain('pad.pitch')
    find<SegItem & Placed>(snare.p, 'pad.is').pick('MetalSynth')
    expect((snare.last.written!.options as KitOptions).pads.D1).toMatchObject({ name: 'SNARE', is: 'MetalSynth', pitch: 'C2', options: { volume: -10 } })
  })
})
