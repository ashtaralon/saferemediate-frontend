#!/bin/bash
# Check frontend status and push if needed

cd /Users/aashtar/Documents/Alon/Personal/Startup/Database/ImpacIQ/saferemediate-frontend

echo "🔍 Checking frontend git status..."
echo ""

echo "📋 Current branch:"
git branch --show-current

echo ""
echo "📊 Status:"
git status --short

echo ""
echo "📝 Recent commits:"
git log --oneline -5

echo ""
echo "🔍 Checking for unpushed commits:"
git log origin/main..HEAD --oneline

if [ -n "$(git log origin/main..HEAD --oneline)" ]; then
    echo ""
    echo "⚠️  Found unpushed commits!"
    echo ""
    read -p "Push now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "📤 Pushing to GitHub..."
        git push origin main
    fi
else
    echo "✅ All commits are pushed"
fi

echo ""
echo "🔍 Checking for uncommitted changes:"
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  Found uncommitted changes:"
    git status --short
    echo ""
    read -p "Commit and push? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "📝 Committing changes..."
        git add -A
        git commit -m "Update frontend components"
        echo ""
        echo "📤 Pushing to GitHub..."
        git push origin main
    fi
else
    echo "✅ No uncommitted changes"
fi

echo ""
echo "✅ Done!"

