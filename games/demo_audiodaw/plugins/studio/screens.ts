// The faceplates' screens, pure: each takes what it draws and the screen's size in panel units, and
// hands back the SVG markup that draws it, grid and all, in `accent`. The rack puts it in a screen's
// element (`rack.client.ts`); nothing here reads a song or Tone.
//
//   envelope  an envelope's shape: attack up, decay down to sustain, a held stretch, release to 0,
//             each stage as wide as the square root of its time, so a 5 s release does not crowd out
//             a 2 ms attack; a dashed line where each stage ends.
//   filter    a filter's magnitude over 20 Hz to 20 kHz, from +18 dB at the top to -36 dB at the
//             bottom: a second-order response at its cutoff and Q, raised to its slope over 12 dB a
//             stage for the lowpass and highpass, with the shelves' and the peak's gain.
//   scope     two cycles of an oscillator as it sounds: its wave whole (all harmonics) or summed from
//             as many partials as its type names, a custom wave from its partials, a fat one as its
//             detuned copies, AM's carrier moved in level by its modulator, FM's moved in phase, a
//             pulse at its width.
//   sweep     a membrane's pitch falling from `octaves` over its pitch decay.
//   metal     a metal's six inharmonic partials over the spectrum, and where its tone (resonance) is.
//   noise     a noise's spectrum: white flat, pink falling 3 dB an octave, brown 6.
//   string    a plucked string ringing down, by its resonance, dampening and release.
import { parseType } from './faceplate.ts'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const path = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')

// The screen's grid: eight columns and four rows.
export function grid(w: number, h: number): string {
  let g = ''
  for (let i = 1; i < 8; i++) g += `<line x1="${(w * i) / 8}" y1="0" x2="${(w * i) / 8}" y2="${h}" stroke="#223026"/>`
  for (let i = 1; i < 4; i++) g += `<line x1="0" y1="${(h * i) / 4}" x2="${w}" y2="${(h * i) / 4}" stroke="#223026"/>`
  return g
}
const svg = (w: number, h: number, inner: string) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none">${grid(w, h)}${inner}</svg>`
const traced = (d: string, accent: string, fill = true) => `${fill ? `<path d="${d}" fill="${accent}" opacity=".14"/>` : ''}<path d="${d}" fill="none" stroke="${accent}" stroke-width="2" stroke-linejoin="round"/>`

export type Envelope = { attack: number; decay: number; sustain?: number; release: number }
export function envelope(w: number, h: number, e: Envelope, accent: string): string {
  const t = (x: number) => Math.sqrt(Math.max(0.0005, x))
  const held = 0.55
  const sx = (w - 12) / (t(e.attack) + t(e.decay) + held + t(e.release))
  const top = 8, bot = h - 6, sus = e.sustain ?? 0
  const x1 = 6 + t(e.attack) * sx, x2 = x1 + t(e.decay) * sx, x3 = x2 + held * sx, x4 = x3 + t(e.release) * sx
  const ys = bot - sus * (bot - top)
  const d = `M6 ${bot} L${x1} ${top} Q ${x1 + (x2 - x1) * 0.15} ${ys} ${x2} ${ys} L${x3} ${ys} Q ${x3 + (x4 - x3) * 0.15} ${bot} ${x4} ${bot}`
  const marks = [x1, x2, x3].map(x => `<line x1="${x}" y1="${top - 4}" x2="${x}" y2="${bot}" stroke="${accent}" stroke-opacity=".25" stroke-dasharray="2 3"/>`).join('')
  return svg(w, h, `<path d="${d} L${x4} ${bot} L6 ${bot}Z" fill="${accent}" opacity=".14"/><path d="${d}" fill="none" stroke="${accent}" stroke-width="2"/>${marks}`)
}

export type Filter = { type: string; cutoff: number; Q: number; rolloff: number; gain: number }
// The filter's magnitude at `hz`, as a gain.
export function magnitude(f: Filter, hz: number): number {
  const r = hz / f.cutoff, q = Math.max(0.05, f.Q || 0.707)
  const den = Math.sqrt((1 - r * r) ** 2 + (r / q) ** 2)
  const stages = Math.abs(f.rolloff) / 12
  const lift = Math.pow(10, f.gain / 20) - 1
  switch (f.type) {
    case 'lowpass': return Math.pow(1 / den, stages)
    case 'highpass': return Math.pow((r * r) / den, stages)
    case 'bandpass': return r / q / den
    case 'notch': return Math.abs(1 - r * r) / den
    case 'peaking': return 1 + (r / q / den) * lift
    case 'lowshelf': return 1 + lift / (1 + r ** 4)
    case 'highshelf': return 1 + (lift * r ** 4) / (1 + r ** 4)
    default: return 1
  }
}
export function filter(w: number, h: number, f: Filter, accent: string): string {
  const pts: [number, number][] = []
  for (let i = 0; i <= 120; i++) {
    const hz = 20 * Math.pow(1000, i / 120)
    const db = clamp(20 * Math.log10(Math.max(magnitude(f, hz), 1e-6)), -36, 18)
    pts.push([(i / 120) * w, 4 + ((18 - db) / 54) * (h - 8)])
  }
  const d = path(pts)
  return svg(w, h, `<path d="${d} L${w} ${h} L0 ${h}Z" fill="${accent}" opacity=".14"/><path d="${d}" fill="none" stroke="${accent}" stroke-width="2"/>`)
}

// What a scope is handed: Tone's options of an oscillator, as `get()` reads them.
export type Oscillator = { type: string; partials?: number[]; count?: number; spread?: number; harmonicity?: number; modulationIndex?: number; width?: number }
// One sample of the oscillator's base wave at phase `x` (in cycles), -1 to 1.
export function wave(o: Oscillator, x: number): number {
  const k = parseType(o.type)
  const ph = ((x % 1) + 1) % 1
  if (k.source === 'pulse' || k.source === 'pwm') {
    const width = k.source === 'pwm' ? 0 : o.width ?? 0
    return ph < (1 + width) / 2 ? 1 : -1
  }
  if (k.wave === 'custom') {
    const parts = o.partials ?? []
    const total = parts.reduce((a, b) => a + Math.abs(b), 0) || 1
    return parts.reduce((a, amp, i) => a + amp * Math.sin(2 * Math.PI * (i + 1) * x), 0) / total
  }
  if (k.wave === 'sine') return Math.sin(2 * Math.PI * x)
  if (!k.count) {
    if (k.wave === 'sawtooth') return ph < 0.5 ? 2 * ph : 2 * ph - 2
    if (k.wave === 'square') return ph < 0.5 ? 1 : -1
    return ph < 0.25 ? 4 * ph : ph < 0.75 ? 2 - 4 * ph : 4 * ph - 4
  }
  let v = 0
  for (let i = 1; i <= k.count; i++) {
    if (k.wave === 'sawtooth') v += ((i % 2 ? 1 : -1) * Math.sin(2 * Math.PI * i * x) * 2) / (Math.PI * i)
    else if (k.wave === 'square' && i % 2) v += (Math.sin(2 * Math.PI * i * x) * 4) / (Math.PI * i)
    else if (k.wave === 'triangle' && i % 2) v += ((((i - 1) / 2) % 2 ? -1 : 1) * Math.sin(2 * Math.PI * i * x) * 8) / (Math.PI * Math.PI * i * i)
  }
  return v
}
export function scope(w: number, h: number, o: Oscillator, accent: string): string {
  const k = parseType(o.type)
  const line = (f: (x: number) => number, opacity = 1) => {
    const pts: [number, number][] = []
    for (let i = 0; i <= 240; i++) pts.push([(i / 240) * w, h / 2 - clamp(f((i / 240) * 2), -1.2, 1.2) * (h / 2 - 6) * 0.8])
    return `<path d="${path(pts)}" fill="none" stroke="${accent}" stroke-opacity="${opacity}" stroke-width="1.6"/>`
  }
  let inner = `<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="#2c3d30"/>`
  if (k.source === 'fat') {
    const c = o.count ?? 3, cents = o.spread ?? 20
    for (let j = 0; j < c; j++) {
      // Each copy at its detune, spread evenly over `spread` cents, drawn a little stretched so two
      // cycles show it.
      const d = c > 1 ? (j / (c - 1) - 0.5) * (cents / 1200) * 40 : 0
      inner += line(x => wave(o, x * (1 + d)), j === Math.floor(c / 2) ? 1 : 0.45)
    }
  } else if (k.source === 'am') inner += line(x => wave(o, x) * (0.55 + 0.45 * Math.sin(2 * Math.PI * x * (o.harmonicity ?? 1))))
  else if (k.source === 'fm') inner += line(x => Math.sin(2 * Math.PI * x + ((o.modulationIndex ?? 2) / 10) * Math.sin(2 * Math.PI * x * (o.harmonicity ?? 1))))
  else inner += line(x => wave(o, x))
  return svg(w, h, inner)
}

export function sweep(w: number, h: number, s: { octaves: number; pitchDecay: number }, accent: string): string {
  const pts: [number, number][] = []
  for (let i = 0; i <= 80; i++) {
    const t = (i / 80) * 0.6
    pts.push([(i / 80) * w, h - 8 - ((s.octaves * Math.exp(-t / Math.max(0.002, s.pitchDecay))) / 10) * (h - 16)])
  }
  return svg(w, h, traced(path(pts), accent, false))
}

// MetalSynth's six FM partials sit at these ratios of the lowest (Tone's own `inharmRatios`).
const METAL = [1, 1.483, 1.932, 2.546, 2.63, 3.897]
export function metal(w: number, h: number, m: { harmonicity: number; modulationIndex: number; resonance: number }, accent: string): string {
  const at = (hz: number) => clamp(Math.log(hz / 20) / Math.log(1000), 0, 1) * w
  const amp = 0.35 + 0.65 * Math.min(1, m.modulationIndex / 64)
  const bars = METAL.map((r, i) => {
    const tall = amp * (h - 20) * (1 - i * 0.08)
    return `<rect x="${at(r * m.harmonicity * 40) - 2}" y="${h - 8 - tall}" width="4" height="${tall}" fill="${accent}"/>`
  }).join('')
  const x = at(m.resonance)
  return svg(w, h, `${bars}<line x1="${x}" y1="4" x2="${x}" y2="${h}" stroke="${accent}" stroke-dasharray="3 3"/><text x="${x + 4}" y="14" font-family="Share Tech Mono, monospace" font-size="10" fill="${accent}">TONE</text>`)
}

export function noise(w: number, h: number, colour: string, accent: string): string {
  const slope = colour === 'white' ? 0 : colour === 'pink' ? 3 : 6
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5
  const pts: [number, number][] = []
  for (let i = 0; i <= 160; i++) pts.push([(i / 160) * w, 10 + ((slope * (i / 16) - rnd() * 4) / 64) * (h - 20)])
  return svg(w, h, traced(path(pts), accent))
}

export function string(w: number, h: number, s: { resonance: number; dampening: number; release: number }, accent: string): string {
  const pts: [number, number][] = []
  for (let i = 0; i <= 200; i++) {
    const t = i / 200
    const ring = Math.exp(-t * (1 - s.resonance) * 18) * Math.exp((-t * 2) / Math.max(0.05, s.release))
    const bright = 0.5 + 0.5 * Math.exp((-t * 40) / Math.log10(Math.max(101, s.dampening)))
    pts.push([t * w, h / 2 - Math.sin(t * 60) * ring * bright * (h / 2 - 6)])
  }
  return svg(w, h, `<path d="${path(pts)}" fill="none" stroke="${accent}" stroke-width="1.5"/>`)
}
