import { mdToPdf } from 'md-to-pdf'
import { run as mmdcRun } from '@mermaid-js/mermaid-cli'
import { resolve, basename, dirname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

const argv = process.argv.slice(2)
let outDir = null
const files = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--out-dir' || a === '-o') {
    outDir = argv[++i]
  } else if (a.startsWith('--out-dir=')) {
    outDir = a.slice('--out-dir='.length)
  } else if (a === '-h' || a === '--help') {
    console.log('usage: convert.mjs [--out-dir <dir>] <file.md> [<file.md> ...]')
    process.exit(0)
  } else {
    files.push(a)
  }
}
if (files.length === 0) {
  console.error('usage: convert.mjs [--out-dir <dir>] <file.md> [<file.md> ...]')
  process.exit(1)
}
if (outDir) {
  outDir = resolve(outDir)
  mkdirSync(outDir, { recursive: true })
}

const css = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.55; color: #1f2328; font-size: 11pt; }
  h1, h2, h3, h4 { color: #0a0a0a; page-break-after: avoid; }
  h1 { font-size: 22pt; border-bottom: 2px solid #d0d7de; padding-bottom: 6px; margin-top: 0; }
  h2 { font-size: 16pt; border-bottom: 1px solid #d0d7de; padding-bottom: 4px; margin-top: 24px; }
  h3 { font-size: 13pt; margin-top: 18px; }
  h4 { font-size: 11.5pt; }
  code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9.5pt; background: #f6f8fa; padding: 1px 4px; border-radius: 3px; }
  pre { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 9pt; line-height: 1.45; page-break-inside: avoid; }
  pre code { background: transparent; padding: 0; }
  table { border-collapse: collapse; margin: 12px 0; font-size: 10pt; page-break-inside: avoid; width: 100%; }
  th, td { border: 1px solid #d0d7de; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f6f8fa; font-weight: 600; }
  blockquote { border-left: 4px solid #d0d7de; color: #57606a; margin: 0; padding: 0 12px; }
  .mermaid-figure { text-align: center; margin: 16px 0; page-break-inside: avoid; }
  .mermaid-figure img { max-width: 100%; height: auto; }
  a { color: #0969da; text-decoration: none; }
  hr { border: none; border-top: 1px solid #d0d7de; margin: 18px 0; }
`

const pdfConfig = {
  marked_options: { gfm: true },
  pdf_options: {
    format: 'A4',
    margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
    printBackground: true,
  },
  launch_options: { args: ['--no-sandbox'] },
  css,
}

async function preRenderMermaid(srcPath) {
  const md = readFileSync(srcPath, 'utf8')
  const re = /```mermaid\n([\s\S]*?)```/g
  const blocks = [...md.matchAll(re)]
  if (blocks.length === 0) return { md, cleanup: () => {} }

  const workDir = join(tmpdir(), `mmd-${randomUUID()}`)
  mkdirSync(workDir, { recursive: true })

  const renders = blocks.map((m, i) => {
    const inFile = join(workDir, `g${i}.mmd`)
    const outFile = join(workDir, `g${i}.svg`)
    writeFileSync(inFile, m[1])
    return { inFile, outFile, raw: m[0] }
  })

  for (const r of renders) {
    process.stdout.write(`  rendering ${basename(r.outFile)}…\n`)
    await mmdcRun(r.inFile, r.outFile, {
      puppeteerConfig: { args: ['--no-sandbox'] },
      parseMMDOptions: {
        mermaidConfig: { theme: 'default', flowchart: { htmlLabels: true } },
        backgroundColor: 'white',
      },
    })
  }

  let out = md
  for (const r of renders) {
    const svg = readFileSync(r.outFile, 'utf8')
    const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64')
    out = out.replace(
      r.raw,
      `\n<div class="mermaid-figure"><img src="${dataUri}" alt="diagram" /></div>\n`,
    )
  }

  return { md: out, cleanup: () => rmSync(workDir, { recursive: true, force: true }) }
}

for (const f of files) {
  const abs = resolve(f)
  if (!existsSync(abs)) {
    console.error(`not found: ${abs}`)
    process.exit(1)
  }
  const targetDir = outDir ?? dirname(abs)
  const out = join(targetDir, basename(abs, '.md') + '.pdf')
  console.log(`converting ${abs}`)
  const { md, cleanup } = await preRenderMermaid(abs)
  try {
    const pdf = await mdToPdf({ content: md, basedir: dirname(abs) }, { ...pdfConfig, dest: out })
    if (!pdf) {
      console.error(`failed: ${abs}`)
      process.exit(1)
    }
    console.log(`  -> ${out}`)
  } finally {
    cleanup()
  }
}
