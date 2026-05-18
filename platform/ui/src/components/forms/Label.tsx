import { forwardRef, type LabelHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>

export const Label = forwardRef<HTMLLabelElement, LabelProps>(({ className, ...rest }, ref) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor/children supplied by consumers
  <label ref={ref} className={cn('text-[13px] font-medium text-ink', className)} {...rest} />
))
Label.displayName = 'Label'
