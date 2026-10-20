import '#plugins/audiodaw/nodeaudio'
import { describe, expect, it } from 'vitest'
import { audiodaw } from '#plugins/audiodaw/audiodaw.plugin.ts'
import type { Device, Effect, Preset, Project } from '#plugins/audiodaw/audiodaw.sim.ts'
import { switchWidth } from '#plugins/renderdom/controls.ts'
import { effectControls, lookup, parseType, setAt, typeOf, type Controls, type Knob } from './faceplate.ts'
import defs from '../../assets/demo_audiodaw.json' with { type: 'json' }
import presets from '../../assets/presets.json' with { type: 'json' }

const studio = defs.player.studio
const controls = studio.controls as Controls
const shipped = presets as Preset[]
const device = (effects: Effect[]): Device => ({ name: 'd', instrument: shipped[0]!.instrument, effects, channel: { volume: 0, pan: 0, mute: false, solo: false }, sends: {} })
const song = (rack: Device[]): Project => ({ bpm: 120, timeSignature: 4, swing: 0, swingSubdivision: '8n', ppq: 192, rack, tracks: [], buses: {}, master: { volume: 0, effects: [] }, clips: [] })

describe('oscillator types', () => {
  it("takes Tone's oscillator type apart and puts it together again", () => {
    for (const t of ['sine', 'fatsawtooth', 'amsquare', 'fmtriangle8', 'sawtooth4', 'pulse', 'pwm', 'custom', 'fatcustom']) expect(typeOf(parseType(t))).toBe(t)
    expect(parseType('fmtriangle8')).toEqual({ source: 'fm', wave: 'triangle', count: 8 })
  })
})

describe('setAt and lookup', () => {
  it('sets a value at a path, copying objects and arrays on the way', () => {
    const o = { a: { b: 1 }, p: [1, 2] }
    expect(setAt(o, ['a', 'b'], 3)).toEqual({ a: { b: 3 }, p: [1, 2] })
    expect(setAt(o, ['p', 1], 5)).toEqual({ a: { b: 1 }, p: [1, 5] })
    expect(o).toEqual({ a: { b: 1 }, p: [1, 2] })
  })

  it('finds the most particular entry first: the class and path, the path, the parent and name, the name', () => {
    const t = { 'PluckSynth.resonance': 1, 'filter.type': 2, 'oscillator.spread': 3, resonance: 4, spread: 5 }
    expect(lookup(t, 'PluckSynth', ['resonance'])).toBe(1)
    expect(lookup(t, 'MetalSynth', ['resonance'])).toBe(4)
    expect(lookup(t, 'MonoSynth', ['voice0', 'oscillator', 'spread'])).toBe(3)
    expect(lookup(t, 'Chorus', ['spread'])).toBe(5)
    expect(lookup(t, 'AutoFilter', ['filter', 'type'])).toBe(2)
    expect(lookup(t, 'Chorus', ['nothing'])).toBeUndefined()
  })
})

describe('effect controls', () => {
  it('draws every option of every effect of the catalogue, each switch fitting the Effects panel', () => {
    for (const is of Object.keys(studio.effects)) {
      const e: Effect = { is, on: true, options: {} }
      const daw = audiodaw()
      daw.load(song([device([e])]))
      const list = effectControls(controls, e, daw.effectOptionsOf({ device: 0 }, 0), () => {})
      daw.dispose()
      expect(list.length, is).toBeGreaterThan(0)
      for (const c of list) if (c.kind === 'switch') expect(switchWidth(c.options), `${is} ${c.key}`).toBeLessThanOrEqual(640 - 24 - 16)
    }
  })

  it("writes an effect's options, and one Tone takes only when it is made", () => {
    const e: Effect = { is: 'Phaser', on: true, options: { stages: 4 } }
    const daw = audiodaw()
    const start = song([device([e])])
    daw.load(start)
    let written: Effect | undefined
    const list = effectControls(controls, e, daw.effectOptionsOf({ device: 0 }, 0), x => (written = x))
    const stages = list.find(c => c.key === 'stages') as Knob
    expect(stages.value).toBe(4)
    stages.set(14)
    expect(written).toEqual({ is: 'Phaser', on: true, options: { stages: 14 } })
    daw.edit({ ...start, rack: [{ ...start.rack[0]!, effects: [written!] }] })
    expect(daw.effectOptionsOf({ device: 0 }, 0)).toMatchObject({ stages: 14 })
    daw.dispose()
  })

  it("leaves off a delay's maxDelay and reads an AutoFilter's filter after its own options", () => {
    const daw = audiodaw()
    const auto: Effect = { is: 'AutoFilter', on: true, options: {} }
    const delay: Effect = { is: 'FeedbackDelay', on: true, options: {} }
    daw.load(song([device([auto, delay])]))
    const a = effectControls(controls, auto, daw.effectOptionsOf({ device: 0 }, 0), () => {})
    expect(a.map(c => c.key).slice(-3)).toEqual(['filter.Q', 'filter.rolloff', 'filter.type'])
    const d = effectControls(controls, delay, daw.effectOptionsOf({ device: 0 }, 1), () => {})
    expect(d.map(c => c.key)).not.toContain('maxDelay')
    daw.dispose()
  })
})
