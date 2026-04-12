declare module 'mjml' {
  interface MjmlConfig {
    validationLevel?: 'strict' | 'soft' | 'skip'
    keepComments?: boolean
    minify?: boolean
  }
  interface MjmlError {
    message: string
  }
  interface MjmlOutput {
    html: string
    errors: MjmlError[]
  }
  function mjml2html(input: string, options?: MjmlConfig): MjmlOutput
  export = mjml2html
}
