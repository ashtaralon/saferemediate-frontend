# Debug Guide: Re-ingest Endpoint

## ✅ Frontend Components Status

### 1. Button Component
- **Location**: `components/systems-view.tsx` (lines 586-594)
- **Status**: ✅ Visible and working
- **Function**: `handleReingest()` (lines 397-445)

### 2. API Proxy Route
- **Location**: `app/api/proxy/admin/reingest/route.ts`
- **Backend URL**: `https://saferemediate-backend-f.onrender.com/api/admin/reingest`
- **Method**: POST

---

## 🔍 Debugging Steps

### Step 1: Check Frontend Console

Open browser DevTools (F12) → Console tab:

```javascript
// Should see these logs:
[API Proxy] Re-ingest request: { scope: "all", target: null }
[API Proxy] Re-ingest success: {...}
// OR
[API Proxy] Re-ingest failed: 404, ...
[systems-view] Re-ingestion error: ...
```

**What to check:**
- ✅ No errors = Good
- ❌ Error message = See Step 2

---

### Step 2: Check Network Request

DevTools → Network tab → Find "reingest" request:

**Request:**
- Method: `POST`
- URL: `/api/proxy/admin/reingest`
- Body: `{"scope":"all"}`

**Response (Check these):**

1. **Status Code:**
   - `200 OK` → Success! ✅
   - `404 Not Found` → Backend endpoint not deployed ❌
   - `500 Internal Server Error` → Backend error ❌
   - `503 Service Unavailable` → Backend down ❌

2. **Response Headers:**
   - Check `content-type`: should be `application/json`

3. **Response Body:**
   - Success: `{"success": true, "scope": "all", ...}`
   - Error: `{"success": false, "error": "..."}`

---

### Step 3: Test Backend Directly

Test if backend endpoint exists:

```bash
curl -X POST https://saferemediate-backend-f.onrender.com/api/admin/reingest \
  -H "Content-Type: application/json" \
  -d '{"scope":"all"}'
```

**Expected responses:**
- `404 Not Found` → Endpoint not deployed (need to merge PR)
- `200 OK` → Endpoint exists and working ✅
- `500 Internal Server Error` → Endpoint exists but has error

---

### Step 4: Check Backend Logs (Render)

1. Go to Render dashboard
2. Select your backend service
3. Click "Logs" tab
4. Look for:
   - `🔄 Manual trigger: Running all collectors...`
   - `✅ Collector completed: ...`
   - `❌ Error: ...`

---

### Step 5: Common Issues & Fixes

#### Issue 1: 404 Not Found
**Problem**: Backend endpoint not deployed
**Fix**: 
1. Merge PR: `copilot/add-scoped-re-ingestion-endpoint` → `main`
2. Wait for Render auto-deploy (or trigger manually)
3. Verify endpoint exists: `curl` test above

#### Issue 2: CORS Error
**Problem**: Backend CORS not configured
**Fix**: Check `main.py` has CORS middleware:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    ...
)
```

#### Issue 3: Timeout
**Problem**: Re-ingestion takes > 60 seconds
**Fix**: Increase timeout in `route.ts`:
```typescript
signal: AbortSignal.timeout(120000) // 2 minutes
```

#### Issue 4: Collectors Not Available
**Problem**: `COLLECTORS_AVAILABLE = False`
**Fix**: Check backend logs for:
- `⚠️  Collectors not available`
- Missing `saferemediate_collectors.py` import

---

## 🧪 Test Commands

### Frontend Test
```bash
# Check if proxy route exists
curl -X POST http://localhost:3000/api/proxy/admin/reingest \
  -H "Content-Type: application/json" \
  -d '{"scope":"all"}'
```

### Backend Test
```bash
# Test backend directly
curl -X POST https://saferemediate-backend-f.onrender.com/api/admin/reingest \
  -H "Content-Type: application/json" \
  -d '{"scope":"all"}'
```

---

## 📊 Expected Flow

1. **User clicks "Re-ingest Now"**
   → Frontend: `handleReingest("all")` called

2. **Frontend sends request**
   → POST `/api/proxy/admin/reingest`
   → Body: `{"scope":"all"}`

3. **API Proxy forwards to backend**
   → POST `https://saferemediate-backend-f.onrender.com/api/admin/reingest`

4. **Backend processes**
   → Runs collectors (IAM, Lambda, RDS, etc.)
   → Returns: `{"status": "success", "collectors_run": [...]}`

5. **Frontend receives response**
   → Shows toast: "Re-ingestion Started"
   → Auto-refreshes systems data after 2 seconds

---

## 🔧 Quick Fixes

### If button doesn't appear:
```bash
# Check if file exists
ls components/systems-view.tsx

# Check if RotateCcw imported
grep "RotateCcw" components/systems-view.tsx

# Rebuild frontend
npm run build
```

### If request fails:
```javascript
// Add more logging in route.ts
console.log("[API Proxy] Full error:", error);
console.log("[API Proxy] Response status:", response.status);
console.log("[API Proxy] Response text:", await response.text());
```

---

## 📝 Log Locations

### Frontend Logs:
- Browser Console (F12)
- Vercel Logs (if deployed)

### Backend Logs:
- Render Dashboard → Logs tab
- Should see: `logger.info("🔄 Manual trigger: ...")`

---

## ✅ Success Checklist

- [ ] Button visible in UI
- [ ] Request sent to `/api/proxy/admin/reingest`
- [ ] Response status = 200
- [ ] Toast notification appears
- [ ] Systems data refreshes after 2 seconds
- [ ] Backend logs show collector activity

