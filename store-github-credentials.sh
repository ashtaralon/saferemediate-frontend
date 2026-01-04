#!/bin/bash

# Script to store GitHub credentials in macOS keychain
# This will allow git to use stored credentials automatically

echo "🔐 Storing GitHub credentials in macOS keychain..."
echo ""
echo "Enter the following information:"
echo ""

# Store credentials using git credential helper
git credential-osxkeychain store <<EOF
protocol=https
host=github.com
username=ashtaralon
password=YOUR_GITHUB_TOKEN_HERE
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Credentials stored successfully!"
    echo ""
    echo "Now you can use 'git push origin main' without entering credentials."
    echo ""
    echo "🚀 Testing push..."
    cd /Users/admin/Documents/Eltro/Platfrom/saferemediate-frontend
    git push origin main
else
    echo ""
    echo "❌ Failed to store credentials. Please try manually:"
    echo ""
    echo "Run: git credential-osxkeychain store"
    echo "Then paste:"
    echo "protocol=https"
    echo "host=github.com"
    echo "username=ashtaralon"
    echo "password=YOUR_TOKEN"
    echo "(Press Ctrl+D when done)"
fi

