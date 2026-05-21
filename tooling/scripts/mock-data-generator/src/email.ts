const DOMAIN = '@setafuture.onmicrosoft.com'

function stripDiacritics(token: string): string {
  // Unicode NFD decomposes most accented vowels; Đ/đ must be mapped manually.
  const replaced = token.replace(/Đ/g, 'D').replace(/đ/g, 'd')
  return replaced.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function nameToLocalPart(name: string): string {
  const tokens = name
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
  if (tokens.length < 2) {
    throw new Error(`name must have at least 2 tokens, got: "${name}"`)
  }
  if (tokens.length === 2) {
    return `${stripDiacritics(tokens[0])}.${stripDiacritics(tokens[1])}`
  }
  const given = stripDiacritics(tokens[tokens.length - 1])
  const familyMiddle = tokens.slice(0, -1).map(stripDiacritics).join('')
  return `${given}.${familyMiddle}`
}

export function assignEmails(
  names: readonly string[],
  reserved: ReadonlySet<string> = new Set(),
): string[] {
  const used = new Set<string>(reserved)
  const out: string[] = []
  for (const name of names) {
    const base = nameToLocalPart(name)
    let candidate = `${base}${DOMAIN}`
    let suffix = 2
    while (used.has(candidate)) {
      candidate = `${base}${suffix}${DOMAIN}`
      suffix++
    }
    used.add(candidate)
    out.push(candidate)
  }
  return out
}
