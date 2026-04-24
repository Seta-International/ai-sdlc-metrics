export class GetLoginOptionsQuery {
  constructor(
    /** Tenant slug (e.g. "seta") — mutually exclusive with emailDomain */
    public readonly slug: string | null,
    /** Email domain (e.g. "seta-international.vn") — mutually exclusive with slug */
    public readonly emailDomain: string | null,
  ) {}
}
