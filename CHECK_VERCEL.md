# Why Vercel Isn't Running - Troubleshooting Guide

## Common Reasons Vercel Doesn't Auto-Deploy:

### 1. **Vercel Project Not Connected to GitHub**
- Go to: https://vercel.com/dashboard
- Check if `cyntro-frontend` project exists
- If not, click "Add New Project" → Import from GitHub → Select `ashtaralon/cyntro-frontend`

### 2. **Auto-Deployments Disabled**
- Go to: Project Settings → Git
- Make sure "Auto-deploy from Git" is enabled
- Check that it's connected to `main` branch

### 3. **Build Errors**
- Go to: Deployments tab
- Check the latest deployment status
- Look for build errors in logs
- Common issues:
  - Missing environment variables
  - TypeScript errors
  - Missing dependencies

### 4. **Manual Trigger Needed**
Sometimes you need to manually trigger a deployment:
- Go to: Deployments tab
- Click "Redeploy" button
- Or push an empty commit: `git commit --allow-empty -m "Trigger Vercel deploy" && git push`

## Quick Fix - Manual Deployment:

```bash
cd /Users/aashtar/Downloads/cyntro-frontend-main

# Option 1: Empty commit to trigger
git commit --allow-empty -m "Trigger Vercel deployment"
git push origin main

# Option 2: Make a small change
echo "# Trigger" >> .vercel-trigger
git add .vercel-trigger
git commit -m "Trigger Vercel deployment"
git push origin main
```

## Check Vercel Status:

1. **Visit Vercel Dashboard:**
   - https://vercel.com/dashboard
   - Find your project: `cyntro-frontend`

2. **Check Latest Deployment:**
   - Go to "Deployments" tab
   - See if there's a recent deployment
   - Check status (Building, Ready, Error)

3. **Check Build Logs:**
   - Click on latest deployment
   - View "Build Logs"
   - Look for errors

## Required Environment Variables:

Make sure these are set in Vercel:
- `NEXT_PUBLIC_BACKEND_URL` = `https://cyntro-backend-f.onrender.com`

To set:
1. Go to: Project Settings → Environment Variables
2. Add: `NEXT_PUBLIC_BACKEND_URL`
3. Value: `https://cyntro-backend-f.onrender.com`
4. Apply to: Production, Preview, Development
5. **Redeploy** after adding

## If Still Not Working:

1. **Check GitHub Webhook:**
   - Vercel Dashboard → Settings → Git
   - Make sure webhook is active

2. **Check Project Status:**
   - Is project paused?
   - Is there a billing issue?

3. **Try Vercel CLI:**
   ```bash
   npm i -g vercel
   vercel login
   vercel --prod
   ```

