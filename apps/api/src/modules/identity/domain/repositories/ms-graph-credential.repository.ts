import type { MsGraphCredentialEntity } from '../entities/ms-graph-credential.entity'

export const MS_GRAPH_CREDENTIAL_REPOSITORY = Symbol('IMsGraphCredentialRepository')

export interface IMsGraphCredentialRepository {
  get(tenantId: string): Promise<MsGraphCredentialEntity | null>
  insertIfAbsent(credential: MsGraphCredentialEntity): Promise<boolean>
  updateIfSecretRef(
    credential: MsGraphCredentialEntity,
    expectedClientSecretRef: string,
  ): Promise<boolean>
  deleteIfSecretRef(tenantId: string, expectedClientSecretRef: string): Promise<boolean>
}
