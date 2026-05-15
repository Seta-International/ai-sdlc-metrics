import { Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn'

interface Props {
  lang: 'json' | 'typescript' | 'bash'
  className?: string
  children: string
}

type Highlighter = { codeToHtml: (code: string, opts: { lang: string; theme: string }) => string }
let highlighterPromise: Promise<Highlighter> | null = null
async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then((m) =>
      m.createHighlighter({
        themes: ['github-light'],
        langs: ['json', 'typescript', 'bash'],
      }),
    ) as Promise<Highlighter>
  }
  return highlighterPromise
}

export function Code({ lang, className, children }: Props) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getHighlighter()
      .then((hl) => {
        if (cancelled) return
        setHtml(hl.codeToHtml(children, { lang, theme: 'github-light' }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [children, lang])

  const onCopy = () => {
    void navigator.clipboard?.writeText(children)
  }

  return (
    <div className={cn('relative rounded-md border border-hairline bg-canvas-soft p-3', className)}>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy code"
        className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md text-ink-mute hover:bg-canvas-subtle"
      >
        <Copy className="size-3.5 stroke-[1.5]" />
      </button>
      {html ? (
        <div
          data-testid="hl"
          className="text-[13px] font-mono"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is well-formed HTML
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto text-[13px] font-mono text-ink">{children}</pre>
      )}
    </div>
  )
}
