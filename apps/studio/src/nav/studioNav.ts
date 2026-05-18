import type { NavItem } from '@seta/ui'
import {
  Activity,
  Bot,
  BrainCircuit,
  FileText,
  GaugeCircle,
  Hammer,
  ScrollText,
  Workflow,
} from 'lucide-react'

export function studioNav(): NavItem[] {
  return [
    { id: 'runs', label: 'Runs', icon: Activity, to: '/runs' },
    { id: 'corpus', label: 'Corpus', icon: FileText, to: '/corpus' },
    { id: 'audit', label: 'Audit', icon: ScrollText, to: '/audit' },
    { id: 'agents', label: 'Agents', icon: Bot, to: '/agents' },
    { id: 'workflows', label: 'Workflows', icon: Workflow, to: '/workflows' },
    { id: 'tools', label: 'Tools', icon: Hammer, to: '/tools' },
    { id: 'threads', label: 'Memory', icon: BrainCircuit, to: '/threads' },
    { id: 'metrics', label: 'Metrics', icon: GaugeCircle, to: '/metrics' },
  ]
}
