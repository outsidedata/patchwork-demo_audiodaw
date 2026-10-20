// An effect's controls, pure, and what every faceplate shares: Tone's oscillator types taken apart,
// a value set at a path, and the definition's ranges and switches looked up. An instrument's
// faceplate is its own layout (`panels.ts`); an effect's is every option Tone holds for it, as
// audiodaw's `effectOptionsOf` hands them (Tone's `get()`): a number is a knob, a word or one of a
// few numbers is a switch, and nothing Tone has is left off but what the definition hides (`hidden`:
// a size it is made with, a delay's `maxDelay`, an AutoPanner's `channelCount`). Each control writes
// the whole new effect (`write`), so the studio keeps it as one step of undo.
//
// The ranges and the names come from the `player` definition's `studio.controls`: `knobs`, each
// option's label, range and curve; `switches`, each option's labels and the values they stand for.
// Each is looked up by the most particular key first (`lookup`): the Tone class and the path
// (`Filter.frequency`), the path (`filter.type`), the option's parent and its name
// (`oscillator.spread`), and its name (`attack`). An option with no entry throws, so an option Tone
// adds is seen, never dropped. An effect's knobs come first, those the definition's `order` names in
// its order, then the rest in Tone's; the switches follow.
import { DRUM_KIT, type Chain, type Effect, type KitOptions, type Knob as Aimed, type Project, type Range as Travel } from '#plugins/audiodaw/audiodaw.sim.ts'
import * as Tone from 'tone'

export type Range = { label: string; min: number; max: number; curve?: 'log'; step?: number }
export type Choice = { label: string; values: (string | number)[]; names: string[] }
export type Controls = { knobs: Record<string, Range>; switches: Record<string, Choice>; hidden: string[]; order: string[] }

export type Knob = { kind: 'knob'; key: string; label: string; min: number; max: number; log: boolean; step?: number; value: number; reset: number; shown?: (v: number) => string; set(v: number): void }
export type Switch = { kind: 'switch'; key: string; label: string; options: string[]; on: string; pick(name: string): void }
export type Control = Knob | Switch

// The sources and waves of an oscillator's `type`, as Tone spells them.
const SOURCES = ['', 'fat', 'am', 'fm', 'pulse', 'pwm'] as const
const WAVES = ['sine', 'square', 'sawtooth', 'triangle', 'custom'] as const
export type Source = (typeof SOURCES)[number]
export type Wave = (typeof WAVES)[number]
export type Kind = { source: Source; wave: Wave; count: number }

// Tone's oscillator `type` taken apart: `fatsawtooth8` is fat, sawtooth, eight partials.
export function parseType(type: string): Kind {
  if (type === 'pulse' || type === 'pwm') return { source: type, wave: 'sine', count: 0 }
  const m = /^(fat|am|fm)?(sine|square|sawtooth|triangle|custom)(\d*)$/.exec(type)
  if (!m) throw new Error(`faceplate: Tone's oscillator type ${type} is none it knows`)
  return { source: (m[1] ?? '') as Source, wave: m[2] as Wave, count: m[3] ? Number(m[3]) : 0 }
}
// And put together again; a custom wave's partials are its own, so it carries no count.
export function typeOf(k: Kind): string {
  if (k.source === 'pulse' || k.source === 'pwm') return k.source
  return `${k.source}${k.wave}${k.wave !== 'custom' && k.count ? k.count : ''}`
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const at = (o: unknown, path: string[]): unknown => path.reduce<unknown>((v, k) => (isObject(v) || Array.isArray(v) ? (v as Record<string, unknown>)[k] : undefined), o)

// `o` with the value at `path` set, every object and array on the way copied.
export function setAt<T>(o: T, path: (string | number)[], value: unknown): T {
  if (!path.length) return value as T
  const [k, ...rest] = path as [string | number, ...(string | number)[]]
  const was = (o as Record<string | number, unknown> | undefined)?.[k]
  const inner = rest.length ? setAt(was && typeof was === 'object' ? was : typeof rest[0] === 'number' ? [] : {}, rest, value) : value
  if (Array.isArray(o)) {
    const copy = [...o]
    copy[k as number] = inner
    return copy as T
  }
  return { ...(o as object), [k]: inner } as T
}

// Tone's own defaults for a class, by its name: what a knob resets to.
function defaultsOf(is: string): object {
  const made = (Tone as unknown as Record<string, { getDefaults?: () => object }>)[is]
  return made?.getDefaults?.() ?? {}
}

// The entry for an option, most particular key first.
export function lookup<T>(table: Record<string, T>, is: string, path: string[]): T | undefined {
  const leafKey = path[path.length - 1]!
  const parent = path[path.length - 2]
  const keys = [`${is}.${path.join('.')}`, path.join('.'), ...(parent ? [`${parent}.${leafKey}`] : []), leafKey]
  for (const k of keys) if (Object.hasOwn(table, k)) return table[k]
  return undefined
}

// The travel of a knob an automation track targets, for audiodaw to turn its 0 to 1 into the knob's
// units: the entry its faceplate is drawn with. An instrument's option is looked up by the
// instrument's class (a kit pad's by its drum's, the path inside the pad's options), an effect's by
// the effect's; a channel's volume, pan and a send by `Channel.volume` (LEVEL), `pan` and `send`.
export function rangeOf(c: Controls, k: Aimed, p: Project): Travel | undefined {
  const of = (r: Range | undefined): Travel | undefined => (r ? { min: r.min, max: r.max, ...(r.curve ? { curve: r.curve } : {}), ...(r.step ? { step: r.step } : {}) } : undefined)
  switch (k.part) {
    case 'instrument': {
      const i = p.rack[k.device]?.instrument
      if (!i) return undefined
      if (i.is === DRUM_KIT && k.path[0] === 'pads') {
        const pad = (i.options as KitOptions).pads[k.path[1]!]
        return pad ? of(lookup(c.knobs, pad.is, k.path.slice(3))) : undefined
      }
      return of(lookup(c.knobs, i.is, k.path))
    }
    case 'effect': {
      const list = k.chain === 'master' ? p.master.effects : 'bus' in k.chain ? p.buses[k.chain.bus]?.effects : p.rack[k.chain.device]?.effects
      const e = list?.[k.effect]
      return e ? of(lookup(c.knobs, e.is, k.path)) : undefined
    }
    case 'volume': return of(lookup(c.knobs, 'Channel', ['volume']))
    case 'pan': return of(lookup(c.knobs, 'Channel', ['pan']))
    case 'send': return of(lookup(c.knobs, 'Channel', ['send']))
  }
}

// A knob by name, as a track header lists it: its device, bus or the master, the effect it is on,
// and its label from the definition (LEVEL, PAN and SEND for a strip's own).
export function knobName(c: Controls, k: Aimed, p: Project): string {
  const strip = (s: { device: number } | { bus: string } | 'master') => (s === 'master' ? 'MASTER' : 'bus' in s ? `${s.bus.toUpperCase()} RTN` : p.rack[s.device]?.name ?? '?')
  switch (k.part) {
    case 'instrument': {
      const i = p.rack[k.device]?.instrument
      const pad = i?.is === DRUM_KIT && k.path[0] === 'pads' ? (i.options as KitOptions).pads[k.path[1]!] : undefined
      const label = pad ? lookup(c.knobs, pad.is, k.path.slice(3))?.label : i ? lookup(c.knobs, i.is, k.path)?.label : undefined
      return `${strip({ device: k.device })} ${pad ? `${pad.name} ` : ''}${label ?? k.path.join('.')}`
    }
    case 'effect': {
      const e = (k.chain === 'master' ? p.master.effects : 'bus' in k.chain ? p.buses[k.chain.bus]?.effects : p.rack[k.chain.device]?.effects)?.[k.effect]
      return `${strip(k.chain)} ${e ? e.is.toUpperCase() : '?'} ${(e && lookup(c.knobs, e.is, k.path)?.label) ?? k.path.join('.')}`
    }
    case 'volume': return `${strip(k.strip)} LEVEL`
    case 'pan': return `${strip(k.strip)} PAN`
    case 'send': return `${strip({ device: k.device })} SEND ${k.bus.toUpperCase()}`
  }
}

// What Tone holds now, the trees the faceplates are drawn from: a device's instrument, and effect
// `i` of a chain.
export type Held = { instrument(d: number): object; effect(chain: Chain, i: number): object }

// Every knob of the song an automation track can aim at, each named: every number Tone holds for a
// device's instrument (every pad of a kit, and the kit's level) and for every effect, that the
// definition gives a range and does not hide, and every strip's level, pan and sends; each bus's
// effects, level and pan; the master's effects and level.
export function knobsOf(c: Controls, p: Project, held: Held): { knob: Aimed; name: string }[] {
  const out: Aimed[] = []
  const walkNumbers = (tree: unknown, path: string[], is: string, aim: (path: string[]) => Aimed) => {
    if (!isObject(tree)) return
    for (const [key, value] of Object.entries(tree)) {
      const q = [...path, key]
      if (hidden(c, q)) continue
      if (typeof value === 'number' && lookup(c.knobs, is, q)) out.push(aim(q))
      else if (isObject(value)) walkNumbers(value, q, is, aim)
    }
  }
  const effects = (chain: Chain, list: Effect[]) => list.forEach((e, i) => walkNumbers(held.effect(chain, i), [], e.is, path => ({ part: 'effect', chain, effect: i, path })))
  p.rack.forEach((d, device) => {
    if (d.instrument.is === DRUM_KIT) {
      const kit = held.instrument(device) as KitOptions
      out.push({ part: 'instrument', device, path: ['volume'] })
      for (const [note, pad] of Object.entries(kit.pads)) walkNumbers(pad.options, [], pad.is, path => ({ part: 'instrument', device, path: ['pads', note, 'options', ...path] }))
    } else walkNumbers(held.instrument(device), [], d.instrument.is, path => ({ part: 'instrument', device, path }))
    effects({ device }, d.effects)
    out.push({ part: 'volume', strip: { device } }, { part: 'pan', strip: { device } })
    for (const bus of Object.keys(p.buses)) if (d.sends[bus] !== undefined) out.push({ part: 'send', device, bus })
  })
  for (const [bus, b] of Object.entries(p.buses)) {
    effects({ bus }, b.effects)
    out.push({ part: 'volume', strip: { bus } }, { part: 'pan', strip: { bus } })
  }
  effects('master', p.master.effects)
  out.push({ part: 'volume', strip: 'master' })
  return out.map(knob => ({ knob, name: knobName(c, knob, p) }))
}

// Two knobs the same knob.
export const sameKnob = (a: Aimed | undefined, b: Aimed | undefined) => a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b)

// Hidden: the path is a hidden entry, or ends with one.
function hidden(c: Controls, path: string[]): boolean {
  const s = path.join('.')
  return c.hidden.some(h => s === h || s.endsWith(`.${h}`))
}

type Root = { is: string; song: object; write(options: object): void }

// The controls of every option of `tree`, Tone's `get()`, under `root`: its own, then those of each
// object of it.
function walk(c: Controls, root: Root, tree: Record<string, unknown>, path: string[], out: Control[]) {
  const here: Control[] = []
  const later: [string, Record<string, unknown>][] = []
  for (const [key, value] of Object.entries(tree)) {
    const p = [...path, key]
    if (hidden(c, p)) continue
    if (isObject(value)) later.push([key, value])
    else here.push(leaf(c, root, p, value))
  }
  const rank = (k: Control) => {
    const i = c.order.indexOf(k.key.split('.').pop()!)
    return (k.kind === 'switch' ? 1000 : 0) + (i < 0 ? 500 : i)
  }
  out.push(...here.map((k, i) => ({ k, i })).sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i).map(x => x.k))
  for (const [key, value] of later) walk(c, root, value, [...path, key], out)
}

function leaf(c: Controls, root: Root, path: string[], value: unknown): Control {
  const key = path.join('.')
  const choice = lookup(c.switches, root.is, path)
  if (choice) {
    const i = choice.values.indexOf(value as string | number)
    if (i < 0) throw new Error(`faceplate: ${root.is}.${key} is ${String(value)}, none of ${choice.values.join(', ')}`)
    return {
      kind: 'switch', key, label: choice.label, options: choice.names, on: choice.names[i]!,
      pick: name => root.write(setAt(root.song, path, choice.values[choice.names.indexOf(name)])),
    }
  }
  if (typeof value !== 'number') throw new Error(`faceplate: ${root.is}.${key} is ${JSON.stringify(value)}, with no switch for it`)
  const range = lookup(c.knobs, root.is, path)
  if (!range) throw new Error(`faceplate: ${root.is}.${key} has no range`)
  const fallback = at(defaultsOf(root.is), path)
  return {
    kind: 'knob', key, label: range.label, min: range.min, max: range.max, log: range.curve === 'log', value,
    reset: typeof fallback === 'number' ? fallback : value, set: v => root.write(setAt(root.song, path, v)),
    ...(range.step === undefined ? {} : { step: range.step }),
  }
}

// The controls of an effect, from Tone's `get()` of it: its own options, then those of each object of
// them (an AutoFilter's `filter`).
export function effectControls(c: Controls, effect: Effect, tree: object, write: (e: Effect) => void): Control[] {
  const out: Control[] = []
  walk(c, { is: effect.is, song: effect.options, write: options => write({ ...effect, options }) }, tree as Record<string, unknown>, [], out)
  return out
}
