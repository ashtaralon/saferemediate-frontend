# Systems Overview Dashboard - Data Sources Explained

This document explains where each number on the Systems Overview dashboard comes from.

## Dashboard Numbers Breakdown

### 1. **"2 systems monitored"** (Top Header)
- **Source**: Count of systems returned from `/api/proxy/systems`
- **Backend Endpoint**: `/api/systems` (in `cyntro-backend/api/systems.py`)
- **Data Source**: Neo4j database - queries all `Resource` nodes with `systemName` or `SystemName` tags
- **Code Location**: `cyntro-frontend/components/systems-view.tsx:474`
  ```typescript
  const totalSystems = localSystems.length
  ```

### 2. **"17 permissions at 99% confidence"** (Alert Banner)
- **Source**: Permission Gap Analysis - unused permissions count
- **Frontend Fetch**: `/api/proxy/gap-analysis?systemName=alon-prod`
- **Backend Endpoint**: `/api/iam-roles/{role_name}/gap-analysis?days=90`
- **Data Source**: 
  - **Allowed permissions**: Extracted from IAM role policies (attached + inline policies)
  - **Used permissions**: Analyzed from CloudTrail events (last 90 days)
  - **Unused permissions**: `allowed_count - used_count`
- **Code Location**: 
  - Frontend: `cyntro-frontend/components/systems-view.tsx:76-109` (fetchGapAnalysisFromFindings)
  - Frontend: `cyntro-frontend/components/systems-view.tsx:596` (displays `gapData.unused`)
  - Backend: `cyntro-backend/main.py:784-875` (IAM analysis endpoint)

### 3. **"2" Total Systems** (Summary Card)
- **Source**: Same as #1 - count of `localSystems` array
- **Code Location**: `cyntro-frontend/components/systems-view.tsx:804`

### 4. **"0" Mission Critical at Risk** (Summary Card)
- **Source**: Count of systems with `criticality >= 5` AND `critical > 0`
- **Calculation**: Filters systems that are mission critical AND have critical issues
- **Code Location**: `cyntro-frontend/components/systems-view.tsx:475`
  ```typescript
  const missionCriticalAtRisk = localSystems.filter((s) => s.criticality >= 5 && s.critical > 0).length
  ```

### 5. **"0" Total Critical Issues** (Summary Card)
- **Source**: Sum of `critical` field from all systems
- **Backend Data**: From Neo4j `SecurityFinding` nodes with `severity = 'CRITICAL'`
- **Code Location**: 
  - Frontend: `cyntro-frontend/components/systems-view.tsx:476`
  - Backend: `cyntro-backend/api/systems.py:47-120` (get_findings_counts_for_system)

### 6. **"17" Permission Gap** (Summary Card)
- **Source**: Same as #2 - `gapData.unused` (unused permissions count)
- **Sub-label "0 allowed, 0 used"**: Shows `gapData.allowed` and `gapData.used`
- **Code Location**: `cyntro-frontend/components/systems-view.tsx:832-836`

### 7. **"0/100" Avg Health Score** (Summary Card)
- **Source**: Average of all systems' `health` scores
- **Calculation**: 
  ```typescript
  Math.round(localSystems.reduce((sum, s) => sum + (s.health || 0), 0) / localSystems.length)
  ```
- **Backend Calculation**: `cyntro-backend/api/systems.py:30-44`
  - Formula: `100 - min((critical * 10) + (high * 5) + (medium * 2) + (low * 1), 100)`
  - Lower score = more issues
- **Code Location**: `cyntro-frontend/components/systems-view.tsx:477-480`

## System Table Row Data

### For each system row (e.g., "alon-prod"):

1. **System Name**: From AWS `SystemName` tag (Neo4j `Resource.systemName`)
2. **Business Criticality**: 
   - Determined by frontend logic: `systemName.includes("payment") || systemName.includes("alon") || isProd` → 5 (MISSION CRITICAL)
   - Code: `cyntro-frontend/components/systems-view.tsx:146-148`
3. **Environment**: From AWS `Environment` tag, or inferred from system name
4. **Health Score**: Calculated from findings (see #7 above)
5. **Critical/High/Total Findings**: From Neo4j `SecurityFinding` nodes
6. **Last Scan**: From system's `lastScan` timestamp
7. **Owner**: From AWS `Owner` tag

## Data Flow Diagram

```
┌─────────────────┐
│   Neo4j DB      │
│  - Resources    │
│  - Findings     │
│  - IAM Roles    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Backend API    │
│  /api/systems   │
│  /api/iam-roles │
│  /gap-analysis  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Frontend Proxy │
│  /api/proxy/*   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  React Component│
│  systems-view.tsx│
└─────────────────┘
```

## Key Backend Endpoints

1. **`GET /api/systems`** - Returns all systems with metrics
   - File: `cyntro-backend/api/systems.py`
   - Queries Neo4j for systems, findings, resource counts

2. **`GET /api/iam-roles/{role_name}/gap-analysis?days=90`** - Permission gap analysis
   - File: `cyntro-backend/main.py:784-875`
   - Analyzes IAM policies vs CloudTrail usage

3. **`GET /api/proxy/gap-analysis?systemName=alon-prod`** - Frontend proxy
   - File: `cyntro-frontend/app/api/proxy/gap-analysis/route.ts`
   - Maps system names to IAM role names and calls backend

## Notes

- **Permission Gap (17)**: This is the count of unused IAM permissions across all roles in the system
- **"0 allowed, 0 used"**: This appears when the gap analysis API fails or times out - the frontend shows 0 as fallback
- **Health Score (0/100)**: Currently showing 0 because either:
  - No findings exist in Neo4j, OR
  - The calculation returns 0 when there are no issues (which seems backwards - should be 100 when no issues)
- **Criticality**: Currently hardcoded in frontend based on system name patterns, not from AWS tags

## Potential Issues

1. **Permission Gap shows "0 allowed, 0 used"** but card shows "17":
   - The `gapData.unused` is fetched separately and may be from a different source/cache
   - The sub-label shows stale/empty data while the main number is correct

2. **Health Score showing 0/100**:
   - Should be 100 when no issues, but calculation might be inverted
   - Check `cyntro-backend/api/systems.py:30-44` for calculation logic

3. **Criticality not from AWS tags**:
   - Currently inferred from system name in frontend
   - Should use AWS `Criticality` tag if available

