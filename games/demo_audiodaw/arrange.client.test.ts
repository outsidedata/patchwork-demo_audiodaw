import { describe, expect, it } from 'vitest'
import { ROW_H, ROWS_H, creep, cutOf, geometry, keepTop, revealTop, trackAt } from './arrange.client.ts'

const { SONG_Y } = geometry
// The tracks the window holds whole.
const WHOLE = Math.floor(ROWS_H / ROW_H)

describe('the tracks scroll', () => {
  it('keeps every row 64 pixels whatever the number of tracks', () => {
    expect(ROW_H).toBe(64)
    // The window over + TRACK holds five whole rows and part of a sixth.
    expect(WHOLE).toBe(5)
    expect(ROWS_H % ROW_H).toBeGreaterThan(0)
  })

  it('scrolls no further than the last track ending at the bottom of the window, nor above the first', () => {
    expect(keepTop(-30, 20)).toBe(0)
    expect(keepTop(10_000, 20)).toBe(20 * ROW_H - ROWS_H)
    expect(keepTop(100, 20)).toBe(100)
    // Tracks the window holds all of do not scroll.
    expect(keepTop(40, WHOLE)).toBe(0)
    expect(keepTop(40, 0)).toBe(0)
  })

  it('finds the track under a point of the window, scrolled', () => {
    expect(trackAt(0, 0)).toBe(0)
    expect(trackAt(ROW_H - 1, 0)).toBe(0)
    expect(trackAt(ROW_H, 0)).toBe(1)
    // Scrolled down by two and a half rows, the window's top is the third track's middle.
    expect(trackAt(0, ROW_H * 2.5)).toBe(2)
    expect(trackAt(ROW_H / 2, ROW_H * 2.5)).toBe(3)
  })

  it('reveals a track by moving as little as it can, and not at all when the track is whole in view', () => {
    // In view: left where it is.
    expect(revealTop(0, 2)).toBe(0)
    expect(revealTop(ROW_H, 3)).toBe(ROW_H)
    // Above the window: its top at the window's top.
    expect(revealTop(ROW_H * 4, 1)).toBe(ROW_H)
    // Below it: its bottom at the window's bottom.
    expect(revealTop(0, 9)).toBe(10 * ROW_H - ROWS_H)
    // Cut by the window's bottom: brought up just enough to show it whole.
    expect(revealTop(0, WHOLE)).toBe((WHOLE + 1) * ROW_H - ROWS_H)
    // The track revealed is whole in the window.
    for (const [top, i] of [[0, 12], [ROW_H * 9, 0], [ROW_H * 3 + 20, 4], [ROW_H * 3 + 20, 8]] as const) {
      const at = revealTop(top, i)
      expect(i * ROW_H).toBeGreaterThanOrEqual(at)
      expect((i + 1) * ROW_H).toBeLessThanOrEqual(at + ROWS_H)
    }
  })

  it('cuts an element to the window: whole inside, its overhang above or below cut off, all of it outside', () => {
    expect(cutOf(SONG_Y, 60)).toBe('')
    expect(cutOf(SONG_Y + ROWS_H - 60, 60)).toBe('')
    expect(cutOf(SONG_Y - 10, 60)).toBe('inset(10px 0 0px 0)')
    expect(cutOf(SONG_Y + ROWS_H - 20, 60)).toBe('inset(0px 0 40px 0)')
    expect(cutOf(SONG_Y - 60, 60)).toBe('inset(100% 0 0 0)')
    expect(cutOf(SONG_Y + ROWS_H, 60)).toBe('inset(100% 0 0 0)')
    // Nothing of a header drawn over the screens' buttons above the window or + TRACK below it.
    expect(cutOf(SONG_Y - 200, 60)).toBe('inset(100% 0 0 0)')
  })

  it('creeps while a drag holds the pointer past the window, faster the further past, never past its most', () => {
    expect(creep(0)).toBe(0)
    expect(creep(ROWS_H / 2)).toBe(0)
    expect(creep(ROWS_H)).toBe(0)
    expect(creep(-1)).toBeLessThan(0)
    expect(creep(ROWS_H + 1)).toBeGreaterThan(0)
    expect(Math.abs(creep(-40))).toBeGreaterThan(Math.abs(creep(-4)))
    expect(creep(ROWS_H + 10_000)).toBe(16)
    expect(creep(-10_000)).toBe(-16)
  })
})
