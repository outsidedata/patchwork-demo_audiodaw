// Experiments 2 and 3: every knob Tone can only set (census.json: shown, with a range), live at 170
// bpm through the context in live.ts, its output captured. For each knob, five runs of 2.5 s:
//   ref   the owner playing, the knob left alone
//   ref2  the same again: how far two runs of the same thing differ, the floor `landed` reads over
//   one   one step at 1.0 s, from 0.25 to 0.75 of its travel
//   s16   a sweep from 0.1 to 0.9 over 0.5–2.5 s, one step every 16th (88 ms at 170 bpm)
//   s32   the same, one step every 32nd (44 ms)
// A step is the transport's callback for its time, the set itself sent by setTimeout at the step's
// time less the look-ahead: a setter that writes one of Tone's Params does it at Tone's `now()`,
// which is the context's time plus the look-ahead, so a set sent at the step's time is heard 0.5 s
// late (probe.ts measured it: sent at `time` heard at +0.50 s, sent at `time - lookAhead` heard on
// it). An instrument is audiodaw's `synth` (its `set` sets every voice), a
// note every beat; an effect is audiodaw's `effect` fed a held three-note saw chord struck every
// half bar. Phaser `stages`, which Tone takes only when made, is changed as audiodaw changes it: the
// effect made again and wired in place of the old.
//
// What is measured, on channel 0:
//   click    the largest corner (second difference) within 6 ms after a step, over the largest
//            corner of the same run in the 34 ms either side of it: above 1 is a corner the sound
//            around the step does not make, so the step put it there; notes start 0.4 of a beat in,
//            so no step is on an attack
//   level    (rms 50–350 ms after the one step / rms 350–50 ms before) in `one`, over the same in
//            `ref`, in dB: how much the one step changed the sound while notes kept playing
//   bright   the same ratio of brightness (rms of the first difference over rms): a filter or a
//            timbre moved by the step shows here when the level barely moves
//   gap      the quietest 2 ms in the 60 ms after the one step, over the same in `ref`
//   landed   when `one` first parts from `ref` by more than 4× the most `ref` and `ref2` ever part,
//            in ms after 1.0 s: the step heard on time is ~0; a knob read only when a note is
//            struck lands at the next note (notes at 1.200 s and 1.553 s); "same" is a knob whose
//            owner never plays the same twice (an LFO started when made, noise), so no time is read
//   cost     ms of each set call (the main thread's time, node)
// and every run is written to wav/<owner>.<path>.<run>.wav to listen to.
import { run, wav, rms, corner, map, LOOK_AHEAD } from './live.ts'
import * as Tone from 'tone'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { synth, effect } from '#plugins/audiodaw/audiodaw.plugin.ts'
import presets from '../../assets/presets.json' with { type: 'json' }

type Census = { owner: string; path: string; kind: string; step: boolean; hidden: boolean; range?: string }
const census = JSON.parse(readFileSync(new URL('./census.json', import.meta.url), 'utf8')) as Census[]
const knobs = census.filter(r => (r.kind === 'set' || r.kind === 'remade') && !r.hidden && r.range)
const only = process.argv[2]
const chosen = only ? knobs.filter(k => `${k.owner}.${k.path}`.includes(only)) : knobs

const INSTRUMENTS = ['Synth', 'MonoSynth', 'FMSynth', 'AMSynth', 'DuoSynth', 'MembraneSynth', 'MetalSynth', 'NoiseSynth', 'PluckSynth']
const BEAT = 60 / 170
const SECONDS = 2.5
// Notes start 0.4 of a beat in, a place on no 16th or 32nd, so no step falls on a note's attack.
const OFF = BEAT * 0.4
const out = new URL('./wav/', import.meta.url)
mkdirSync(out, { recursive: true })

const nest = (path: string[], value: unknown): object => path.reduceRight<unknown>((v, k) => ({ [k]: v }), value) as object
const rangeOf = (r: string) => {
  const m = /^(-?[\d.]+)…(-?[\d.]+)( log)?$/.exec(r)!
  return { min: Number(m[1]), max: Number(m[2]), log: !!m[3] }
}

type Rig = { set(v: number): void; dispose(): void }

// The owner playing, and how a value reaches it.
function rig(k: Census, transport: ReturnType<typeof Tone.getTransport>): Rig {
  const { min, max, log } = rangeOf(k.range!)
  const path = k.path.split('.')
  const value = (v: number) => (k.step ? Math.round(map(v, min, max, log)) : map(v, min, max, log))
  const cls = k.owner.split(' ')[0]!
  if (INSTRUMENTS.includes(cls)) {
    const named = /\((.+)\)/.exec(k.owner)?.[1]
    const options = named ? (presets as { name: string; instrument: { options: object } }[]).find(p => p.name === named)!.instrument.options : {}
    const s = synth({ is: cls, voices: 2, options })
    s.toDestination()
    const pitch = cls === 'MembraneSynth' ? 'C2' : 'C3'
    transport.scheduleRepeat(t => s.triggerAttackRelease(pitch, BEAT * 0.7, t, 0.8), BEAT, OFF)
    return { set: v => s.set(nest(path, value(v))), dispose: () => s.dispose() }
  }
  const source = synth({ is: 'Synth', voices: 3, options: { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 }, volume: -10 } })
  transport.scheduleRepeat(t => { for (const n of ['C3', 'G3', 'Eb4']) source.triggerAttackRelease(n, BEAT * 1.8, t, 0.7) }, BEAT * 2, OFF)
  const options = {} as object
  let fx = effect({ is: cls, on: true, options })
  source.connect(fx)
  fx.toDestination()
  if (k.kind === 'remade') {
    return {
      set: v => {
        const next = effect({ is: cls, on: true, options: nest(path, value(v)) })
        source.disconnect(fx)
        source.connect(next)
        next.toDestination()
        fx.dispose()
        fx = next
      },
      dispose: () => { fx.dispose(); source.dispose() },
    }
  }
  return { set: v => fx.set(nest(path, value(v))), dispose: () => { fx.dispose(); source.dispose() } }
}

type Run = 'ref' | 'ref2' | 'one' | 's16' | 's32'
async function play(k: Census, which: Run, costs: number[], stepsAt: number[]) {
  let made: Rig | undefined
  const live = await run(SECONDS, transport => {
    made = rig(k, transport)
    const step = (v: number) => (t: number) => {
      const ctx = Tone.getContext()
      setTimeout(() => {
        const a = performance.now()
        made!.set(v)
        costs.push(performance.now() - a)
      }, Math.max(0, (t - LOOK_AHEAD - ctx.currentTime) * 1000))
    }
    if (which === 'one') {
      made.set(0.25)
      transport.schedule(step(0.75), 1.0)
      stepsAt.push(1.0)
    } else if (which === 's16' || which === 's32') {
      const every = which === 's16' ? BEAT / 4 : BEAT / 8
      made.set(0.1)
      for (let t = 0.5; t < SECONDS; t += every) {
        transport.schedule(step(0.1 + 0.8 * ((t - 0.5) / (SECONDS - 0.5))), t)
        stepsAt.push(t)
      }
    } else made.set(0.25)
  })
  made!.dispose()
  return live
}

const results: object[] = []
for (const k of chosen) {
  const name = `${k.owner.replace(/[ ()]/g, '')}.${k.path}`
  try {
    const costs: number[] = []
    const ref = await play(k, 'ref', [], [])
    const ref2 = await play(k, 'ref2', [], [])
    const at1: number[] = []
    const one = await play(k, 'one', costs, at1)
    const at16: number[] = []
    const s16 = await play(k, 's16', costs, at16)
    const at32: number[] = []
    const s32 = await play(k, 's32', costs, at32)
    const r = ref.rate
    const idx = (s: number) => Math.round(s * r)
    // A step's corner over the largest corner of the same run in the 34 ms either side of it; a step
    // whose 40 ms after runs off the end of the run, or whose surroundings are silent (under 1e-4),
    // is not scored.
    const clickAt = (x: Float32Array, t: number) => {
      if (t + 0.04 > SECONDS) return NaN
      const around = Math.max(corner(x, idx(t - 0.04), idx(t - 0.006)), corner(x, idx(t + 0.006), idx(t + 0.04)))
      return around < 1e-4 ? NaN : corner(x, idx(t), idx(t + 0.006)) / around
    }
    let floor = 0
    for (let i = idx(0.5); i < idx(SECONDS); i++) floor = Math.max(floor, Math.abs(ref.samples[i]! - ref2.samples[i]!))
    let landed: number | 'same' | 'never' = 'never'
    if (floor > 0.05) landed = 'same'
    else for (let i = idx(0.5); i < idx(SECONDS); i++) if (Math.abs(one.samples[i]! - ref.samples[i]!) > Math.max(4 * floor, 1e-3)) { landed = Math.round((i / r - 1.0) * 1000); break }
    // How bright: rms of the first difference over rms, so a filter opening or closing shows.
    const bright = (x: Float32Array, from: number, to: number) => {
      let s = 0
      for (let i = idx(from) + 1; i < idx(to); i++) s += (x[i]! - x[i - 1]!) ** 2
      return Math.sqrt(s / Math.max(1, idx(to) - idx(from))) / (rms(x, idx(from), idx(to)) || 1e-9)
    }
    const quietest = (x: Float32Array, from: number) => {
      let least = Infinity
      for (let t = from; t < from + 0.06; t += 0.002) least = Math.min(least, rms(x, idx(t), idx(t + 0.002)))
      return least
    }
    const before = (x: Float32Array) => rms(x, idx(0.65), idx(0.95)) || 1e-9
    const after = (x: Float32Array) => rms(x, idx(1.05), idx(1.35))
    const level = 20 * Math.log10((after(one.samples) / before(one.samples)) / ((after(ref.samples) / before(ref.samples)) || 1e-9) || 1e-9)
    const brightness = (bright(one.samples, 1.05, 1.35) / bright(one.samples, 0.65, 0.95)) / ((bright(ref.samples, 1.05, 1.35) / bright(ref.samples, 0.65, 0.95)) || 1e-9)
    const gap = quietest(one.samples, 1.0) / (quietest(ref.samples, 1.0) || 1e-9)
    const clicks = (x: Float32Array, at: number[]) => {
      const each = at.map(t => clickAt(x, t)).filter(c => !Number.isNaN(c))
      return { steps: each.length, over1: each.filter(c => c > 1).length, over2: each.filter(c => c > 2).length, worst: each.length ? Math.max(...each) : NaN }
    }
    const res = {
      knob: `${k.owner} ${k.path}`, kind: k.kind,
      refLoud: rms(ref.samples, idx(0.5), idx(SECONDS)),
      floor,
      one: { click: clickAt(one.samples, 1.0), level, brightness, gap, landed },
      s16: clicks(s16.samples, at16),
      s32: clicks(s32.samples, at32),
      cost: { mean: costs.reduce((a, b) => a + b, 0) / costs.length, max: Math.max(...costs) },
    }
    results.push(res)
    for (const [run, x] of [['ref', ref], ['one', one], ['s16', s16], ['s32', s32]] as const) wav(new URL(`${name}.${run}.wav`, out).pathname, x.samples, r)
    console.log(`${res.knob.padEnd(46)} loud ${res.refLoud.toFixed(3)}  one: click ${res.one.click.toFixed(2)} level ${level.toFixed(1)} dB bright ×${brightness.toFixed(2)} gap ${gap.toFixed(2)} landed ${landed}${typeof landed === 'number' ? ' ms' : ''}  s16: ${res.s16.over1}/${res.s16.steps} >1 worst ${res.s16.worst.toFixed(2)}  s32: ${res.s32.over1}/${res.s32.steps} >1 worst ${res.s32.worst.toFixed(2)}  cost ${res.cost.mean.toFixed(2)}/${res.cost.max.toFixed(1)} ms`)
  } catch (e) {
    results.push({ knob: `${k.owner} ${k.path}`, error: String(e) })
    console.log(`${k.owner} ${k.path}: ERROR ${e}`)
  }
  writeFileSync(new URL(only ? `./steps.${only}.json` : './steps.json', import.meta.url), JSON.stringify(results, null, 2))
}
process.exit(0)
