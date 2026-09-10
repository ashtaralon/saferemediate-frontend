import { describe, expect, it } from 'vitest'

import {
  DISTINCT_SEMANTICS,
  INCIDENCE_SEMANTICS,
  describeAdjacency,
  describeFamily,
  normalizeAdjacency,
  normalizeAffectedResources,
  normalizeBlastRadius,
  normalizeDependencyFamily,
} from '@/lib/change-assurance/baseline-contract'

/**
 * The backend migrated blast_radius additively, so three payload versions are
 * live at once. The rule that matters in every one of them: an empty
 * compatibility array is a wire shape, never a finding of "none".
 */
const LEGACY_ONLY = {
  direct_dependency_count: 7,
  direct_dependency_count_semantics: DISTINCT_SEMANTICS,
  systems: ['payments'],
  periodic_dependencies: [{ job: 'nightly' }, { job: 'weekly' }],
  data_dependencies: [],
}

const NEW_ONLY = {
  dependency_incidences: 3,
  direct_dependency_count_semantics: INCIDENCE_SEMANTICS,
  systems: ['payments'],
  distinct_affected_resources: { state: 'PASSED', count: 1, detail: 'Distinct neighbours.' },
  periodic_dependencies_assessment: { state: 'NOT_COMPUTED', items: [], detail: 'Not analysed in phase one.' },
  data_dependencies_assessment: { state: 'NOT_COMPUTED', items: [], detail: 'Not analysed in phase one.' },
}

const DUAL_SHAPE = {
  dependency_incidences: 3,
  direct_dependency_count: 3,
  direct_dependency_count_semantics: INCIDENCE_SEMANTICS,
  systems: ['payments'],
  distinct_affected_resources: { state: 'PASSED', count: 1, detail: 'Distinct neighbours.' },
  periodic_dependencies: [],
  data_dependencies: [],
  periodic_dependencies_assessment: { state: 'NOT_COMPUTED', items: [], detail: 'Not analysed in phase one.' },
  data_dependencies_assessment: { state: 'NOT_COMPUTED', items: [], detail: 'Not analysed in phase one.' },
}

describe('baseline blast-radius normalizer', () => {
  describe('legacy-only payloads', () => {
    it('keeps distinct-resource semantics and counts a populated array', () => {
      const blast = normalizeBlastRadius(LEGACY_ONLY)
      expect(blast.adjacency.value).toBe(7)
      expect(blast.adjacency.kind).toBe('DISTINCT_RESOURCES')
      expect(blast.periodicDependencies.state).toBe('PASSED')
      expect(blast.periodicDependencies.count).toBe(2)
    })

    it('treats an EMPTY legacy array as unknown, never as none-found', () => {
      const blast = normalizeBlastRadius(LEGACY_ONLY)
      expect(blast.dataDependencies.state).toBe('UNKNOWN')
      expect(blast.dataDependencies.count).toBeNull()
      expect(blast.dataDependencies.count).not.toBe(0)
    })
  })

  describe('new-only payloads', () => {
    it('reads the assessment and refuses to coerce NOT_COMPUTED to zero', () => {
      const blast = normalizeBlastRadius(NEW_ONLY)
      expect(blast.periodicDependencies.state).toBe('NOT_COMPUTED')
      expect(blast.periodicDependencies.count).toBeNull()
      expect(blast.periodicDependencies.assessed).toBe(true)
      expect(blast.periodicDependencies.detail).toBe('Not analysed in phase one.')
    })

    it('labels the adjacency figure as incidences, not distinct resources', () => {
      const blast = normalizeBlastRadius(NEW_ONLY)
      expect(blast.adjacency.value).toBe(3)
      expect(blast.adjacency.kind).toBe('INCIDENCES')
      expect(blast.adjacency.label).toBe('adjacency incidences')
      expect(describeAdjacency(blast.adjacency)).toBe('3 adjacency incidences')
      expect(describeAdjacency(blast.adjacency)).not.toContain('distinct')
    })

    it('reports distinct affected resources separately from incidences', () => {
      const blast = normalizeBlastRadius(NEW_ONLY)
      expect(blast.adjacency.value).toBe(3)
      expect(blast.distinctAffectedResources.count).toBe(1)
      expect(blast.adjacency.value).not.toBe(blast.distinctAffectedResources.count)
    })
  })

  describe('dual-shape payloads', () => {
    it('normalizes what the backend emits today', () => {
      const blast = normalizeBlastRadius(DUAL_SHAPE)
      expect(blast.adjacency.value).toBe(3)
      expect(blast.adjacency.kind).toBe('INCIDENCES')
      expect(blast.periodicDependencies.state).toBe('NOT_COMPUTED')
      expect(blast.periodicDependencies.count).toBeNull()
    })

    it('lets the assessment win over a disagreeing legacy array', () => {
      const conflicting = {
        ...DUAL_SHAPE,
        // Legacy array claims two; the assessment says it was never computed.
        periodic_dependencies: [{ job: 'stale' }, { job: 'also-stale' }],
        periodic_dependencies_assessment: { state: 'NOT_COMPUTED', items: [], detail: 'Not analysed.' },
      }
      const family = normalizeDependencyFamily(
        conflicting, 'periodic_dependencies', 'periodic_dependencies_assessment',
      )
      expect(family.state).toBe('NOT_COMPUTED')
      expect(family.count).toBeNull()
      expect(family.count).not.toBe(2)
    })

    it('lets a COMPUTED assessment win over an empty legacy array', () => {
      const conflicting = {
        periodic_dependencies: [],
        periodic_dependencies_assessment: { state: 'PASSED', items: [{ job: 'nightly' }], detail: 'One job.' },
      }
      const family = normalizeDependencyFamily(
        conflicting, 'periodic_dependencies', 'periodic_dependencies_assessment',
      )
      expect(family.state).toBe('PASSED')
      expect(family.count).toBe(1)
    })
  })

  describe('malformed input', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'not-an-object'],
      ['a number', 42],
      ['an array', [1, 2, 3]],
      ['an empty object', {}],
    ])('yields UNKNOWN rather than a confident zero for %s', (label, payload) => {
      expect(typeof label).toBe('string')
      const blast = normalizeBlastRadius(payload)
      expect(blast.periodicDependencies.state).toBe('UNKNOWN')
      expect(blast.periodicDependencies.count).toBeNull()
      expect(blast.adjacency.value).toBeNull()
      expect(blast.adjacency.kind).toBe('UNKNOWN')
    })

    it('never counts the KEYS of a stateful object left under the legacy name', () => {
      // A dossier persisted mid-migration. len()/`.length` here produced 3.
      const persisted = {
        dependency_incidences: 7,
        periodic_dependencies: { state: 'NOT_COMPUTED', items: [], detail: 'x' },
      }
      const family = normalizeDependencyFamily(
        persisted, 'periodic_dependencies', 'periodic_dependencies_assessment',
      )
      expect(family.state).toBe('NOT_COMPUTED')
      expect(family.count).toBeNull()
      expect(family.count).not.toBe(3)
    })

    it('rejects an assessment carrying an unrecognised state', () => {
      const family = normalizeDependencyFamily(
        { periodic_dependencies_assessment: { state: 'MAYBE', items: [1, 2] } },
        'periodic_dependencies', 'periodic_dependencies_assessment',
      )
      expect(family.state).toBe('UNKNOWN')
      expect(family.count).toBeNull()
    })

    it('ignores a non-numeric adjacency value', () => {
      expect(normalizeAdjacency({ dependency_incidences: 'seven' }).value).toBeNull()
      expect(normalizeAdjacency({ direct_dependency_count: null }).value).toBeNull()
    })
  })

  describe('finding-level affected resources', () => {
    it('prefers the assessment over the legacy array', () => {
      const family = normalizeAffectedResources({
        affected_resources: [],
        affected_resources_assessment: { state: 'NOT_COMPUTED', items: [], detail: 'Not computed in phase one.' },
      })
      expect(family.state).toBe('NOT_COMPUTED')
      expect(family.count).toBeNull()
    })

    it('still counts a populated legacy array from an older dossier', () => {
      const family = normalizeAffectedResources({
        affected_resources: [{ resource_id: 'sg-1' }, { resource_id: 'sg-2' }],
      })
      expect(family.state).toBe('PASSED')
      expect(family.count).toBe(2)
    })
  })

  describe('rendering helpers', () => {
    it('renders NOT_COMPUTED and UNKNOWN as words, never as a number', () => {
      expect(describeFamily({ state: 'NOT_COMPUTED', items: [], count: null, detail: null, assessed: true }, 'periodic dependencies'))
        .toBe('periodic dependencies: Not computed')
      expect(describeFamily({ state: 'UNKNOWN', items: [], count: null, detail: null, assessed: false }, 'data dependencies'))
        .toBe('data dependencies: Unknown')
      expect(describeFamily({ state: 'PASSED', items: [1], count: 1, detail: null, assessed: true }, 'periodic dependencies'))
        .toBe('1 periodic dependencies')
    })

    it('never renders a zero for an unproven family', () => {
      for (const state of ['NOT_COMPUTED', 'UNKNOWN'] as const) {
        const text = describeFamily({ state, items: [], count: null, detail: null, assessed: true }, 'periodic dependencies')
        expect(text).not.toMatch(/\b0\b/)
        expect(text).not.toMatch(/none/i)
      }
    })
  })
})
