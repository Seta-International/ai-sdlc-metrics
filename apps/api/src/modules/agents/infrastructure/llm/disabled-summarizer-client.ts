import type { AiClient } from '../../application/services/summarizer'

export class DisabledSummarizerAiClient implements AiClient {
  async generateText(): Promise<string> {
    throw new Error(
      'Summarizer AiClient is disabled in Phase 1. Wire a real client before invoking Summarizer.',
    )
  }
}
