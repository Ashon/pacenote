import type { VmStatus } from './types.js'

/**
 * Where the built-in sandbox stands, as every screen says it (the first run,
 * Settings' section hint and the sandbox's own panel judge it here alike):
 * - unsupported: this Mac cannot run it
 * - helper: pacenote-vm did not answer
 * - set-up: the kernel, the init image or the reasoner's image is missing
 * - outdated: all there, but an image is from another version's recipe (it
 *   still runs; the setup builds it anew)
 * - ready: Pace can answer in it
 * It reads no files, so the phone app can say it the same way.
 */
export type VmReadiness =
  'unsupported' | 'helper' | 'set-up' | 'outdated' | 'ready'

export function vmReadiness(vm: VmStatus): VmReadiness {
  if (vm.unsupported) return 'unsupported'
  if (!vm.helper.ok) return 'helper'
  if (!vm.kernel || !vm.initfs || !vm.image) return 'set-up'
  if ((vm.outdated ?? []).length > 0) return 'outdated'
  return 'ready'
}
