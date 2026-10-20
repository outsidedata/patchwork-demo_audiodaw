import { describe, expect, it } from 'vitest'
import { patternOf, type Preset } from '#plugins/audiodaw/audiodaw.sim.ts'
import { songs } from './songs.ts'
import presets from '../../assets/presets.json' with { type: 'json' }

const shipped = presets as Preset[]

describe('every song', () => {
  it('opens: every clip plays a pattern of its track, every note track targets a device, every note lies inside its pattern', () => {
    for (const s of songs) {
      const p = s.make(shipped)
      for (const c of p.clips) expect(() => patternOf(p, c), s.name).not.toThrow()
      for (const t of p.tracks) {
        if (t.kind !== 'notes') continue
        expect(p.rack[t.target!], `${s.name} ${t.name}`).toBeDefined()
        for (const x of Object.values(t.patterns)) for (const note of x.notes) expect(note.time + note.duration, `${s.name} ${t.name}`).toBeLessThanOrEqual(x.length)
      }
    }
  })
})
