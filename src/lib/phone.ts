export function normalizePhone(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.includes('@')) return trimmed.toLowerCase()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (trimmed.startsWith('+')) return `+${digits}`
  return trimmed
}
