# ⚠️ Security Note: Neo4j Credentials

## Important Security Issue

The `aws-infrastructure-map.tsx` component contains **hardcoded Neo4j credentials** in the code.

### Current Implementation

```typescript
const NEO4J = {
  uri: process.env.NEXT_PUBLIC_NEO4J_URI || 'https://4e9962b7.databases.neo4j.io',
  user: process.env.NEXT_PUBLIC_NEO4J_USER || 'neo4j',
  pass: process.env.NEXT_PUBLIC_NEO4J_PASS || 'zxr4y5USTynIAh9VD7wej1Zq6UkQenJSOKunANe3aew'
};
```

### ⚠️ Security Risk

- **Credentials are exposed** in the source code
- **Anyone with access to the repository** can see the password
- **Credentials are committed to Git history**
- **Public repositories** expose credentials to everyone

---

## ✅ Recommended Fix

### Step 1: Move to Environment Variables

1. **Add to `.env.local`** (for local development):
   ```bash
   NEXT_PUBLIC_NEO4J_URI=https://4e9962b7.databases.neo4j.io
   NEXT_PUBLIC_NEO4J_USER=neo4j
   NEXT_PUBLIC_NEO4J_PASS=your_password_here
   ```

2. **Add to Vercel Environment Variables**:
   - Go to: Vercel Dashboard → Settings → Environment Variables
   - Add all three variables
   - Apply to: Production, Preview, Development

3. **Update the component** to remove hardcoded fallback:
   ```typescript
   const NEO4J = {
     uri: process.env.NEXT_PUBLIC_NEO4J_URI!,
     user: process.env.NEXT_PUBLIC_NEO4J_USER!,
     pass: process.env.NEXT_PUBLIC_NEO4J_PASS!
   };
   ```

### Step 2: Rotate Credentials

Since credentials are already exposed:
1. **Change Neo4j password** immediately
2. **Update in environment variables**
3. **Remove from Git history** (if needed)

---

## 🔒 Best Practices

1. **Never commit credentials** to Git
2. **Use environment variables** for all secrets
3. **Use `.env.local`** for local development (gitignored)
4. **Use Vercel environment variables** for production
5. **Rotate credentials** if exposed

---

## 📝 Next Steps

1. ✅ Component is saved and committed
2. ⏳ **URGENT:** Move credentials to environment variables
3. ⏳ **URGENT:** Rotate Neo4j password
4. ⏳ Update component to remove hardcoded fallback

---

**Status:** Component deployed, but credentials need to be secured!
