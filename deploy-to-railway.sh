#!/bin/bash

# Railway Deployment Script for Playwright Transcript Service
# This script helps deploy the service to Railway

echo "🚂 Railway Deployment Script for Playwright Transcript Service"
echo "============================================================"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
else
    echo "✅ Railway CLI is installed"
fi

# Function to generate a secure API key
generate_api_key() {
    if command -v openssl &> /dev/null; then
        openssl rand -hex 32
    else
        # Fallback to using node
        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    fi
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the playwright-service directory."
    exit 1
fi

echo ""
echo "📋 Pre-deployment checklist:"
echo "1. Ensure you have a Railway account"
echo "2. Make sure all changes are committed to git"
echo "3. Have your Railway project ready (or we'll create one)"
echo ""

read -p "Ready to continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 1
fi

# Login to Railway
echo ""
echo "🔐 Logging into Railway..."
railway login

# Link or create project
echo ""
echo "🔗 Linking Railway project..."
echo "If you have an existing project, select it. Otherwise, create a new one."
railway link

# Generate API key if needed
echo ""
echo "🔑 Generating secure API key..."
API_KEY=$(generate_api_key)
echo "Generated API Key: $API_KEY"
echo "⚠️  Save this key securely! You'll need it to access the service."

# Set environment variables
echo ""
echo "⚙️  Setting environment variables..."

# Required variables
railway variables set API_KEY="$API_KEY"
railway variables set PORT=6623
railway variables set NODE_ENV=production

# Optional variables with defaults
railway variables set CACHE_MAX_SIZE=100
railway variables set CACHE_MAX_AGE=300000
railway variables set CIRCUIT_BREAKER_THRESHOLD=5
railway variables set CIRCUIT_BREAKER_TIMEOUT=60000
railway variables set MAX_RETRIES=3
railway variables set RETRY_DELAY=2000
railway variables set MAX_CONCURRENT_REQUESTS=3
railway variables set RATE_LIMIT_WINDOW=60000
railway variables set RATE_LIMIT_MAX=30

echo "✅ Environment variables set"

# Deploy
echo ""
echo "🚀 Deploying to Railway..."
railway up

echo ""
echo "✨ Deployment initiated!"
echo ""
echo "📌 Next steps:"
echo "1. Check deployment status in Railway dashboard"
echo "2. Wait for build to complete (may take 5-10 minutes)"
echo "3. Get your service URL from Railway dashboard"
echo "4. Test the health endpoint: curl https://your-service.railway.app/health"
echo ""
echo "📝 Your API Key: $API_KEY"
echo "⚠️  Store this API key securely - you won't be able to see it again!"
echo ""
echo "🔗 Quick test command (replace 'your-service' with actual URL):"
echo "curl -X POST https://your-service.railway.app/extract \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -H \"X-API-Key: $API_KEY\" \\"
echo "  -d '{\"videoId\": \"dQw4w9WgXcQ\"}'"