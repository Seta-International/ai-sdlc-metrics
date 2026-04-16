import { TemplateEditor } from '../../../components/settings/template-editor'
export default function OffboardingTemplatesPage() {
  return (
    <div>
      <h2 className="text-lg font-510 text-[#f7f8f8] mb-4">Offboarding Templates</h2>
      <TemplateEditor type="offboarding" />
    </div>
  )
}
