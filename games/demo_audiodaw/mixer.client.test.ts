import { describe, expect, it } from 'vitest'
import { WINDOW_W, keepFrom, revealFrom, short, stripsWidth } from './mixer.client.ts'

describe('a strip\'s effects', () => {
  it('counts them, not names them', () => {
    expect(short([])).toBe('NO EFFECTS')
    expect(short([{ is: 'Reverb', on: true, options: {} }])).toBe('1 EFFECT')
    expect(short([{ is: 'Chorus', on: true, options: {} }, { is: 'Phaser', on: false, options: {} }])).toBe('2 EFFECTS')
  })
})

// A strip and the gap after it.
const PITCH = stripsWidth(2) - stripsWidth(1)
// The strips the window holds whole.
const WHOLE = Math.floor((WINDOW_W + PITCH - stripsWidth(1)) / PITCH)

describe('the mixer scrolls', () => {
  it('lays the strips side by side, a gap between each', () => {
    expect(stripsWidth(0)).toBe(0)
    expect(stripsWidth(1)).toBe(118)
    expect(stripsWidth(3)).toBe(3 * 118 + 2 * 4)
    // The window, left of + BUS and the master, holds nine strips whole.
    expect(WHOLE).toBe(9)
  })

  it('scrolls no further than the last strip ending at the window\'s right, nor before the first', () => {
    expect(keepFrom(-50, 20)).toBe(0)
    expect(keepFrom(100_000, 20)).toBe(stripsWidth(20) - WINDOW_W)
    expect(keepFrom(200, 20)).toBe(200)
    // Strips the window holds all of do not scroll.
    expect(keepFrom(200, WHOLE)).toBe(0)
    expect(keepFrom(200, 0)).toBe(0)
  })

  it('reveals a strip by moving as little as it can, and not at all when it is whole in view', () => {
    expect(revealFrom(0, 3)).toBe(0)
    // Left of the window: its left at the window's left.
    expect(revealFrom(PITCH * 6, 2)).toBe(PITCH * 2)
    // Right of it: its right at the window's right.
    expect(revealFrom(0, 14)).toBe(14 * PITCH + stripsWidth(1) - WINDOW_W)
    for (const [from, i] of [[0, 12], [PITCH * 9, 0], [PITCH * 3 + 40, 4], [PITCH * 3 + 40, 12]] as const) {
      const at = revealFrom(from, i)
      expect(i * PITCH).toBeGreaterThanOrEqual(at)
      expect(i * PITCH + stripsWidth(1)).toBeLessThanOrEqual(at + WINDOW_W)
    }
  })
})
