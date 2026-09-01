import { getUplinkStatus } from '../services/uplink'

/** Last observed connectivity of this instance. Public and read only. */
export default defineEventHandler(() => getUplinkStatus())
