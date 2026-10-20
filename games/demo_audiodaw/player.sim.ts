// The row the seat possesses. `addons/player` spawns it when the page's connection takes the one
// slot and writes that slot into `seat`. The seat stands nowhere and sends nothing: everything it
// plays and edits is the studio's, on this page (`plugins/studio/studio.plugin.ts`), so the row has
// no rule.
import type { Kind } from '#engine/engine.ts'

export const player: Kind = {}
