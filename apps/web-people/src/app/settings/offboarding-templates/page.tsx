import { TemplateEditor } from '../../../components/settings/TemplateEditor'
export default function OffboardingTemplatesPage() {
  return (
    <div>
      <h2 className="text-lg font-510 text-fg-primary mb-4">Offboarding Templates</h2>
      <TemplateEditor type="offboarding" />
    </div>
  )
}
