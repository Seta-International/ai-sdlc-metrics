'use client'

import { useRef, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { Button } from '@future/ui'
import { Bold, Italic, Underline as UnderlineIcon, Code } from '@future/ui/icons'

interface Props {
  value: string
  onChange: (html: string) => void
}

export function RichTextDescription({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Underline],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'min-h-[4rem] focus:outline-none text-sm text-fg-primary',
        'data-testid': 'rich-text-editor-content',
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    function handleMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        onChange(editor!.getHTML())
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [editor, onChange])

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
