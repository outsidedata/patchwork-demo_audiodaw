// Experiment 4: when a set lands. A transport callback is handed `time`, the audio time its event
// is for, and runs earlier than that by up to Tone's look-ahead. A Param ramp scheduled at `time`
// lands at `time`; a plain property set inside the callback lands when the callback runs, at the
// context's `currentTime`. This measures `time - currentTime` at each callback:
//   live   a real-time context to no device with the studio's own timing (main.scene.json:
//          lookAhead 0.5, latencyHint 0.2), the transport running for 6 s, a callback every 16th
//          at 170 bpm
//   offline  Tone.Offline, the same callbacks
// and, for the live context, two ways to put a plain set on its time instead:
//   draw     Tone.getDraw().schedule(cb, time) (fires on an animation frame near `time`)
//   timeout  setTimeout(cb, (time - currentTime) * 1000)
// Each prints the error in ms (positive = early).
import '#plugins/audiodaw/nodeaudio.ts'
import * as Tone from 'tone'

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return `n=${xs.length} mean=${mean.toFixed(1)} min=${s[0]!.toFixed(1)} p50=${q(0.5).toFixed(1)} p95=${q(0.95).toFixed(1)} max=${s.at(-1)!.toFixed(1)}`
}

async function live() {
  const ctx = new Tone.Context(new (globalThis as unknown as { AudioContext: new (o: object) => AudioContext }).AudioContext({ sinkId: { type: 'none' }, latencyHint: 3 }) as unknown as AudioContext)
  ctx.lookAhead = 0.5
  Tone.setContext(ctx)
  const transport = Tone.getTransport()
  transport.bpm.value = 170
  const early: number[] = []
  const draw: number[] = []
  const timeout: number[] = []
  transport.scheduleRepeat((time) => {
    early.push((time - ctx.currentTime) * 1000)
    Tone.getDraw().schedule(() => draw.push((time - ctx.currentTime) * 1000), time)
    setTimeout(() => timeout.push((time - ctx.currentTime) * 1000), Math.max(0, (time - ctx.currentTime) * 1000))
  }, '16n', 0)
  transport.start('+0.1')
  await new Promise(done => setTimeout(done, 6000))
  transport.stop()
  await new Promise(done => setTimeout(done, 700))
  console.log(`live, lookAhead ${ctx.lookAhead} s, latencyHint 3`)
  console.log(`  callback (where a plain set lands)   ${stats(early)}`)
  console.log(`  Draw.schedule                        ${stats(draw)}`)
  console.log(`  setTimeout to time                   ${stats(timeout)}`)
  console.log(`  context baseLatency ${(((ctx.rawContext as AudioContext).baseLatency ?? NaN) * 1000).toFixed(1)} ms, outputLatency ${(((ctx.rawContext as AudioContext).outputLatency ?? NaN) * 1000).toFixed(1)} ms`)
  await ctx.close()
}

async function offline() {
  const early: number[] = []
  let look = NaN
  await Tone.Offline(({ transport }) => {
    look = Tone.getContext().lookAhead
    transport.bpm.value = 170
    transport.scheduleRepeat((time) => early.push((time - Tone.getContext().currentTime) * 1000), '16n', 0)
    transport.start(0)
  }, 3)
  console.log(`offline, lookAhead ${look} s`)
  console.log(`  callback (where a plain set lands)   ${stats(early)}`)
}

await offline()
await live()
process.exit(0)
