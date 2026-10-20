// A live, real-time Tone context to no device with lookAhead 0.5 (main.scene.json) and a latencyHint
// of 3 s (Bill's number), and its output captured as it plays: a ScriptProcessorNode on
// Tone's destination copies every block, stamped with the audio time it plays at. `run` builds the
// graph in `setup`, starts the transport at audio time `start`, waits `seconds`, and hands back
// channel 0 from the transport's start, so sample i is transport time i / rate.
//
// Tone.Offline cannot stand in: it runs every transport callback before it renders any audio, so a
// plain property set in a callback is heard for the whole render (timing.ts measured it).
import '#plugins/audiodaw/nodeaudio.ts'
import * as Tone from 'tone'
import { writeFileSync } from 'node:fs'

export const LOOK_AHEAD = 0.5
export const LATENCY_HINT = 3

export type Live = { samples: Float32Array; rate: number }

export async function run(seconds: number, setup: (transport: ReturnType<typeof Tone.getTransport>) => void, bpm = 170): Promise<Live> {
  const raw = new (globalThis as unknown as { AudioContext: new (o: object) => AudioContext }).AudioContext({ sinkId: { type: 'none' }, latencyHint: LATENCY_HINT })
  const ctx = new Tone.Context(raw as unknown as AudioContext)
  ctx.lookAhead = LOOK_AHEAD
  Tone.setContext(ctx)
  const rate = raw.sampleRate
  const total = Math.ceil((seconds + 0.2) * rate)
  const out = new Float32Array(total)
  const start = raw.currentTime + 0.6
  const tap = raw.createScriptProcessor(1024, 1, 1)
  tap.onaudioprocess = (e: AudioProcessingEvent) => {
    const block = e.inputBuffer.getChannelData(0)
    const at = Math.round((e.playbackTime - start) * rate)
    for (let i = 0; i < block.length; i++) {
      const j = at + i
      if (j >= 0 && j < total) out[j] = block[i]!
    }
  }
  const dest = Tone.getDestination()
  dest.connect(tap as unknown as Tone.InputNode)
  tap.connect(raw.destination)
  const transport = Tone.getTransport()
  transport.bpm.value = bpm
  setup(transport)
  transport.start(start)
  await new Promise(done => setTimeout(done, (seconds + 0.6 + 0.5) * 1000))
  transport.stop()
  tap.disconnect()
  await ctx.close()
  return { samples: out.subarray(0, Math.ceil(seconds * rate)), rate }
}

// 16-bit mono WAV.
export function wav(path: string, x: Float32Array, rate: number) {
  const b = Buffer.alloc(44 + x.length * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40)
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i]! * 32767))), 44 + i * 2)
  writeFileSync(path, b)
}

export const rms = (x: Float32Array, from: number, to: number) => {
  let s = 0
  for (let i = from; i < to; i++) s += x[i]! * x[i]!
  return Math.sqrt(s / Math.max(1, to - from))
}

// The largest second difference |x[n] - 2x[n-1] + x[n-2]| between two sample indices: a click is a
// corner in the waveform, which a smooth signal of these pitches does not have.
export const corner = (x: Float32Array, from: number, to: number) => {
  let most = 0
  for (let i = Math.max(2, from); i < to; i++) most = Math.max(most, Math.abs(x[i]! - 2 * x[i - 1]! + x[i - 2]!))
  return most
}

// A level's map, 0–1 of a knob's travel to its value, on its curve (the definition's ranges).
export const map = (v: number, min: number, max: number, log = false) => (log ? min * Math.pow(max / min, v) : min + (max - min) * v)
