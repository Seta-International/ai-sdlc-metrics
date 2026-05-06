export interface Suggestion {
  readonly slug: string
  readonly text: string
}

export interface SuggestionResult {
  readonly suggestions: ReadonlyArray<Suggestion>
  readonly welcomeSubtext: string
}
