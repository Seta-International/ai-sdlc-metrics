export interface StandardSchemaV1<TInput = unknown, TOutput = TInput> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) =>
      | { value: TOutput }
      | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey> }> }
      | Promise<
          | { value: TOutput }
          | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey> }> }
        >
    readonly types?: { readonly input: TInput; readonly output: TOutput }
  }
}
