/**
 * Settings > Accounts > Add > Choose from your organization: the organization listing role set up from Settings (Alon
 * 2026-10-05). Every answer is saferemediate-backend's own, captured from its real routes and connector
 * (fixtures/settings-c-producer 29-37, README); nothing here is hand-written. The picker renders them as fetch returns them.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { OrganizationAccountPicker } from "@/components/settings/organization-account-picker"
import { ORGANIZATION_DISCOVERY_TEMPLATE_PATH, checkDiscoveryRoleArn } from "@/lib/account-admin"
import notConfigured from "@/__tests__/fixtures/settings-c-producer/29_org_not_configured_setup.json"
import discoverWithRole from "@/__tests__/fixtures/settings-c-producer/30_org_discover_with_role.json"
import availableViaSettings from "@/__tests__/fixtures/settings-c-producer/31_org_available_via_settings_role.json"
import notUsable from "@/__tests__/fixtures/settings-c-producer/32_org_role_not_usable_from_settings.json"
import setByInstallation from "@/__tests__/fixtures/settings-c-producer/33_org_role_set_by_installation.json"
import otherOrganization from "@/__tests__/fixtures/settings-c-producer/34_org_role_other_organization.json"
import refusedNotThisInstall from "@/__tests__/fixtures/settings-c-producer/35_org_discover_refused_not_this_install.json"
import alreadyOpen from "@/__tests__/fixtures/settings-c-producer/37_org_discover_already_open_other_role.json"

type Capture = { status: number; body: unknown; request: { method: string; path: string; json?: Record<string, string> } }

const CUSTOMER = (notConfigured.body as { customer_id: string }).customer_id
const STATE = `/api/proxy/admin/accounts/organization?customer_id=${CUSTOMER}`
const DISCOVER = `/api/proxy/admin/accounts/organization/discover?customer_id=${CUSTOMER}`

function answer(capture: Capture): Response {
  return new Response(JSON.stringify(capture.body), { status: capture.status, headers: { "content-type": "application/json" } })
}

let fetchMock: ReturnType<typeof vi.fn>

function installFetch(handlers: { state: () => Capture; discover?: (body: unknown) => Capture }) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || "GET"
    if (url === STATE && method === "GET") return answer(handlers.state())
    if (url === DISCOVER && method === "POST" && handlers.discover) {
      return answer(handlers.discover(init?.body ? JSON.parse(String(init.body)) : undefined))
    }
    return new Response(JSON.stringify({ detail: `unexpected ${method} ${url}` }), { status: 404 })
  })
  vi.stubGlobal("fetch", fetchMock)
}

const posts = () => fetchMock.mock.calls.filter(([input, init]) => String(input) === DISCOVER && (init as RequestInit)?.method === "POST")

async function openPicker() {
  render(<OrganizationAccountPicker customerId={CUSTOMER} onChoose={vi.fn()} onEnterManually={vi.fn()} />)
  return screen.findByTestId("organization-picker")
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("the organization listing role, set up from Settings", () => {
  it("not configured: shows the backend's template and values, asks for the role ARN, and lists once it is verified", async () => {
    let state: Capture = notConfigured
    installFetch({
      state: () => state,
      discover: () => {
        state = availableViaSettings
        return discoverWithRole
      },
    })
    const picker = await openPicker()
    const setup = await within(picker).findByTestId("organization-setup")
    const sent = (notConfigured.body as { setup: { parameters: Record<string, string>; role: { name: string } } }).setup
    for (const [name, value] of Object.entries(sent.parameters)) {
      expect(within(setup).getByTestId("organization-setup-parameters")).toHaveTextContent(`${name}${value}`)
      expect(within(setup).getByRole("button", { name: `Copy ${name}` })).toBeInTheDocument()
    }
    expect(within(setup).getByRole("link", { name: /Download template/ })).toHaveAttribute("href", ORGANIZATION_DISCOVERY_TEMPLATE_PATH)
    expect(within(picker).getByTestId("organization-dependency")).toHaveTextContent(
      "Listing it needs a read-only role in your AWS organization: set it up below.")
    // Listing again without a role answers the same: it is not offered (the dead button Alon found).
    expect(within(picker).queryByRole("button", { name: "List accounts again" })).toBeNull()

    const verify = within(setup).getByRole("button", { name: "Verify and list accounts" })
    expect(verify).toBeDisabled()
    const input = within(setup).getByRole("textbox", { name: /Organization listing role ARN/ })
    fireEvent.change(input, { target: { value: `arn:aws:iam::123456789012:role/CyntroRead-${CUSTOMER}` } })
    expect(within(setup).getByTestId("organization-role-arn-check")).toHaveTextContent(
      `This is role CyntroRead-${CUSTOMER}, not this installation's organization listing role ${sent.role.name}.`)
    expect(verify).toBeDisabled()

    const role = discoverWithRole.request.json.role_arn
    fireEvent.change(input, { target: { value: `  ${role}  ` } })
    expect(within(setup).getByTestId("organization-role-arn-check")).toHaveTextContent(`Role in account ${role.split(":")[4]}.`)
    fireEvent.click(verify)
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(JSON.parse(String((posts()[0][1] as RequestInit).body))).toEqual(discoverWithRole.request.json)

    const listed = (availableViaSettings.body as { accounts: { account_id: string; selectable: boolean }[] }).accounts
    for (const account of listed) await within(picker).findByTestId(`organization-account-${account.account_id}`)
    expect(within(picker).getByTestId("organization-source")).toHaveTextContent(role)
    expect(within(picker).queryByTestId("organization-setup")).toBeNull()
  })

  it("the same ARN the backend refused is refused here first, by the backend's own rule, and nothing is sent", async () => {
    installFetch({ state: () => notConfigured, discover: () => refusedNotThisInstall })
    const setup = await within(await openPicker()).findByTestId("organization-setup")
    const refused = refusedNotThisInstall.request.json.role_arn
    const name = (notConfigured.body as { setup: { role: { name: string } } }).setup.role.name
    expect(checkDiscoveryRoleArn(refused, name).state).toBe("INVALID")
    fireEvent.change(within(setup).getByRole("textbox", { name: /Organization listing role ARN/ }), { target: { value: refused } })
    expect(within(setup).getByRole("button", { name: "Verify and list accounts" })).toBeDisabled()
    expect(posts()).toHaveLength(0)
  })

  it("a role that could not be used shows the setup again, and listing again stays offered", async () => {
    installFetch({ state: () => notUsable })
    const picker = await openPicker()
    await within(picker).findByText("Cyntro could not use the organization discovery role. It may not be deployed yet, or may not trust this installation.")
    expect(within(picker).getByTestId("organization-setup")).toBeInTheDocument()
    expect(within(picker).getByRole("textbox", { name: /Organization listing role ARN/ })).toBeInTheDocument()
    expect(within(picker).getByTestId("organization-dependency")).toHaveTextContent(
      "Check that the role's stack was created with the values below, then verify its ARN again.")
    expect(within(picker).getByRole("button", { name: "List accounts again" })).toBeInTheDocument()
  })

  it("when the installer names the role, Settings says so and asks for no ARN", async () => {
    installFetch({ state: () => setByInstallation })
    const picker = await openPicker()
    const setup = await within(picker).findByTestId("organization-setup")
    const installerRole = (setByInstallation.body as { source: { role_arn: string } }).source.role_arn
    expect(setup).toHaveTextContent("This installation's installer names the organization listing role")
    expect(setup).toHaveTextContent(`Cyntro uses ${installerRole}. A role pasted here would not be used.`)
    expect(within(setup).queryByRole("textbox")).toBeNull()
    expect(within(setup).queryByRole("button", { name: "Verify and list accounts" })).toBeNull()
  })

  it("a role outside this installation's organization is named, with no setup and no rows", async () => {
    installFetch({ state: () => otherOrganization })
    const picker = await openPicker()
    await within(picker).findByText(/answers for a different AWS Organization than this installation's/)
    expect(within(picker).queryByTestId("organization-setup")).toBeNull()
    expect(within(picker).getByTestId("organization-source")).toHaveTextContent(
      (otherOrganization.body as { source: { role_arn: string } }).source.role_arn)
    expect(within(picker).queryAllByTestId(/^organization-account-/)).toHaveLength(0)
  })

  it("a listing already running with another role is said, not taken for this one", async () => {
    installFetch({ state: () => notConfigured, discover: () => alreadyOpen })
    const picker = await openPicker()
    const setup = await within(picker).findByTestId("organization-setup")
    const pasted = alreadyOpen.request.json.role_arn
    const running = (alreadyOpen.body as { role_arn: string }).role_arn
    fireEvent.change(within(setup).getByRole("textbox", { name: /Organization listing role ARN/ }), { target: { value: pasted } })
    fireEvent.click(within(setup).getByRole("button", { name: "Verify and list accounts" }))
    const alert = await within(picker).findByRole("alert")
    expect(alert).toHaveTextContent("A listing that was already running continues without this role.")
    expect(alert).toHaveTextContent(`It runs with ${running}. When it finishes, verify this role again.`)
  })
})
