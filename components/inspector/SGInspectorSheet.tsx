'use client'

/**
 * Security Group Inspector Sheet
 * ==============================
 *
 * A slide-out panel wrapper for the SG Inspector.
 * Uses SGInspectorV2 which shows REAL data only - no mocks.
 */

import React from 'react'
import {
  Sheet,
  SheetContent,
} from '../ui/sheet'
import { SGInspectorV2 } from './SGInspectorV2'

export interface SGInspectorSheetProps {
  /** Security Group ID to inspect */
  sgId: string | null
  /** Whether the sheet is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Observation window in days (default: 30) */
  windowDays?: number
  /** Optional callback when Apply Fix is clicked */
  onApplyFix?: (recommendations: any[]) => void
}

export function SGInspectorSheet({
  sgId,
  open,
  onOpenChange,
  windowDays = 30,
  onApplyFix,
}: SGInspectorSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl overflow-y-auto p-0"
      >
        {sgId ? (
          <SGInspectorV2
            sgId={sgId}
            windowDays={windowDays}
            onClose={() => onOpenChange(false)}
            onApplyFix={onApplyFix}
          />
        ) : (
          <div className="text-center text-muted-foreground py-8">
            Select a security group to inspect
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
