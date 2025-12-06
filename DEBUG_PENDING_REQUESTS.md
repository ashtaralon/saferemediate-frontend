# 🔍 Debug Pending Requests

## ❌ Problem: Requests Stay Pending

The fetch request to backend stays in "Pending" state. This usually means:

1. **CORS issue** - Backend not allowing requests from frontend
2. **Backend not responding** - Backend is down or slow
3. **Network timeout** - Request taking too long

---

## 📋 Step 1: Check Backend Directly

**In terminal, run:**

```bash
curl https://saferemediate-backend.onrender.com/health
```

**Expected:** Should return JSON like `{"status":"healthy",...}`

**If it hangs or fails:** Backend might be sleeping (Render free tier sleeps after inactivity)

---

## 📋 Step 2: Check Request URL in Network Tab

1. **Open DevTools → Network tab**
2. **Click on the Pending request** (the one that shows "pending")
3. **Click "Headers" tab**
4. **Look for "Request URL"**

**What URL do you see?**
- If it's `https://saferemediate-backend.onrender.com/health` → Good, direct call
- If it's something else → Problem

---

## 📋 Step 3: Check Console for CORS Errors

**In Console tab, look for:**
- `Access to fetch at '...' from origin '...' has been blocked by CORS policy`
- `Failed to fetch`
- `NetworkError`

---

## 🔧 Possible Solutions

### Solution 1: Backend is Sleeping (Render Free Tier)

Render free tier services sleep after 15 minutes of inactivity. First request wakes them up (takes 30-60 seconds).

**Wait 1-2 minutes and try again.**

### Solution 2: CORS Not Configured

Check if backend CORS allows requests from:
- `https://saferemediate-frontend.vercel.app`

### Solution 3: Check Request Headers

In Network tab → Headers → Request Headers, check:
- `Origin: https://saferemediate-frontend.vercel.app`
- `Referer: https://saferemediate-frontend.vercel.app/`

---

## 📋 What to Check Now

1. **Run curl test:**
   ```bash
   curl https://saferemediate-backend.onrender.com/health
   ```

2. **Check Request URL in Network tab:**
   - What URL do you see?

3. **Wait 1-2 minutes and try the Console test again:**
   ```javascript
   fetch('https://saferemediate-backend.onrender.com/health')
     .then(r => r.json())
     .then(d => console.log('✅ Backend works:', d))
     .catch(e => console.error('❌ Backend error:', e));
   ```

---

**Send me:**
1. What does `curl` return?
2. What is the Request URL in Network tab?
3. Any CORS errors in Console?

