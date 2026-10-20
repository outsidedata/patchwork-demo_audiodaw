# demo_audiodaw

The studio: a small DAW on audiodaw (`plugins/audiodaw`), its songs in `plugins/studio/songs.ts`.

## Experiments on audiodaw and Tone

Questions about how Tone behaves are settled by running it, not by reading it. The scripts live in
`experiments/<question>/`, each with a header saying what it measures, and are run from the repo root
with vite-node:

```
node_modules/.bin/vite-node games/demo_audiodaw/experiments/automation/census.ts
```

vite-node, not `node --experimental-strip-types`: audiodaw imports `./audiodaw.sim` with no
extension, which plain node cannot resolve; vite-node resolves it and the repo's `#plugins/...`
paths. A script that does not import audiodaw (census.ts, timing.ts) runs under plain node too.

### Rules learned the hard way

- **Never use `Tone.Offline` for anything scheduled.** It runs every transport callback first and
  renders the audio afterwards, so a property set in a callback is heard for the whole render.
  `timing.ts` measured it: in an offline render, callbacks run up to 2.8 s before their time.
  Offline is fine for a fixed graph with notes and Param automation, as audiodaw's own tests use it.
- **Use a live context to no device and capture what it plays.** `experiments/automation/live.ts`
  does this: a real-time `AudioContext({ sinkId: { type: 'none' } })` wrapped in a `Tone.Context`,
  a `ScriptProcessorNode` on Tone's destination copying every block at its `playbackTime`, so
  sample `i` of the result is transport time `i / rate`. A run takes real time. `run(seconds,
  setup)` builds the graph in `setup`, starts the transport and hands back the samples; `wav()`
  writes a file to listen to.
- **Use the studio's timing.** `lookAhead` 0.5 s (`main.scene.json`'s `world.audiodaw`) and a
  `latencyHint` of 3 s. With no device, node-web-audio-api reports a `baseLatency` and
  `outputLatency` of 0 whatever the hint, so what the 3 s hint does can only be measured in Chrome.
- **End every script with `process.exit(0)`.** A live context or a Tone worklet keeps node running
  after the work is done.
- **Don't render BitCrusher or PluckSynth offline.** Their worklets throw in an offline render on
  node. Making them in a live context is fine.
- **Score a click against its own surroundings.** A click is a corner (second difference) the sound
  around it does not make. Comparing against a run held at another setting scores a brighter sound
  as clicks. Keep notes off the grid being tested (notes start 0.4 of a beat in), so no step lands
  on an attack.
- **Check that a change is heard at all before measuring it** (`probe.ts`). A set can take (the
  object reads the new value back) and still not be heard in the window being measured.

## Automation: what was measured (2026-10-17)

The design is on the canvas https://claude.ai/artifact/Sz5d6EuJaadEDzdLTkJgT5. Automation tracks are
tracks of automation notes aimed at one knob. An automation note fires, holds and ends like a note:
it overrides the knob while it holds, and the knob returns to its faceplate value when it ends.
Values are stored as 0–1 and mapped through the knob's range and curve when played.

### `census.ts`: every knob, sorted by what Tone holds at its path

It makes every instrument class, every effect the studio offers, every preset and every drum pad in
a live context, walks Tone's `get()` of each, and looks up what the object holds at each numeric
option's path. It prints the table and writes `census.json`.

- 255 knobs: **119 glide** (a Tone `Param` or `Signal`, rampable on the audio clock), **132 can
  only be set** (a plain property or getter/setter), **4 not on the object** (Tone takes them only
  when made, so audiodaw makes the effect again). Of the 4 only Phaser `stages` is on a faceplate.
- Glide: every volume, detune, pan and send; Filter frequency, Q and gain; every LFO rate and
  depth; every `wet`; delay times and feedback; FM and AM harmonicity and FM's index; compressor and
  EQ settings; reverb room sizes; StereoWidener width.
- Set only: every envelope's attack, decay, sustain and release; portamento; a FrequencyEnvelope's
  `baseFrequency`, `octaves` and `exponent` (the MonoSynth's and DuoSynth's CUTOFF, ENV AMT and
  CURVE); Phaser, AutoFilter and AutoWah `baseFrequency` and `octaves`; Distortion amount; Chorus
  delay time, depth and spread; Reverb decay and pre-delay; Freeverb and PluckSynth dampening;
  MetalSynth's knobs; Membrane `octaves` and `pitchDecay`; a fat oscillator's count and spread;
  PitchShift pitch and window; Gate threshold and smoothing; Chebyshev order.
- The MonoSynth's `filter.frequency` glides but is hidden: the filter envelope drives it, so the
  CUTOFF a player sees is the envelope's set-only `baseFrequency`.

### `timing.ts`: when a set lands

Each 16th note at 170 bpm, a transport callback records `time - currentTime` (positive is early).
With lookAhead 0.5 and the latencyHint at 3:

| where the set is made | error (ms, positive = early) |
| --- | --- |
| inside the transport callback | mean 373, from 251 to 498 |
| `setTimeout` to the callback's `time` | mean 0.1, from −2.2 to 2.4 |
| `Tone.getDraw().schedule` at `time` | mean 0.4, from −8.9 to 7.9 (node's frame shim is a 16 ms timer) |

### `probe.ts`: where a set is heard

A MonoSynth's filter-envelope `baseFrequency` goes from 40 Hz to 4000 Hz for transport time 1.0 s,
with notes every beat. The brightness of each 50 ms window shows where the change is heard:

| how the set is sent | first bright window |
| --- | --- |
| inside the callback | 1.25 s |
| `setTimeout` to `time` | 1.50 s |
| `setTimeout` to `time - lookAhead` | 1.20 s, the first note after 1.0 s |

A setter that writes one of Tone's Params does it at Tone's `now()`, which is the context's time
plus the look-ahead. A set sent at `time` is therefore heard 0.5 s late. Sent at `time - lookAhead`,
it is heard on time: here at the first note after 1.0 s, since the notes leave gaps (notes at
0.847–1.094 s and from 1.200 s).

### Decided

- A knob that glides is ramped on the audio clock: linear, exp (one fixed curve) or step.
- A knob that can only be set is **set on every 16th note**, the automation note's value at that
  16th. It does not sweep between 16ths, and that is fine.
- A set is sent at its 16th's time less the look-ahead, so it is heard on the 16th.
- Two automation notes on one knob at once have no rule.

### `steps.ts`: not run to completion

It plays each set-only knob through audiodaw's own `synth` and `effect`, changes it once, then steps
it at 16ths and 32nds. It records clicks, level, brightness, gaps, when the change is heard against
two reference runs, and the time each set call takes, and writes WAVs. It was stopped once setting
on 16ths was decided. It sends each set at the step's time less the look-ahead and scores clicks
against each step's own surroundings, so it is ready to run for any knob:
`vite-node games/demo_audiodaw/experiments/automation/steps.ts <part of owner.path>`.
