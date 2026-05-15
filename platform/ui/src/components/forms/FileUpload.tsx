import { Upload } from 'lucide-react'
import { type ChangeEvent, type DragEvent, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

interface Props {
  onFilesSelected: (files: File[]) => void
  onReject?: (file: File, reason: 'size' | 'type') => void
  accept?: string
  maxSizeMb?: number
  multiple?: boolean
}

export function FileUpload({
  onFilesSelected,
  onReject,
  accept,
  maxSizeMb,
  multiple = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const partition = (files: FileList | null): File[] => {
    if (!files) return []
    const ok: File[] = []
    for (const f of Array.from(files)) {
      if (maxSizeMb !== undefined && f.size > maxSizeMb * 1024 * 1024) {
        onReject?.(f, 'size')
        continue
      }
      ok.push(f)
    }
    return ok
  }

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const ok = partition(e.target.files)
    if (ok.length) onFilesSelected(ok)
    e.target.value = ''
  }

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragOver(false)
    const ok = partition(e.dataTransfer.files)
    if (ok.length) onFilesSelected(ok)
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        'flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center transition-colors',
        dragOver ? 'border-primary bg-primary-subtle' : 'border-hairline-strong bg-canvas-soft',
      )}
    >
      <Upload className="size-5 stroke-[1.5] text-ink-mute" />
      <span className="text-[14px] text-ink-mute">Drop files here or click to browse</span>
      <input
        ref={inputRef}
        type="file"
        aria-label="File upload"
        {...(accept !== undefined ? { accept } : {})}
        multiple={multiple}
        onChange={onChange}
        className="sr-only"
      />
    </label>
  )
}
