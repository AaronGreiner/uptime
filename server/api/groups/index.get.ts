/** Public, like every other read endpoint. The tree is built on the client. */
export default defineEventHandler(() => {
  return listMonitorGroups()
})
