/**
 * What the instance's own network probe could not do. `network` means no target
 * answered at all, `dns` that the route is intact while the resolver is not —
 * two faults with the same consequence for every check and two very different
 * things to go and fix.
 */
export type UplinkFault = 'network' | 'dns'

/**
 * The instance's own connectivity, as the last probe found it.
 *
 * `since` is the start of the running outage rather than of the last probe, so
 * a banner and the recovery notification can both say how long the instance was
 * blind without keeping a clock of their own.
 */
export interface UplinkStatus {
  online: boolean
  /** Unix seconds the current outage started, null while online. */
  since: number | null
  fault: UplinkFault | null
  /** Unix seconds of the last probe, null while none has run. */
  checkedAt: number | null
}
