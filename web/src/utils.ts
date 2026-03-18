/** Format milliseconds into human-readable duration: 420ms / 4s / 1m 30s / 2h 5m */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const totalSec = Math.floor(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

/** Format a loop interval (stored as seconds string) into human-readable: 30s / 5m / 1h 30m */
export function formatInterval(seconds: string | number): string {
  const s = typeof seconds === 'string' ? parseInt(seconds, 10) : seconds
  if (isNaN(s)) return String(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) return rs > 0 ? `${m}m ${rs}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

/** Convert a value + unit (s/m/h) to total seconds */
export function toSeconds(value: string, unit: 's' | 'm' | 'h'): number {
  const n = parseInt(value, 10) || 1
  if (unit === 'm') return n * 60
  if (unit === 'h') return n * 3600
  return n
}
