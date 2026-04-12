import Handlebars from 'handlebars'
import { getBrowser } from './chromium'
import type { TenantBranding } from '../common/branding'

export interface PdfTemplate {
  html: string
  css?: string
}

export interface PdfGenerateOpts {
  template: PdfTemplate
  data: Record<string, unknown>
  branding?: TenantBranding
  format?: 'A4' | 'Letter'
  landscape?: boolean
}

export async function generatePdf(opts: PdfGenerateOpts): Promise<Buffer> {
  const compiled = Handlebars.compile(opts.template.html)
  const htmlBody = compiled(opts.data)

  const cssBlocks: string[] = []
  if (opts.template.css) cssBlocks.push(opts.template.css)
  if (opts.branding?.primaryColor) {
    cssBlocks.push(`:root { --brand-color: ${opts.branding.primaryColor}; }`)
  }
  if (opts.branding?.fontFamily) {
    cssBlocks.push(`body { font-family: ${opts.branding.fontFamily}, sans-serif; }`)
  }

  const fullHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${cssBlocks.join('\n')}</style></head>
<body>${htmlBody}</body>
</html>`

  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.setContent(fullHtml, { waitUntil: 'networkidle2' })
    await page.emulateMediaType('screen')

    const pdfData = await page.pdf({
      format: opts.format ?? 'A4',
      landscape: opts.landscape ?? false,
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    })

    return Buffer.from(pdfData)
  } finally {
    await page.close()
  }
}
