export class SendMessageCommand {
  constructor(
    readonly tenantId: string,
    readonly sessionId: string,
    readonly role: 'user' | 'assistant' | 'tool_call' | 'tool_result',
    readonly content: string,
    readonly toolName?: string,
    readonly toolArgs?: Record<string, unknown>,
    readonly modelUsed?: string,
    readonly tokensUsed?: number,
    readonly isError?: boolean,
  ) {}
}
