// Where a set lands. A MonoSynth through audiodaw's `synth`, its filterEnvelope.baseFrequency (the
// Reese's CUTOFF, a knob Tone can only set) at 40 Hz, set to 4000 Hz for transport time 1.0 s three
// ways:
//   callback   inside the transport's callback for 1.0 s, which runs up to lookAhead early
//   timeout    setTimeout to the callback's `time`
//   timeout-la setTimeout to `time - lookAhead`
// Notes every beat from 0.4 of a beat in. Prints, per 50 ms of transport time, the brightness (rms of
// the first difference over rms), so the window where it jumps is where the set was heard.
import { run, rms, LOOK_AHEAD } from './live.ts'
import { synth } from '#plugins/audiodaw/audiodaw.plugin.ts'

const BEAT = 60 / 170
const bright = (x: Float32Array, rate: number, from: number, to: number) => {
  const a = Math.round(from * rate), b = Math.round(to * rate)
  let s = 0
  for (let i = a + 1; i < b; i++) s += (x[i]! - x[i - 1]!) ** 2
  return Math.sqrt(s / (b - a)) / (rms(x, a, b) || 1e-9)
}
const ways = { callback: 0, timeout: 1, 'timeout-la': 1 } as const
const rows: string[] = []
for (const way of Object.keys(ways) as (keyof typeof ways)[]) {
  const live = await run(2.4, transport => {
    const s = synth({ is: 'MonoSynth', voices: 2, options: {} })
    s.toDestination()
    s.set({ filterEnvelope: { baseFrequency: 40 } })
    transport.scheduleRepeat(t => s.triggerAttackRelease('C3', BEAT * 0.7, t, 0.8), BEAT, BEAT * 0.4)
    transport.schedule(t => {
      const go = () => s.set({ filterEnvelope: { baseFrequency: 4000 } })
      const now = s.context.currentTime
      if (way === 'callback') go()
      else setTimeout(go, Math.max(0, (t - (way === 'timeout-la' ? LOOK_AHEAD : 0) - now) * 1000))
    }, 1.0)
  })
  const r = live.rate
  const marks: string[] = []
  let jumped: number | undefined
  for (let t = 0.2; t < 2.35; t += 0.05) {
    const b = bright(live.samples, r, t, t + 0.05)
    if (jumped === undefined && b > 0.05) jumped = t
    marks.push(b.toFixed(2))
  }
  rows.push(`${way.padEnd(11)} first bright window starts at transport ${jumped?.toFixed(2)} s (set for 1.00 s)`)
  rows.push(`            ${marks.join(' ')}`)
}
console.log(rows.join('\n'))
process.exit(0)
