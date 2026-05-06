'use client'

import { useRef, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Button } from '@future/ui'
import { Bold, Italic, Underline as UnderlineIcon, Code } from '@future/ui/icons'

interface Props {
  value: string
  onChange: (html: string) => void
}

export function RichTextDescription({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Only save when the user has focused AND edited the content.
  // hasFocusedRef guards against Tiptap firing onUpdate during initialization / StrictMode
  // remounts (where refs survive the cycle but the user hasn't touched the editor yet).
  const hasFocusedRef = useRef(false)
  const dirtyRef = useRef(false)
  // Stable ref to avoid re-registering the mousedown listener on every render
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const editor = useEditor({
    immediatelyRender: false,
    // StarterKit v3 already includes Underline — no separate import needed
    extensions: [StarterKit],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'min-h-[4rem] focus:outline-none text-sm text-fg-primary',
        'data-testid': 'rich-text-editor-content',
      },
    },
    onFocus: () => {
      hasFocusedRef.current = true
    },
    onUpdate: ({ transaction }) => {
      // docChanged is false for selection-only transactions (focus, cursor move).
      // Only mark dirty when the user actually changed content.
      if (hasFocusedRef.current && transaction.docChanged) dirtyRef.current = true
    },
  })

  useEffect(() => {
    if (!editor) return
    function handleMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node) && dirtyRef.current) {
        dirtyRef.current = false
        onChangeRef.current(editor!.getHTML())
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [editor])

  if (!editor) return null

  return (
    <div ref={containerRef} className="flex flex-col gap-2" data-testid="rich-text-description">
      <div className="flex items-center gap-1 border-b border-white/5 pb-1">
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          aria-pressed={editor.isActive('bold')}
          data-testid="toolbar-bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          aria-pressed={editor.isActive('italic')}
          data-testid="toolbar-italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          aria-pressed={editor.isActive('underline')}
          data-testid="toolbar-underline"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          aria-pressed={editor.isActive('code')}
          data-testid="toolbar-code"
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="size-3.5" />
        </Button>
      </div>
      <EditorContent
        editor={editor}
        role="textbox"
        className="prose prose-sm prose-invert max-w-none"
      />
    </div>
  )
}
