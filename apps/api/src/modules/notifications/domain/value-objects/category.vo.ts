export const NOTIFICATION_CATEGORIES = ['approval', 'mention', 'assignment', 'system'] as const
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]
