/**
 * ListEnabledModulesQuery — returns the set of module keys whose
 * tenant_module_toggle row has enabled=true for the given tenant.
 *
 * Consumed by the live agent turn pipeline (Plan 18) to populate
 * RouteTurnOpts.enabledModules.
 */
export class ListEnabledModulesQuery {
  constructor(readonly tenantId: string) {}
}
