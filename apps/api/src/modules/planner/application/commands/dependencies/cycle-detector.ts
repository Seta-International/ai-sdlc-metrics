interface Edge {
  from: string
  to: string
}

export function wouldCreateCycle(from: string, to: string, edges: Edge[]): boolean {
  const adj = new Map<string, string[]>()
  for (const edge of edges) {
    const neighbours = adj.get(edge.from) ?? []
    neighbours.push(edge.to)
    adj.set(edge.from, neighbours)
  }
  const visited = new Set<string>()
  const stack = [to]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === from) return true
    if (visited.has(current)) continue
    visited.add(current)
    stack.push(...(adj.get(current) ?? []))
  }
  return false
}
