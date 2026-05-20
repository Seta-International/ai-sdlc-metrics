export type Rng = {
  next: () => number
  intRange: (lo: number, hi: number) => number
  pick: <T>(items: readonly T[]) => T
  sample: <T>(items: readonly T[], k: number) => T[]
  chance: (p: number) => boolean
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  const intRange = (lo: number, hi: number): number => lo + Math.floor(next() * (hi - lo + 1))
  const pick = <T>(items: readonly T[]): T => items[intRange(0, items.length - 1)]!
  const sample = <T>(items: readonly T[], k: number): T[] => {
    if (k > items.length) throw new Error(`sample k=${k} > items.length=${items.length}`)
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = intRange(0, i)
      ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
    }
    return copy.slice(0, k)
  }
  const chance = (p: number): boolean => next() < p
  return { next, intRange, pick, sample, chance }
}
