import { describe, expect, it } from 'vitest'
import { envelope, filter, magnitude, metal, noise, scope, string, sweep, wave } from './screens.ts'

describe('wave', () => {
  it("draws Tone's sawtooth rising, a square, a triangle and a sine, whole", () => {
    const saw = { type: 'sawtooth' }
    expect([wave(saw, 0), wave(saw, 0.25), wave(saw, 0.49)].map(v => +v.toFixed(2))).toEqual([0, 0.5, 0.98])
    expect(wave(saw, 0.51)).toBeLessThan(-0.9)
    expect([wave({ type: 'square' }, 0.25), wave({ type: 'square' }, 0.75)]).toEqual([1, -1])
    expect([wave({ type: 'triangle' }, 0.25), wave({ type: 'triangle' }, 0.75)]).toEqual([1, -1])
    expect(wave({ type: 'sine' }, 0.25)).toBeCloseTo(1, 9)
  })

  it('sums as many partials as the type names, and a custom wave from its own', () => {
    // One partial of a sawtooth is a sine of its fundamental's level.
    expect(wave({ type: 'sawtooth1' }, 0.25)).toBeCloseTo(2 / Math.PI, 9)
    expect(Math.abs(wave({ type: 'sawtooth32' }, 0.25) - 0.5)).toBeLessThan(0.05)
    expect(wave({ type: 'custom', partials: [1, 0] }, 0.25)).toBeCloseTo(1, 9)
    expect(wave({ type: 'custom', partials: [0, 1] }, 0.125)).toBeCloseTo(1, 9)
  })

  it("draws a pulse at its width", () => {
    expect(wave({ type: 'pulse', width: 0.5 }, 0.7)).toBe(1)
    expect(wave({ type: 'pulse', width: -0.5 }, 0.3)).toBe(-1)
  })
})

describe('magnitude', () => {
  it('passes below a lowpass cutoff and cuts above it by its slope', () => {
    const lp = { type: 'lowpass', cutoff: 1000, Q: 0.707, rolloff: -12, gain: 0 }
    expect(magnitude(lp, 50)).toBeCloseTo(1, 2)
    // An octave above, a 12 dB slope is down 12 dB, a 24 dB one 24.
    expect(20 * Math.log10(magnitude(lp, 8000))).toBeCloseTo(-36, 0)
    expect(20 * Math.log10(magnitude({ ...lp, rolloff: -24 }, 8000))).toBeCloseTo(-72, 0)
    expect(magnitude({ ...lp, type: 'highpass' }, 20000)).toBeCloseTo(1, 2)
    expect(magnitude({ ...lp, type: 'notch', Q: 4 }, 1000)).toBeCloseTo(0, 6)
    expect(magnitude({ ...lp, type: 'peaking', Q: 4, gain: 6 }, 1000)).toBeCloseTo(Math.pow(10, 6 / 20), 6)
    // Resonance raises the cutoff.
    expect(magnitude({ ...lp, Q: 9 }, 1000)).toBeCloseTo(9, 6)
  })
})

describe('screens', () => {
  it('draws each at the size it is handed, its grid and its trace in the accent', () => {
    const drawn = [
      envelope(200, 80, { attack: 0.01, decay: 0.2, sustain: 0.5, release: 1 }, '#abc'),
      filter(200, 80, { type: 'lowpass', cutoff: 800, Q: 2, rolloff: -24, gain: 0 }, '#abc'),
      scope(200, 80, { type: 'fatsawtooth', count: 3, spread: 20 }, '#abc'),
      sweep(200, 80, { octaves: 6, pitchDecay: 0.05 }, '#abc'),
      metal(200, 80, { harmonicity: 5.1, modulationIndex: 32, resonance: 7000 }, '#abc'),
      noise(200, 80, 'pink', '#abc'),
      string(200, 80, { resonance: 0.96, dampening: 3800, release: 1 }, '#abc'),
    ]
    for (const s of drawn) {
      expect(s).toMatch(/^<svg viewBox="0 0 200 80" width="200" height="80"/)
      expect(s).toContain('#abc')
      expect(s).not.toContain('NaN')
    }
    // A fat oscillator is drawn as its three copies.
    expect(drawn[2]!.match(/stroke-opacity/g)).toHaveLength(3)
  })

  it('keeps a resonant peak on the screen, and an envelope inside it', () => {
    const peak = filter(200, 80, { type: 'lowpass', cutoff: 800, Q: 30, rolloff: -12, gain: 0 }, '#abc')
    const ys = [...peak.matchAll(/L?(-?[\d.]+) (-?[\d.]+)/g)].map(m => Number(m[2]))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
    const env = envelope(200, 80, { attack: 5, decay: 5, sustain: 1, release: 5 }, '#abc')
    const xs = [...env.matchAll(/[ML](-?[\d.]+) /g)].map(m => Number(m[1]))
    expect(Math.max(...xs)).toBeLessThanOrEqual(200)
  })
})
