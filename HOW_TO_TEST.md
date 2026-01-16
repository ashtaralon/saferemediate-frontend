# How to Test ACTUAL_TRAFFIC Edges in Browser

## Method 1: Browser Console (Easiest)

### Step 1: Open Your Website
1. Go to: `https://cyntro-frontend.vercel.app` (or your deployed URL)
2. Wait for the page to load

### Step 2: Open Browser Console
**On Mac:**
- Press `Cmd + Option + I` (Command + Option + I)
- OR right-click anywhere on the page → "Inspect" → Click "Console" tab

**On Windows/Linux:**
- Press `F12`
- OR press `Ctrl + Shift + I`
- OR right-click → "Inspect" → Click "Console" tab

### Step 3: Copy and Paste This Code
Copy this entire block and paste it into the console, then press Enter:

```javascript
fetch('/api/proxy/dependency-map/full?systemName=alon-prod').then(r => r.json()).then(d => {
  const trafficEdges = d.edges.filter(e => e.edge_type === 'ACTUAL_TRAFFIC' || e.type === 'ACTUAL_TRAFFIC');
  console.log('ACTUAL_TRAFFIC edges found:', trafficEdges.length);
  console.log('All traffic edges:', trafficEdges);
  console.log('Total edges:', d.edges.length);
  console.log('Total nodes:', d.nodes.length);
  
  // Show first 3 traffic edges
  if (trafficEdges.length > 0) {
    console.log('First traffic edge:', trafficEdges[0]);
  }
});
```

### Step 4: Check the Results
Look at the console output. You should see:
- How many ACTUAL_TRAFFIC edges were found
- The actual edge data

---

## Method 2: Use the Test HTML File (Local)

### Step 1: Start Your Dev Server
```bash
cd /Users/admin/Documents/Eltro/Platfrom/cyntro-frontend
npm run dev
```

### Step 2: Open the Test File
1. Open your browser
2. Go to: `http://localhost:3000/test-actual-traffic.html`
3. The page will automatically test and show results

---

## Method 3: Quick Test with curl (Terminal)

If you prefer terminal:

```bash
cd /Users/admin/Documents/Eltro/Platfrom/cyntro-frontend

# Test the API
curl "https://cyntro-frontend.vercel.app/api/proxy/dependency-map/full?systemName=alon-prod" | \
  node -e "
    const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
    const traffic = data.edges.filter(e => 
      e.edge_type === 'ACTUAL_TRAFFIC' || e.type === 'ACTUAL_TRAFFIC'
    );
    console.log('ACTUAL_TRAFFIC edges:', traffic.length);
    console.log('Total edges:', data.edges.length);
    if (traffic.length > 0) {
      console.log('First edge:', JSON.stringify(traffic[0], null, 2));
    }
  "
```

---

## What to Look For

✅ **Good Result:**
- `ACTUAL_TRAFFIC edges found: 2` (or more)
- You see edge objects with `edge_type: "ACTUAL_TRAFFIC"` or `type: "ACTUAL_TRAFFIC"`

❌ **Problem:**
- `ACTUAL_TRAFFIC edges found: 0`
- This means the backend isn't returning ACTUAL_TRAFFIC edges, or they're using a different field name

---

## Screenshot Guide

1. **Open Console:**
   - Mac: `Cmd + Option + I`
   - Windows: `F12`

2. **You'll see a panel like this:**
   ```
   [Console tab]
   > (cursor here - paste your code)
   ```

3. **After pasting and pressing Enter, you'll see:**
   ```
   ACTUAL_TRAFFIC edges found: 2
   All traffic edges: [...]
   ```

