import { summarizeObservedVpcTraffic } from '@/components/dependency-map/traffic-flow-map'

describe('observed VPC traffic totals', () => {
  it('counts real ACTUAL_TRAFFIC evidence even when an endpoint has no canvas card', () => {
    expect(
      summarizeObservedVpcTraffic([
        {
          type: 'ACTUAL_TRAFFIC',
          source: 'nat-1',
          target: '203.0.113.10',
          traffic_bytes: 25_156,
          hit_count: 331,
          is_observed: true,
        },
        { type: 'HAS_POLICY', traffic_bytes: 999, hit_count: 99 },
      ]),
    ).toEqual({ bytes: 25_156, connections: 331 })
  })

  it('does not count an explicitly unobserved traffic edge', () => {
    expect(
      summarizeObservedVpcTraffic([
        {
          type: 'ACTUAL_TRAFFIC',
          traffic_bytes: 100,
          hit_count: 2,
          is_observed: false,
        },
      ]),
    ).toEqual({ bytes: 0, connections: 0 })
  })
})
