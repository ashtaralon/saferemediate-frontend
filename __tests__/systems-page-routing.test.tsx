import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/components/systems-view", () => ({
  SystemsView: ({ onSystemSelect }: { onSystemSelect?: (name: string) => void }) => (
    <button onClick={() => onSystemSelect?.("alon prod")}>View alon prod</button>
  ),
}))

vi.mock("@/components/system-detail-dashboard", () => ({
  SystemDetailDashboard: () => <div>dashboard</div>,
}))

import SystemsPage from "@/app/systems/page"

describe("Systems page routing", () => {
  beforeEach(() => push.mockClear())

  it("opens the selected system dashboard with an encoded system name", () => {
    render(<SystemsPage />)
    fireEvent.click(screen.getByRole("button", { name: "View alon prod" }))
    expect(push).toHaveBeenCalledWith("/systems?systemName=alon%20prod")
  })
})
