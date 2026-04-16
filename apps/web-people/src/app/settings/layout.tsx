import { SettingsSidebar } from '../../components/settings/settings-sidebar'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-510 tracking-[-0.288px] text-[#f7f8f8]">Settings</h1>
        <p className="mt-1 text-sm text-[#8a8f98]">
          Configure the people module for your organization.
        </p>
      </div>
      <div className="flex gap-8">
        <SettingsSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </main>
  )
}
