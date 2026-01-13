"""
Backend Disk Cache for Render /data Mount

Add this to your SafeRemediate backend to cache frequently accessed data
on the persistent /data disk. This eliminates slow API calls on every request.

Mount path: /data (configured in Render dashboard)

Usage:
1. Copy this file to your backend
2. Import and use disk_cache decorator on slow endpoints
3. Or use DiskCache class directly

Example:
    from disk_cache import disk_cache, DiskCache

    @disk_cache("systems", ttl=300)  # Cache for 5 minutes
    def get_systems():
        return fetch_from_aws()  # Slow call
"""

import json
import os
import time
import hashlib
from functools import wraps
from typing import Any, Optional, Callable
from pathlib import Path

# Render persistent disk mount path
CACHE_DIR = Path(os.environ.get("CACHE_DIR", "/data/cache"))

# Ensure cache directory exists
CACHE_DIR.mkdir(parents=True, exist_ok=True)


class DiskCache:
    """
    File-based cache using Render's persistent disk storage.

    Benefits:
    - Survives deployments (persistent disk)
    - Shared across all instances
    - Fast read/write (SSD-backed)
    - No external dependencies (no Redis needed)
    """

    def __init__(self, namespace: str = "default"):
        self.namespace = namespace
        self.cache_path = CACHE_DIR / namespace
        self.cache_path.mkdir(parents=True, exist_ok=True)

    def _get_file_path(self, key: str) -> Path:
        """Get cache file path for a key."""
        # Hash long keys to avoid filesystem issues
        if len(key) > 100:
            key = hashlib.md5(key.encode()).hexdigest()
        return self.cache_path / f"{key}.json"

    def get(self, key: str, default: Any = None) -> Any:
        """
        Get cached value. Returns default if not found or expired.
        """
        file_path = self._get_file_path(key)

        if not file_path.exists():
            return default

        try:
            with open(file_path, "r") as f:
                data = json.load(f)

            # Check expiration
            if data.get("expires_at") and data["expires_at"] < time.time():
                file_path.unlink()  # Delete expired cache
                return default

            return data.get("value", default)
        except (json.JSONDecodeError, IOError) as e:
            print(f"[DiskCache] Error reading {key}: {e}")
            return default

    def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        """
        Cache a value with TTL (time-to-live in seconds).
        Default TTL: 5 minutes
        """
        file_path = self._get_file_path(key)

        try:
            data = {
                "value": value,
                "created_at": time.time(),
                "expires_at": time.time() + ttl if ttl > 0 else None,
                "ttl": ttl
            }

            with open(file_path, "w") as f:
                json.dump(data, f)

            return True
        except (IOError, TypeError) as e:
            print(f"[DiskCache] Error writing {key}: {e}")
            return False

    def delete(self, key: str) -> bool:
        """Delete a cached value."""
        file_path = self._get_file_path(key)

        if file_path.exists():
            file_path.unlink()
            return True
        return False

    def clear(self) -> int:
        """Clear all cached values in this namespace. Returns count deleted."""
        count = 0
        for file_path in self.cache_path.glob("*.json"):
            file_path.unlink()
            count += 1
        return count

    def get_stats(self) -> dict:
        """Get cache statistics."""
        files = list(self.cache_path.glob("*.json"))
        total_size = sum(f.stat().st_size for f in files)

        return {
            "namespace": self.namespace,
            "entries": len(files),
            "size_bytes": total_size,
            "size_mb": round(total_size / (1024 * 1024), 2),
            "path": str(self.cache_path)
        }


# Global cache instances for common use cases
systems_cache = DiskCache("systems")
findings_cache = DiskCache("findings")
gap_cache = DiskCache("gap-analysis")
graph_cache = DiskCache("graph")


def disk_cache(namespace: str, ttl: int = 300, key_fn: Optional[Callable] = None):
    """
    Decorator to cache function results on disk.

    Args:
        namespace: Cache namespace (e.g., "systems", "findings")
        ttl: Time-to-live in seconds (default: 5 minutes)
        key_fn: Optional function to generate cache key from args

    Example:
        @disk_cache("systems", ttl=300)
        def get_all_systems():
            return expensive_aws_call()

        @disk_cache("findings", ttl=60, key_fn=lambda system_name: f"findings-{system_name}")
        def get_findings_for_system(system_name: str):
            return fetch_findings(system_name)
    """
    cache = DiskCache(namespace)

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            if key_fn:
                cache_key = key_fn(*args, **kwargs)
            else:
                # Default: use function name + args hash
                args_str = json.dumps({"args": args, "kwargs": kwargs}, sort_keys=True, default=str)
                cache_key = f"{func.__name__}-{hashlib.md5(args_str.encode()).hexdigest()[:8]}"

            # Try to get from cache
            cached = cache.get(cache_key)
            if cached is not None:
                print(f"[DiskCache] HIT: {namespace}/{cache_key}")
                return cached

            print(f"[DiskCache] MISS: {namespace}/{cache_key}")

            # Call function and cache result
            result = func(*args, **kwargs)
            cache.set(cache_key, result, ttl)

            return result

        # Expose cache methods on the wrapper
        wrapper.cache = cache
        wrapper.cache_key = lambda *a, **kw: key_fn(*a, **kw) if key_fn else None
        wrapper.invalidate = lambda *a, **kw: cache.delete(key_fn(*a, **kw) if key_fn else None)

        return wrapper

    return decorator


# ============================================================================
# Example FastAPI/Flask Integration
# ============================================================================

"""
# FastAPI Example:

from fastapi import FastAPI
from disk_cache import disk_cache, systems_cache

app = FastAPI()

@app.get("/api/systems")
@disk_cache("systems", ttl=300)  # Cache for 5 minutes
async def get_systems():
    # This expensive call only runs every 5 minutes
    systems = await fetch_systems_from_aws()
    return {"systems": systems, "cached": False}


# Or use cache directly for more control:

@app.get("/api/systems-v2")
async def get_systems_v2(force_refresh: bool = False):
    cache_key = "all-systems"

    if not force_refresh:
        cached = systems_cache.get(cache_key)
        if cached:
            return {"systems": cached, "cached": True}

    # Fetch fresh data
    systems = await fetch_systems_from_aws()
    systems_cache.set(cache_key, systems, ttl=300)

    return {"systems": systems, "cached": False}


# Flask Example:

from flask import Flask, jsonify
from disk_cache import disk_cache, systems_cache

app = Flask(__name__)

@app.route("/api/systems")
@disk_cache("systems", ttl=300)
def get_systems():
    systems = fetch_systems_from_aws()
    return jsonify({"systems": systems})
"""


# ============================================================================
# Cache Warming (run on startup or via cron)
# ============================================================================

async def warm_cache():
    """
    Pre-populate cache on startup to avoid cold-start delays.
    Call this from your app startup or a background job.
    """
    print("[DiskCache] Warming cache...")

    # Import your actual data fetching functions here
    # from your_app import fetch_systems, fetch_findings, fetch_gap_analysis

    # Example:
    # systems = await fetch_systems()
    # systems_cache.set("all-systems", systems, ttl=600)

    # findings = await fetch_findings()
    # findings_cache.set("all-findings", findings, ttl=300)

    print("[DiskCache] Cache warmed!")


# ============================================================================
# CLI for cache management
# ============================================================================

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python disk_cache.py <command>")
        print("Commands: stats, clear, warm")
        sys.exit(1)

    command = sys.argv[1]

    if command == "stats":
        for name in ["systems", "findings", "gap-analysis", "graph"]:
            cache = DiskCache(name)
            stats = cache.get_stats()
            print(f"{name}: {stats['entries']} entries, {stats['size_mb']} MB")

    elif command == "clear":
        namespace = sys.argv[2] if len(sys.argv) > 2 else None
        if namespace:
            cache = DiskCache(namespace)
            count = cache.clear()
            print(f"Cleared {count} entries from {namespace}")
        else:
            total = 0
            for name in ["systems", "findings", "gap-analysis", "graph"]:
                cache = DiskCache(name)
                total += cache.clear()
            print(f"Cleared {total} entries from all namespaces")

    elif command == "warm":
        import asyncio
        asyncio.run(warm_cache())

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
