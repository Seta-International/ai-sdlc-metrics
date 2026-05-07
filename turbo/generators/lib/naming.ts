function tokenize(input: string): string[] {
  return input
    .replace(/[_\-\s]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export function kebab(input: string): string {
  return tokenize(input).join('-')
}

export function camel(input: string): string {
  const tokens = tokenize(input)
  return tokens.map((t, i) => (i === 0 ? t : t.charAt(0).toUpperCase() + t.slice(1))).join('')
}

export function pascal(input: string): string {
  return tokenize(input)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join('')
}

export function screamingSnake(input: string): string {
  return tokenize(input).join('_').toUpperCase()
}

export function isValidKebab(input: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(input) && input.length >= 2
}
