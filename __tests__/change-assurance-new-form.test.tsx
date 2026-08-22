import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/account-scope-context', () => ({
  useAccountScope: () => ({
    customerId: 'testbed-webshop',
    groupId: 'all',
    accountId: '416651950952',
    region: 'eu-west-1',
  }),
}))

import AnalyzeChangePage from '@/app/change-queue/new/page'

describe('analyze change form selectors', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/change-queue/new?system_name=testbed-webshop')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.pushState({}, '', '/')
  })

  it('hides the business-system input when scoped from a system page and loads typed targets', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/change-assurance/capabilities')) {
        return new Response(JSON.stringify({
          capabilities: [{
            capability_id: 'iam.permission_narrowing',
            display_name: 'IAM permission narrowing',
            family: 'Identity least privilege',
            resource_types: ['IAMRole'],
            actions: ['PERMISSION_REMOVAL'],
            required_parameters: ['permissions'],
            required_parameters_by_action: { PERMISSION_REMOVAL: ['permissions'] },
            required_evidence: [],
            execution: { available: true, from_intent_available: false, workflow: 'x' },
          }],
        }), { status: 200 })
      }
      if (url.includes('/change-assurance/targets?') && url.includes('discover_types=true')) {
        return new Response(JSON.stringify({
          resource_types: ['IAMRole', 'Lambda'],
          targets: [],
          count: 0,
        }), { status: 200 })
      }
      if (url.includes('/change-assurance/targets?')) {
        return new Response(JSON.stringify({
          resource_types: ['IAMRole'],
          targets: [{
            resource_type: 'IAMRole',
            resource_id: 'arn:aws:iam::416651950952:role/web',
            display_name: 'web',
            account_id: '416651950952',
            arn: 'arn:aws:iam::416651950952:role/web',
            resource_uid: '',
            system_name: 'testbed-webshop',
            selector_value: 'arn:aws:iam::416651950952:role/web',
          }],
          count: 1,
        }), { status: 200 })
      }
      if (url.includes('/api/proxy/systems')) {
        throw new Error('systems list must not be fetched when system is locked')
      }
      return new Response(JSON.stringify({}), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AnalyzeChangePage />)

    expect(await screen.findByTestId('system-context-chip')).toHaveTextContent('System · testbed-webshop')
    expect(screen.queryByLabelText(/Business system/i)).not.toBeInTheDocument()

    await waitFor(() => {
      const targetCalls = fetchMock.mock.calls
        .map(([url]) => String(url))
        .filter(url => url.includes('/change-assurance/targets?'))
      expect(targetCalls.some(url => url.includes('system_name=testbed-webshop'))).toBe(true)
      expect(targetCalls.every(url => !url.includes('/api/proxy/systems'))).toBe(true)
    })
  })

  it('scopes the dashboard systems list to the active customer/account/region', async () => {
    window.history.pushState({}, '', '/change-queue/new')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/change-assurance/capabilities')) {
        return new Response(JSON.stringify({ capabilities: [] }), { status: 200 })
      }
      if (url.includes('/api/proxy/systems')) {
        return new Response(JSON.stringify({
          systems: [{ system_name: 'payments' }, { system_name: 'billing' }],
        }), { status: 200 })
      }
      if (url.includes('/change-assurance/targets')) {
        return new Response(JSON.stringify({ resource_types: [], targets: [], count: 0 }), { status: 200 })
      }
      return new Response(JSON.stringify({}), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AnalyzeChangePage />)

    await waitFor(() => {
      const systemsUrl = fetchMock.mock.calls.map(([url]) => String(url)).find(url => url.includes('/api/proxy/systems'))
      expect(systemsUrl).toContain('customer_id=testbed-webshop')
      expect(systemsUrl).toContain('account_id=416651950952')
      expect(systemsUrl).toContain('region=eu-west-1')
    })
    expect(await screen.findByLabelText(/Business system/i)).toBeInTheDocument()
  })
})
