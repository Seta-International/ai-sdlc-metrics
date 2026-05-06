export class ListSuggestionsQuery {
  constructor(
    public readonly surface: string,
    public readonly contextEntity?: string,
  ) {}
}
