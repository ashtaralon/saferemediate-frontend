/**
 * Inspector Components Module
 *
 * Provides resource-specific inspector components with a consistent 3-section structure:
 * 1. Current State (configured)
 * 2. Observed (evidence from logs)
 * 3. Remove (recommendations)
 */

// Legacy SG-specific components (still available for backwards compatibility)
export { SGInspectorTemplate, type SGInspectorTemplateProps } from './SGInspectorTemplate'
export { SGInspectorSheet, type SGInspectorSheetProps } from './SGInspectorSheet'
export { SGInspectorV2, type SGInspectorV2Props } from './SGInspectorV2'

// Unified Resource Inspector (recommended for new code)
// Automatically detects resource type and shows the correct template
export { ResourceInspector, type ResourceInspectorProps } from './ResourceInspector'
export { ResourceInspectorSheet, type ResourceInspectorSheetProps } from './ResourceInspectorSheet'
