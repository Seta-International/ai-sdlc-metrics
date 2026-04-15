export type NameDisplayOrder = 'family_first' | 'given_first'

export const NAME_DISPLAY_ORDER_VALUES: NameDisplayOrder[] = ['family_first', 'given_first']

export const FAMILY_FIRST_COUNTRIES = new Set(['VN', 'JP', 'KR', 'CN', 'TW', 'HK', 'MO', 'HU'])

export function defaultNameDisplayOrder(countryCode: string): NameDisplayOrder {
  return FAMILY_FIRST_COUNTRIES.has(countryCode) ? 'family_first' : 'given_first'
}

export function computeFullName(
  familyName: string,
  givenName: string,
  middleName: string | null,
  displayOrder: NameDisplayOrder,
): string {
  const middle = middleName ? ` ${middleName}` : ''
  return displayOrder === 'family_first'
    ? `${familyName}${middle} ${givenName}`
    : `${givenName}${middle} ${familyName}`
}

export function computeFullNameUnaccented(fullName: string): string {
  return fullName
    .normalize('NFC')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
}
