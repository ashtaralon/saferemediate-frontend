# 🔍 איך לבדוק שה-Env Variable מוגדר ב-Vercel

## ⚠️ חשוב: Next.js טוען env variables רק בזמן BUILD!

**אם ה-var לא קיים בזמן build → הקוד יכניס `undefined` → הקריאות יהיו relative → ילכו ל-Vercel!**

---

## 🧪 בדיקה 1: בדפדפן Console

פתח DevTools → Console וכתוב:

```javascript
window.NEXT_PUBLIC_BACKEND_URL
```

**אמור להחזיר:**
- ✅ `"https://cyntro-backend.onrender.com"` → מוגדר נכון!
- ❌ `undefined` → לא מוגדר או לא היה Redeploy

---

## 🧪 בדיקה 2: Network Tab

פתח DevTools → Network → רענן את הדף

**מה אמור להופיע:**

✅ **נכון (אחרי תיקון):**
```
https://cyntro-backend.onrender.com/api/findings
https://cyntro-backend.onrender.com/api/traffic/gap/...
```

❌ **לא נכון (עכשיו):**
```
/findings
/metrics
/nodes
https://cyntro-frontend-xxx.vercel.app/metrics
```

---

## 🧪 בדיקה 3: Vercel Dashboard

1. Vercel Dashboard → Project → Settings → Environment Variables
2. חפש: `NEXT_PUBLIC_BACKEND_URL`
3. האם קיים? מה הערך?

---

## 🧪 בדיקה 4: Build Logs

1. Vercel Dashboard → Deployments → Build Logs
2. חפש: `NEXT_PUBLIC_BACKEND_URL`
3. האם הוא מופיע ב-build?

---

## ⚠️ אם ה-var לא מוגדר או לא ב-build:

**צריך:**
1. הוסף את ה-var ב-Settings
2. **חובה:** Redeploy (לא Restart!)
3. חכה ל-build חדש (2-3 דקות)

