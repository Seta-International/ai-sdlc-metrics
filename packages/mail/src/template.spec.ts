import { describe, expect, it } from 'vitest'
import { renderMjmlTemplate } from './template'

describe('renderMjmlTemplate', () => {
  it('renders MJML with Handlebars variables to HTML', () => {
    const mjml = `
      <mjml>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text>Hello {{name}}, your leave from {{from}} to {{to}} was approved.</mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `
    const html = renderMjmlTemplate(mjml, { name: 'Nguyen', from: 'Apr 14', to: 'Apr 18' })

    expect(html).toContain('Hello Nguyen')
    expect(html).toContain('Apr 14')
    expect(html).toContain('Apr 18')
    expect(html).toContain('<!doctype html>')
  })

  it('throws on invalid MJML with strict validation', () => {
    const invalidMjml = '<mjml><mj-body><mj-invalid /></mj-body></mjml>'

    expect(() => renderMjmlTemplate(invalidMjml, {})).toThrow()
  })
})
