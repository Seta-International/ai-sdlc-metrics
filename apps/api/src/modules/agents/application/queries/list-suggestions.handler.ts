import { Injectable } from '@nestjs/common'
import type { SuggestionResult } from '../../domain/value-objects/suggestion'
import { resolveSuggestions } from '../../infrastructure/suggestion-config'
import { ListSuggestionsQuery } from './list-suggestions.query'

@Injectable()
export class ListSuggestionsHandler {
  async execute(query: ListSuggestionsQuery): Promise<SuggestionResult> {
    return resolveSuggestions({
      surface: query.surface,
      contextEntity: query.contextEntity,
    })
  }
}
