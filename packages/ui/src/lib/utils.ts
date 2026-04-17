import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind-merge doesn't know about our custom font-size utilities (text-caption,
// text-label, etc.) and misclassifies them as text-color classes, causing them
// to be stripped when combined with a text-color class like text-muted-foreground.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        'text-display-xl',
        'text-display-lg',
        'text-display',
        'text-h1',
        'text-h2',
        'text-h3',
        'text-body-lg',
        'text-body-em',
        'text-small',
        'text-caption-lg',
        'text-caption',
        'text-label',
        'text-micro',
        'text-tiny',
        'text-mono',
        'text-mono-caption',
        'text-mono-label',
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
