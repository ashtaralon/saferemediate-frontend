# Backend Fixes

This folder contains fixes for the SafeRemediate backend to resolve issues.

## Quick Fix - Pin Neo4j Version

If your backend is crashing with:
```
ImportError: cannot import name 'ConnectionResetByPeer' from 'neo4j.exceptions'
```

**Option 1: Pin the neo4j version (Quick fix)**

Update your `requirements.txt`:
```
neo4j==5.23.0
```

Then redeploy.

**Option 2: Make Neo4j Optional (Recommended)**

Replace your `neo4j_client.py` with the `neo4j_client_optional.py` file in this folder.

This makes Neo4j an optional dependency that won't crash your backend if:
- The neo4j package has breaking changes
- Neo4j connection is unavailable
- Credentials are missing

According to your architecture, Neo4j is only used for finding relationships between components - it's not critical for the platform to function.

## Files

- `neo4j_client_optional.py` - Drop-in replacement for `neo4j_client.py` with optional Neo4j support
- `requirements_fix.txt` - Fixed requirements with pinned neo4j version

## How to Apply

### For Render.com deployment:

1. Go to your Render dashboard
2. Navigate to your backend service
3. Either:
   - Update environment variables if using requirements from repo
   - Or push the fixed files to your repository

### For local development:

```bash
cd saferemediate-backend
cp ../saferemediate-frontend/backend-fixes/neo4j_client_optional.py ./neo4j_client.py
pip install -r requirements.txt
```
