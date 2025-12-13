"use client"

interface Tab {
  id: string
  label: string
  icon: any
}

interface TabsNavigationProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tabId: string) => void
}

export function TabsNavigation({ tabs, activeTab, onTabChange }: TabsNavigationProps) {
  return (
    <div className="flex items-center gap-1 mt-6 border-b border-gray-200 -mb-px">
      {tabs.map((tab) => {
        const IconComponent = tab.icon
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-[#2D51DA] text-[#2D51DA]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <IconComponent className="w-4 h-4" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}







