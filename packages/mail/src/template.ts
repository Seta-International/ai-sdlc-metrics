import mjml2html from 'mjml'
import Handlebars from 'handlebars'

export function renderMjmlTemplate(mjmlTemplate: string, data: Record<string, unknown>): string {
  const compiled = Handlebars.compile(mjmlTemplate)
  const mjmlString = compiled(data)

  const result = mjml2html(mjmlString, {
    validationLevel: 'strict',
    keepComments: false,
  })

  if (result.errors.length > 0) {
    throw new Error(`MJML compilation errors: ${result.errors.map((e) => e.message).join(', ')}`)
  }

  return result.html
}
