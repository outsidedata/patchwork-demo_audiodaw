// Experiment 1: every knob the studio can show, sorted by what Tone holds at its path.
//   glides   a Tone Param or Signal: rampable on the audio clock
//   set      a plain property or getter/setter: only takes a new value
//   remade   not a property of the made object at all (Tone takes it only when made): audiodaw
//            makes the effect again to change it
// Prints a table and writes census.json beside this file.
import '#plugins/audiodaw/nodeaudio.ts'
import * as Tone from 'tone'
import { writeFileSync } from 'node:fs'
import defs from '../../assets/demo_audiodaw.json' with { type: 'json' }
import presets from '../../assets/presets.json' with { type: 'json' }

const controls = defs.player.studio.controls
const INSTRUMENTS = ['Synth', 'MonoSynth', 'FMSynth', 'AMSynth', 'DuoSynth', 'MembraneSynth', 'MetalSynth', 'NoiseSynth', 'PluckSynth']
const EFFECTS = Object.keys(defs.player.studio.effects)

type Row = { owner: string; path: string; kind: 'glides' | 'set' | 'remade'; holds: string; step: boolean; hidden: boolean; range?: string }

function lookup(is: string, path: string[]) {
  const keys = [`${is}.${path.join('.')}`, path.join('.'), path.slice(-2).join('.'), path.at(-1)!]
  for (const k of keys) if (k in controls.knobs) return (controls.knobs as Record<string, { min: number; max: number; curve?: string; step?: number }>)[k]
  return undefined
}
const hiddenOf = (path: string[]) => controls.hidden.some(h => path.join('.') === h || path.join('.').endsWith('.' + h) || path.at(-1) === h)

function classify(made: object, path: string[]): { kind: Row['kind']; holds: string } {
  let at: unknown = made
  for (let i = 0; i < path.length; i++) {
    const o = at as Record<string, unknown>
    if (o === null || typeof o !== 'object' || !(path[i]! in o)) return { kind: 'remade', holds: 'not on the object' }
    at = o[path[i]!]
  }
  if (at instanceof Tone.Signal) return { kind: 'glides', holds: 'Signal' }
  if (at instanceof Tone.Param) return { kind: 'glides', holds: 'Param' }
  if (at && typeof at === 'object' && 'linearRampToValueAtTime' in at) return { kind: 'glides', holds: (at as object).constructor.name }
  return { kind: 'set', holds: typeof at }
}

function walk(owner: string, made: object, tree: object, path: string[], out: Row[]) {
  for (const [k, v] of Object.entries(tree)) {
    const p = [...path, k]
    if (typeof v === 'number') {
      const c = classify(made, p)
      const r = lookup(owner, p)
      out.push({ owner, path: p.join('.'), ...c, step: !!r?.step, hidden: hiddenOf(p), range: r ? `${r.min}…${r.max}${r.curve ? ' ' + r.curve : ''}` : undefined })
    } else if (v && typeof v === 'object' && !Array.isArray(v)) walk(owner, made, v, p, out)
  }
}

const rows: Row[] = []
// A live context to no device, as audiodaw's tests make one: the objects are only made and read,
// never rendered (BitCrusher's and PluckSynth's worklets throw in an offline render on node).
Tone.setContext(new Tone.Context(new (globalThis as unknown as { AudioContext: new (o: object) => AudioContext }).AudioContext({ sinkId: { type: 'none' } }) as unknown as AudioContext))
;(() => {
  const ctor = (is: string) => (Tone as unknown as Record<string, new (options?: object) => Tone.ToneAudioNode & { get(): object }>)[is]!
  for (const is of [...INSTRUMENTS, ...EFFECTS]) {
    const made = new (ctor(is))()
    walk(is, made, made.get(), [], rows)
  }
  // Every preset's instrument as the preset makes it (a fat, pulse, PWM, AM or FM oscillator brings
  // knobs a plain one has not), and every drum pad; rows already counted for that class are left out.
  const seen = new Set(rows.map(r => `${r.owner}:${r.path}`))
  for (const p of presets as { name: string; instrument: { is: string; options: Record<string, unknown> } }[]) {
    const sounds = p.instrument.is === 'DrumKit'
      ? Object.values((p.instrument.options as { pads: Record<string, { is: string; options: object }> }).pads).map(pad => ({ is: pad.is, options: pad.options }))
      : [p.instrument]
    for (const s of sounds) {
      const made = new (ctor(s.is))(s.options as never)
      const found: Row[] = []
      walk(s.is, made, made.get(), [], found)
      for (const r of found) if (!seen.has(`${r.owner}:${r.path}`)) { seen.add(`${r.owner}:${r.path}`); rows.push({ ...r, owner: `${r.owner} (${p.name})` }) }
    }
  }
  // The channel and a send, as audiodaw makes them.
  const ch = new Tone.Channel()
  rows.push({ owner: 'Channel', path: 'volume', ...classify(ch, ['volume']), step: false, hidden: false, range: '-60…6' })
  rows.push({ owner: 'Channel', path: 'pan', ...classify(ch, ['pan']), step: false, hidden: false, range: '-1…1' })
  const send = new Tone.Gain(0, 'decibels')
  rows.push({ owner: 'Send', path: 'gain', ...classify(send, ['gain']), step: false, hidden: false, range: '-60…6' })
})()
await (Tone.getContext() as Tone.Context).close()

const count = (f: (r: Row) => boolean) => rows.filter(f).length
console.log(`knobs: ${rows.length}  glides: ${count(r => r.kind === 'glides')}  set: ${count(r => r.kind === 'set')}  remade: ${count(r => r.kind === 'remade')}`)
console.log(`shown (not hidden): ${count(r => !r.hidden)}  shown glides: ${count(r => !r.hidden && r.kind === 'glides')}  shown set: ${count(r => !r.hidden && r.kind === 'set')}  shown remade: ${count(r => !r.hidden && r.kind === 'remade')}`)
for (const kind of ['set', 'remade', 'glides'] as const) {
  console.log(`\n== ${kind} ==`)
  for (const r of rows.filter(r => r.kind === kind)) console.log(`${r.owner.padEnd(20)} ${r.path.padEnd(34)} ${r.holds.padEnd(10)} ${r.step ? 'step ' : '     '}${r.hidden ? 'hidden ' : '       '}${r.range ?? 'NO RANGE'}`)
}
writeFileSync(new URL('./census.json', import.meta.url), JSON.stringify(rows, null, 2))
process.exit(0)
