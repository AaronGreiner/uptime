/** Accepts either the numeric id or the slug, so pages can link by slug. */
export default defineEventHandler((event) => {
  const dashboard = getDashboardWithWidgets(readDashboardKey(event))

  if (!dashboard) {
    throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })
  }

  return dashboard
})
