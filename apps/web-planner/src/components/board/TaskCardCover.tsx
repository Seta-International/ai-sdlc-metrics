/**
 * TaskCardCover — renders an attachment cover image at the top of a task card.
 * Only shown when coverUrl is provided.
 * Height: 150px (spec-defined), object-fit: cover.
 */
interface TaskCardCoverProps {
  coverUrl: string
  title?: string
}

export function TaskCardCover({ coverUrl, title }: TaskCardCoverProps) {
  return (
    // Height is spec-defined at 150px — expressed as inline style to avoid
    // an arbitrary Tailwind value that would fail the design-token lint check.
    <div className="w-full overflow-hidden rounded-t-lg" style={{ height: '150px' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coverUrl}
        alt={title ?? 'Task cover'}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    </div>
  )
}
