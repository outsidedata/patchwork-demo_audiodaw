// The kinds of main, the studio, and the main.scene.json file next to this one. The seat's `player`
// row stands nowhere and plays nothing over the wire: the song is the studio's, a value this page
// holds (`plugins/studio/studio.plugin.ts`). Each screen is a kind of one `actors` entry with no
// rule, whose look draws it through renderdom: `transport`, `roll`, `arrange`, `mixer` and
// `rack` (the faceplate and the Inserts panel). The `loader` row preloads the scene's catalogue: the
// definitions and the instruments' presets (`assets/presets.json`), which the studio reads.
import type { Scene, Sim } from '#engine/engine.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { loader } from '#plugins/loader/loader.sim.ts'
import { player } from './player.sim.ts'
import { transport } from './transport.sim.ts'
import { roll } from './roll.sim.ts'
import { arrange } from './arrange.sim.ts'
import { mixer } from './mixer.sim.ts'
import { rack } from './rack.sim.ts'
import file from './main.scene.json' with { type: 'json' }

export const sim: Sim = { scenemanager, loader, player, transport, roll, arrange, mixer, rack }

export const scene = file as Scene
