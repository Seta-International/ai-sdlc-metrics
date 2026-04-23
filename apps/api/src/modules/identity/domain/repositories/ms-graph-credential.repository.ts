import type { MsGraphCredentialEntity } from '../entities/ms-graph-credential.entity'

export const MS_GRAPH_CREDENTIAL_REPOSITORY = Symbol('IMsGraphCredentialRepository')

export interface IMsGraphCredentialRepository {
  get(tenantId: string): Promise<MsGraphCredentialEntity | null>
  upsert(credential: MsGraphCredentialEntity): Promise<void>
  delete(tenantId: string): Promise<void>
}
