export default defineEventHandler((event) => {
  const monitor = getMonitorWithState(readMonitorId(event))

  if (!monitor) {
    throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
  }

  return monitor
})
