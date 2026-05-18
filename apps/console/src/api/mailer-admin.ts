export type MailerDetail = {
  tenantId: string
  provider: 'graph'
  config: { mailbox_user_id: string; from_address: string }
  enabled: boolean
}

export type MailerUpsertInput = {
  provider: 'graph'
  config: { mailbox_user_id: string; from_address: string }
  enabled: boolean
}

export interface Opts {
  fetch?: typeof fetch
  basePath?: string
}

async function req<T>(url: string, init: RequestInit, opts: Opts): Promise<T> {
  const fetchImpl = opts.fetch ?? fetch
  const res = await fetchImpl(`${opts.basePath ?? ''}${url}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url} failed: ${res.status}`)
  return (await res.json()) as T
}

export const getMailerConfig = (tenantId: string, opts: Opts = {}) =>
  req<MailerDetail>(`/admin/mailer/tenants/${tenantId}`, { method: 'GET' }, opts)

export const upsertMailerConfig = (tenantId: string, body: MailerUpsertInput, opts: Opts = {}) =>
  req<MailerDetail>(
    `/admin/mailer/tenants/${tenantId}`,
    { method: 'PUT', body: JSON.stringify(body) },
    opts,
  )

export const deleteMailerConfig = (tenantId: string, opts: Opts = {}) =>
  req<{ ok: true }>(`/admin/mailer/tenants/${tenantId}`, { method: 'DELETE' }, opts)
