export const TEMPLATE_FORMATS = ['pdf', 'excel'] as const
export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number]
