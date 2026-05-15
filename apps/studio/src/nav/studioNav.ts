import type { NavItem } from '@seta/ui'
import {
  Activity,
  Bot,
  BrainCircuit,
  Building2,
  FileText,
  GaugeCircle,
  Hammer,
  PlugZap,
  ScrollText,
  Workflow,
} from 'lucide-react'

export function studioNav(tenantId: string | null): NavItem[] {
  if (!tenantId) {
    return [{ id: 'tenants', label: 'Tenants', icon: Building2, to: '/tenants' }]
  }
  const base = `/tenants/${tenantId}`
  return [
    { id: 'tenants', label: 'Tenants', icon: Building2, to: '/tenants' },
    { id: 'connectors', label: 'Connectors', icon: PlugZap, to: `${base}/connectors` },
    { id: 'runs', label: 'Runs', icon: Activity, to: `${base}/runs` },
    { id: 'corpus', label: 'Corpus', icon: FileText, to: `${base}/corpus` },
    { id: 'audit', label: 'Audit', icon: ScrollText, to: `${base}/audit` },
    { id: 'agents', label: 'Agents', icon: Bot, to: `${base}/agents` },
    { id: 'workflows', label: 'Workflows', icon: Workflow, to: `${base}/workflows` },
    { id: 'tools', label: 'Tools', icon: Hammer, to: `${base}/tools` },
    { id: 'threads', label: 'Memory', icon: BrainCircuit, to: `${base}/threads` },
    { id: 'metrics', label: 'Metrics', icon: GaugeCircle, to: `${base}/metrics` },
  ]
}
