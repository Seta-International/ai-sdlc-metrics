'use client'

import * as React from 'react'
import { Upload } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './button'

// ─── FileUploadTrigger ────────────────────────────────────────────────────────
// Invisible file input wired to a Button. Drop-in replacement for the hidden
// <input type="file" ref={...}> + Button.onClick pattern.

export interface FileUploadTriggerProps {
  /** Called with the selected FileList. */
  onFiles: (files: FileList) => void
  /** Forwarded to <input accept="..."> */
  accept?: string
  /** Allow selecting multiple files. */
  multiple?: boolean
  /** Render the trigger button. Defaults to "Choose file". */
  children?: React.ReactNode
  /** Extra classes on the Button wrapper. */
  className?: string
  /** Forwarded to the Button. */
  variant?: React.ComponentProps<typeof Button>['variant']
  /** Forwarded to the Button. */
  size?: React.ComponentProps<typeof Button>['size']
  disabled?: boolean
  /** data-testid forwarded to the hidden input for testing. */
  'data-testid'?: string
}

export function FileUploadTrigger({
  onFiles,
  accept,
  multiple,
  children = 'Choose file',
  className,
  variant = 'outline',
  size = 'sm',
  disabled,
  'data-testid': testId,
}: FileUploadTriggerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        data-testid={testId}
        aria-label={typeof children === 'string' ? children : 'File upload'}
        onChange={(e) => {
          if (e.target.files?.length) {
            onFiles(e.target.files)
            // Reset so the same file can be re-selected
            e.target.value = ''
          }
        }}
      />
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {children}
      </Button>
    </>
  )
}

// ─── FileUploadDropzone ───────────────────────────────────────────────────────
// Dashed-border drop zone that also opens the file picker on click.

export interface FileUploadDropzoneProps {
  onFiles: (files: FileList) => void
  accept?: string
  multiple?: boolean
  /** Description shown below the icon. */
  description?: string
  /** Sub-description / size limit hint. */
  hint?: string
  className?: string
  disabled?: boolean
}

export function FileUploadDropzone({
  onFiles,
  accept,
  multiple,
  description = 'Drop files here or click to browse',
  hint,
  className,
  disabled,
}: FileUploadDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files)
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={description}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors',
        dragging && 'border-primary bg-primary/5',
        disabled && 'cursor-not-allowed opacity-50',
        !disabled && 'hover:border-primary/60 hover:bg-secondary/30',
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        aria-hidden
        onChange={(e) => {
          if (e.target.files?.length) {
            onFiles(e.target.files)
            e.target.value = ''
          }
        }}
      />
      <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{description}</p>
      {hint && <p className="text-xs text-muted-foreground/60">{hint}</p>}
    </div>
  )
}
