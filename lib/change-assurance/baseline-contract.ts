/**
 * Normalizer for the change-assurance blast-radius contract.
 *
 * The backend emits two dossier shapes and, during the additive migration, a
 * dual shape carrying both:
 *
 *   legacy   direct_dependency_count, periodic_dependencies: []
 *   new      dependency_incidences, periodic_dependencies_assessment: {state,items,detail}
 *   dual     both of the above
 *
 * Two rules drive everything here, and both exist because breaking them
 * fabricated evidence in the backend:
 *
 * 1. An empty compatibility array is NOT a finding of "none". It is a wire
 *    shape. Only an assessment can say a family was checked and found empty.
 *    Rendering `[]` as "none found" asserts a check that never ran.
 *
 * 2. The adjacency figure counts INCIDENCES, not distinct resources. A
 *    neighbour shared by three targets contributes three. Labelling it
 *    "adjacent resources" claims distinct-resource semantics the number does
 *    not have.
 *
 * Assessment state is authoritative wherever present; on a dual-shape
 * conflict, the assessment wins.
 */

/** Four-state contract, mirroring the backend's gate states. */
export type AssessmentState = 'PASSED' | 'FAILED' | 'UNKNOWN' | 'NOT_COMPUTED'

const ASSESSMENT_STATES: readonly AssessmentState[] = ['PASSED', 'FAILED', 'UNKNOWN', 'NOT_COMPUTED']

/** Semantics string the backend attaches to the incidence figure. */
export const INCIDENCE_SEMANTICS = 'ADJACENCY_INCIDENCES_MAY_DOUBLE_COUNT_SHARED_NEIGHBOURS'

/** Semantics string the LEGACY dossier attaches to its distinct-resource count. */
export const DISTINCT_SEMANTICS = 'DISTINCT_ADJACENT_GRAPH_RESOURCES_NOT_ALL_PROVEN_DEPENDENCIES'

export interface DependencyFamily {
  /** What we know. NOT_COMPUTED and UNKNOWN must never render as zero. */
  state: AssessmentState
  /** Items when computed; empty when not. Never a proof of absence on its own. */
  items: unknown[]
  /** Count when computed, null when not. Never coerce null to 0. */
  count: number | null
  /** Human-facing explanation from the backend, when supplied. */
  detail: string | null
  /** True when a real assessment drove this, false when inferred from a legacy array. */
  assessed: boolean
}

export interface AdjacencyFigure {
  /** The number, or null when the payload carried none. */
  value: number | null
  /** Whether the number counts incidences (may double-count) or distinct resources. */
  kind: 'INCIDENCES' | 'DISTINCT_RESOURCES' | 'UNKNOWN'
  /** Raw semantics string, when the payload supplied one. */
  semantics: string | null
  /** Short noun phrase safe to render beside the number. */
  label: string
}

export interface NormalizedBlastRadius {
  adjacency: AdjacencyFigure
  distinctAffectedResources: DependencyFamily
  periodicDependencies: DependencyFamily
  dataDependencies: DependencyFamily
  systems: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asState(value: unknown): AssessmentState | null {
  return typeof value === 'string' && (ASSESSMENT_STATES as readonly string[]).includes(value)
    ? (value as AssessmentState)
    : null
}

function asFiniteInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** An unrecognised payload yields UNKNOWN, never a confident zero. */
const UNKNOWN_FAMILY: DependencyFamily = {
  state: 'UNKNOWN',
  items: [],
  count: null,
  detail: null,
  assessed: false,
}

/**
 * Normalize one dependency family across legacy, new, dual and malformed input.
 *
 * `assessmentKey` wins over `legacyKey` whenever it is a well-formed
 * assessment — that is the dual-shape conflict rule.
 */
export function normalizeDependencyFamily(
  blast: unknown,
  legacyKey: string,
  assessmentKey: string,
): DependencyFamily {
  if (!isRecord(blast)) return { ...UNKNOWN_FAMILY }

  const assessment = blast[assessmentKey]
  if (isRecord(assessment)) {
    const state = asState(assessment.state)
    if (state) {
      const items = Array.isArray(assessment.items) ? assessment.items : []
      return {
        state,
        items,
        // A family that was not computed has NO count. Zero would assert it
        // was checked and found empty.
        count: state === 'NOT_COMPUTED' || state === 'UNKNOWN' ? null : items.length,
        detail: asString(assessment.detail),
        assessed: true,
      }
    }
    // Present but malformed: we cannot read it, so we do not guess.
    return { ...UNKNOWN_FAMILY }
  }

  const legacy = blast[legacyKey]
  if (Array.isArray(legacy)) {
    if (legacy.length > 0) {
      return { state: 'PASSED', items: legacy, count: legacy.length, detail: null, assessed: false }
    }
    // The critical case. An empty legacy array is a wire shape, not a result.
    // Without an assessment we do not know whether it was checked, so UNKNOWN.
    return { ...UNKNOWN_FAMILY }
  }

  if (isRecord(legacy)) {
    // A stateful object under the legacy name (a dossier persisted mid-migration).
    // NEVER take its key count as a length.
    const state = asState(legacy.state)
    if (state) {
      const items = Array.isArray(legacy.items) ? legacy.items : []
      return {
        state,
        items,
        count: state === 'NOT_COMPUTED' || state === 'UNKNOWN' ? null : items.length,
        detail: asString(legacy.detail),
        assessed: true,
      }
    }
  }

  return { ...UNKNOWN_FAMILY }
}

/**
 * Normalize the adjacency figure and, crucially, what it MEANS.
 *
 * `dependency_incidences` and the baseline `direct_dependency_count` alias
 * carry the same number with incidence semantics. The legacy dossier's
 * `direct_dependency_count` is a distinct-resource count. The semantics string
 * disambiguates them; without one we say UNKNOWN rather than pick.
 */
export function normalizeAdjacency(blast: unknown): AdjacencyFigure {
  if (!isRecord(blast)) {
    return { value: null, kind: 'UNKNOWN', semantics: null, label: 'graph-adjacent (unspecified)' }
  }
  const value =
    asFiniteInt(blast.dependency_incidences) ?? asFiniteInt(blast.direct_dependency_count)
  const semantics = asString(blast.direct_dependency_count_semantics)

  let kind: AdjacencyFigure['kind'] = 'UNKNOWN'
  if (semantics === INCIDENCE_SEMANTICS) kind = 'INCIDENCES'
  else if (semantics === DISTINCT_SEMANTICS) kind = 'DISTINCT_RESOURCES'
  else if (asFiniteInt(blast.dependency_incidences) !== null) kind = 'INCIDENCES'

  const label =
    kind === 'INCIDENCES'
      ? 'adjacency incidences'
      : kind === 'DISTINCT_RESOURCES'
        ? 'distinct adjacent resources'
        : 'graph-adjacent (unspecified)'

  return { value, kind, semantics, label }
}

/** Normalize a whole blast_radius payload of any supported shape. */
export function normalizeBlastRadius(blast: unknown): NormalizedBlastRadius {
  const record = isRecord(blast) ? blast : {}
  const distinct = record.distinct_affected_resources
  let distinctFamily: DependencyFamily = { ...UNKNOWN_FAMILY }
  if (isRecord(distinct)) {
    const state = asState(distinct.state)
    if (state) {
      const count = asFiniteInt(distinct.count)
      distinctFamily = {
        state,
        items: [],
        count: state === 'NOT_COMPUTED' ? null : count,
        detail: asString(distinct.detail),
        assessed: true,
      }
    }
  }
  return {
    adjacency: normalizeAdjacency(record),
    distinctAffectedResources: distinctFamily,
    periodicDependencies: normalizeDependencyFamily(
      record, 'periodic_dependencies', 'periodic_dependencies_assessment',
    ),
    dataDependencies: normalizeDependencyFamily(
      record, 'data_dependencies', 'data_dependencies_assessment',
    ),
    systems: Array.isArray(record.systems) ? record.systems.filter((s): s is string => typeof s === 'string') : [],
  }
}

/**
 * Findings carry the same pairing: a legacy `affected_resources` array beside
 * an `affected_resources_assessment`.
 */
export function normalizeAffectedResources(finding: unknown): DependencyFamily {
  return normalizeDependencyFamily(
    finding, 'affected_resources', 'affected_resources_assessment',
  )
}

/** Text for a family, never rendering an unproven family as a number. */
export function describeFamily(family: DependencyFamily, noun: string): string {
  if (family.state === 'NOT_COMPUTED') return `${noun}: Not computed`
  if (family.state === 'UNKNOWN' || family.count === null) return `${noun}: Unknown`
  return `${family.count} ${noun}`
}

/** Text for the adjacency figure, always carrying its semantics. */
export function describeAdjacency(adjacency: AdjacencyFigure): string {
  if (adjacency.value === null) return 'Adjacency: Unknown'
  return `${adjacency.value} ${adjacency.label}`
}
