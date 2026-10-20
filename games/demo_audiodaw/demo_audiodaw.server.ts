// The manager and main in one process, behind one socket. Each socket is one connection: one
// seat in main, the scene the manager row names as `entry`.
import { boot, type Scene } from '#engine/engine.ts'
import { accept, load, manager, run } from '#addons/scenemanager/scenemanager.addon.ts'
import { serve } from '#addons/socket/socket.addon.ts'
import { sim } from './demo_audiodaw.sim.ts'
import file from './demo_audiodaw.scene.json' with { type: 'json' }

const scene = file as Scene
const truth = boot(scene, sim)
await load(truth, import.meta.url)
await serve(manager(truth).data.port, accept(manager(truth)))
run(truth)
