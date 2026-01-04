#!/bin/bash

# Deployment script for saferemediate-frontend
# This will push to GitHub (which triggers Vercel auto-deploy)

cd /Users/admin/Documents/Eltro/Platfrom/saferemediate-frontend

echo "🚀 Deploying to GitHub (will trigger Vercel auto-deploy)..."
echo ""

# Check if we have commits to push
COMMITS_AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "0")

if [ "$COMMITS_AHEAD" = "0" ]; then
    echo "✅ No commits to push. Everything is up to date!"
    exit 0
fi

echo "📦 Found $COMMITS_AHEAD commit(s) ready to push:"
git log --oneline origin/main..HEAD
echo ""

# Try to push
echo "🔄 Pushing to GitHub..."
git push origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo "🔍 Vercel should auto-deploy now..."
    echo ""
    echo "Check deployment status:"
    echo "  https://vercel.com/dashboard"
    echo ""
    echo "Your changes will be live in 1-2 minutes!"
else
    echo ""
    echo "❌ Push failed. You may need to:"
    echo ""
    echo "1. Update GitHub token:"
    echo "   Go to: https://github.com/settings/tokens"
    echo "   Create new token with 'repo' scope"
    echo ""
    echo "2. Store credentials:"
    echo "   echo -e 'protocol=https\\nhost=github.com\\nusername=ashtaralon\\npassword=YOUR_TOKEN' | git credential-osxkeychain store"
    echo ""
    echo "3. Or use SSH:"
    echo "   git remote set-url origin git@github.com:ashtaralon/saferemediate-frontend.git"
    echo "   git push origin main"
    echo ""
    echo "4. Or deploy directly with Vercel CLI:"
    echo "   npx vercel login"
    echo "   npx vercel --prod"
fi

