'use client'

/**
 * Resource Inspector Sheet
 * ========================
 *
 * A slide-out panel wrapper for the unified ResourceInspector.
 * Automatically detects resource type and shows the correct template.
 */

import React from 'react'
import {
  Sheet,
  SheetContent,
} from '../ui/sheet'
import { ResourceInspector } from './ResourceInspector'

export interface ResourceInspectorSheetProps {
  /** Resource ID to inspect (e.g., sg-xxx, acl-xxx, arn:aws:iam::...) */
  resourceId: string | null
  /** Whether the sheet is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Observation window in days (default: 30) */
  windowDays?: number
  /** Optional callback when Apply Fix is clicked */
  onApplyFix?: (recommendations: any[]) => void
}

export function ResourceInspectorSheet({
  resourceId,
  open,
  onOpenChange,
  windowDays = 30,
  onApplyFix,
}: ResourceInspectorSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl overflow-y-auto p-0"
      >
        {resourceId ? (
          <ResourceInspector
            resourceId={resourceId}
            windowDays={windowDays}
            onClose={() => onOpenChange(false)}
            onApplyFix={onApplyFix}
          />
        ) : (
          <div className="text-center text-muted-foreground py-8">
            Select a resource to inspect
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
