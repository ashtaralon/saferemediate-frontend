# 🔍 בדיקת זרימת הנתונים

## 1. Initial State:
- gapAnalysis: { allowed: 0, actual: 0, gap: 0, gapPercent: 0, confidence: 0 }
- severityCounts: { critical: 0, high: 0, medium: 0, passing: 0 }
- unusedActionsList: []

## 2. fetchAllData() נקרא ב-useEffect
- setLoadingGap(true)
- setLoadingAutoTag(true)  
- setLoadingFindings(true)
- Promise.all([fetchGapAnalysis(), fetchAutoTagStatus(), fetchSecurityFindings()])

## 3. fetchGapAnalysis() מבצע:
- fetch(`${backendUrl}/api/traffic/gap/CYNTRO-Lambda-Remediation-Role`)
- מחזיר: { allowed_actions: 28, used_actions: 0, unused_actions: 28, ... }
- setGapAnalysis({ allowed: 28, actual: 0, gap: 28, ... })
- setUnusedActionsList([...28 permissions...])
- setSeverityCounts({ high: 28, ... })

## 4. הקומפוננטות מקבלות:
- StatsRow: healthScore={healthScore}, severityCounts={severityCounts}
  - healthScore = Math.max(0, 100 - gapAnalysis.gap * 2) = 100 - 28*2 = 44
- GapAnalysisCard: gapAnalysis={gapAnalysis}, loading={loadingGap}

## 5. הבעיה הפוטנציאלית:
אם loadingGap נשאר true או שהנתונים לא מתעדכנים - הקומפוננטות יראו 0 או loading

