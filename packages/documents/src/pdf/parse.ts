import { PDFParse } from 'pdf-parse'

export interface PdfMetadata {
  title?: string
  author?: string
  createdAt?: string
}

export interface PageText {
  pageNumber: number
  text: string
}

export interface ParsedPdf {
  text: string
  pages: PageText[]
  metadata: PdfMetadata
  pageCount: number
}

export async function parsePdf(input: Buffer): Promise<ParsedPdf> {
  const parser = new PDFParse({ data: input })

  const [textResult, infoResult] = await Promise.all([parser.getText(), parser.getInfo()])

  const pages: PageText[] = textResult.pages.map((p: { num: number; text: string }) => ({
    pageNumber: p.num,
    text: p.text,
  }))

  return {
    text: textResult.text,
    pages,
    pageCount: textResult.total,
    metadata: {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      title: infoResult.info?.Title as string | undefined,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      author: infoResult.info?.Author as string | undefined,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      createdAt: infoResult.info?.CreationDate as string | undefined,
    },
  }
}
