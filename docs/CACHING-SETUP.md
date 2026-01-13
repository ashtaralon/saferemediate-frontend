# Caching Setup for Fast Page Loads

## Problem
Every hard refresh was loading systems from the backend, causing slow page loads (5-30+ seconds).

## Solution: Two-Layer Caching

### Layer 1: Frontend (localStorage) - IMPLEMENTED
The frontend now uses **stale-while-revalidate** pattern:
- On page load, cached data is shown **immediately** (no loading spinner)
- Fresh data is fetched in the background
- UI updates when fresh data arrives

Files changed:
- `components/systems-view.tsx` - Systems list caching
- `app/page.tsx` - Infrastructure/findings caching

Cache keys used:
- `impactiq-systems` - Systems list
- `impactiq-infrastructure-cache` - Infrastructure data
- `impactiq-findings-cache` - Security findings
- `impactiq-gap-cache` - Gap analysis data

### Layer 2: Backend (Render /data disk) - OPTIONAL
For even faster responses, add disk-based caching to your backend:

1. Copy `docs/backend-disk-cache.py` to your backend
2. Add the decorator to slow endpoints:

```python
from disk_cache import disk_cache

@app.get("/api/systems")
@disk_cache("systems", ttl=300)  # Cache for 5 minutes
async def get_systems():
    return await fetch_from_aws()  # Only runs every 5 min
```

3. Or use cache directly:

```python
from disk_cache import systems_cache

@app.get("/api/systems")
async def get_systems(force: bool = False):
    if not force:
        cached = systems_cache.get("all")
        if cached:
            return {"systems": cached, "cached": True}

    systems = await fetch_from_aws()
    systems_cache.set("all", systems, ttl=300)
    return {"systems": systems, "cached": False}
```

### Render Disk Configuration
Your disk is already configured:
- Mount path: `/data`
- Size: 1 GB
- Used for: `/data/cache/systems/*.json`, `/data/cache/findings/*.json`, etc.

## Testing
1. Load the page (first time will fetch from backend)
2. Hard refresh (Cmd+Shift+R) - should load instantly from cache
3. Check console for `[page] Loaded from cache (instant)` messages

## Cache Invalidation
- Frontend: Caches update automatically on background refresh
- Backend: Use `@disk_cache` TTL or call `cache.delete(key)` explicitly
