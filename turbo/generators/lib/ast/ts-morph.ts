import { IndentationText, Project, QuoteKind, type SourceFile } from 'ts-morph'
import type { Tree } from '../tree'

export function withSourceFile(
  tree: Tree,
  relPath: string,
  mutate: (sf: SourceFile) => void,
): void {
  if (!tree.exists(relPath)) {
    throw new Error(`withSourceFile: ${relPath} does not exist in Tree`)
  }
  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      quoteKind: QuoteKind.Single,
      useTrailingCommas: true,
      indentationText: IndentationText.TwoSpaces,
    },
  })
  const sf = project.createSourceFile(relPath, tree.read(relPath))
  mutate(sf)
  tree.write(relPath, sf.getFullText())
}
