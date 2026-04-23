import { FileText } from '@future/ui/icons'

export default function TranscriptsPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <FileText className="h-10 w-10 text-muted-foreground/40" />
      <h2 className="text-label-lg font-510 text-foreground">Transcripts</h2>
      <p className="text-caption text-muted-foreground">Meeting transcripts will appear here.</p>
    </div>
  )
}
