/** Pulls the most useful message out of an ofetch error for a toast. */
export function resolveErrorMessage(error: unknown): string {
  const candidate = error as {
    data?: { message?: string, statusMessage?: string }
    statusMessage?: string
    message?: string
  }

  return candidate?.data?.statusMessage
    || candidate?.data?.message
    || candidate?.statusMessage
    || candidate?.message
    || ''
}
