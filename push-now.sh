#!/bin/bash

# Script to push all commits to GitHub
# Run this from the saferemediate-frontend directory

cd /Users/admin/Documents/Eltro/Platfrom/saferemediate-frontend

echo "📦 Checking git status..."
git status

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo "🔍 Vercel should auto-deploy now. Check: https://vercel.com/dashboard"
else
    echo ""
    echo "❌ Push failed. You may need to:"
    echo "   1. Enter your GitHub username"
    echo "   2. Enter your Personal Access Token (not password)"
    echo ""
    echo "   To create a token:"
    echo "   https://github.com/settings/tokens"
    echo "   (Select 'repo' scope)"
fi


