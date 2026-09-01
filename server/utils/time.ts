/** The one Unix-seconds clock used by server code. */
export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000)
}
