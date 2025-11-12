import Sidebar from '@/components/Sidebar'

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col group/design-root overflow-x-hidden">
      <div className="flex flex-row min-h-screen">
        <Sidebar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}

