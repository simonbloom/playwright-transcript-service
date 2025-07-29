# Railway Deployment Guide for Playwright Transcript Service

## Overview

This guide provides step-by-step instructions for deploying the Playwright transcript extraction service to Railway.

## Prerequisites

1. Railway account (https://railway.app)
2. Railway CLI installed (optional but recommended)
   ```bash
   npm install -g @railway/cli
   ```
3. Git repository with the service code

## Deployment Methods

### Method 1: Using Dockerfile (Recommended)

The service includes a Dockerfile that ensures all Playwright browser dependencies are properly installed.

### Method 2: Using Nixpacks

Alternative deployment using `nixpacks.toml` configuration. Railway will auto-detect and use this if no Dockerfile is present.

## Step-by-Step Deployment

### 1. Create Railway Project

1. Log into Railway Dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo" or "Empty Project"

### 2. Connect Repository

If using GitHub:
1. Connect your GitHub account
2. Select the repository containing the playwright-service
3. Railway will auto-deploy on push

If using CLI:
```bash
cd playwright-service
railway login
railway link
railway up
```

### 3. Configure Environment Variables

Required variables (set in Railway dashboard):

```env
# Required
API_KEY=generate-secure-api-key-here
PORT=6623

# Optional (defaults shown)
CACHE_MAX_SIZE=100
CACHE_MAX_AGE=300000
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=60000
MAX_RETRIES=3
RETRY_DELAY=2000
MAX_CONCURRENT_REQUESTS=3
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=30
```

### 4. Configure Service Settings

In Railway dashboard:
1. Go to service settings
2. Set custom start command (if needed): `npm start`
3. Configure health check:
   - Path: `/health`
   - Timeout: 30 seconds
4. Set restart policy:
   - Type: ON_FAILURE
   - Max retries: 3

### 5. Deploy

Railway will automatically:
1. Build the Docker image or use Nixpacks
2. Install all dependencies including Playwright browsers
3. Start the service on the configured port

### 6. Verify Deployment

1. Check deployment logs in Railway dashboard
2. Test health endpoint:
   ```bash
   curl https://your-service.railway.app/health
   ```
3. Test extraction endpoint:
   ```bash
   curl -X POST https://your-service.railway.app/extract \
     -H "Content-Type: application/json" \
     -H "X-API-Key: your-api-key" \
     -d '{"videoId": "dQw4w9WgXcQ"}'
   ```

## Monitoring and Logging

### Health Check Endpoint
- URL: `/health`
- Returns: Service status, circuit breaker state, cache stats, queue status

### Stats Endpoint
- URL: `/stats`
- Requires: API key authentication
- Returns: Detailed metrics for all components

### Railway Logs
- Access via Railway dashboard
- Real-time log streaming available
- Use Railway CLI: `railway logs`

## Performance Considerations

1. **Memory Usage**: Playwright browsers can use significant memory
   - Monitor usage in Railway metrics
   - Consider upgrading plan if needed

2. **Cold Starts**: First request after idle may be slower
   - Implement warm-up requests if needed
   - Consider keeping service active

3. **Concurrent Requests**: Limited by `MAX_CONCURRENT_REQUESTS`
   - Default: 3 concurrent extractions
   - Adjust based on Railway plan limits

## Troubleshooting

### Common Issues

1. **Browser Launch Failures**
   - Ensure Dockerfile is used (includes all dependencies)
   - Check memory limits aren't exceeded
   - Verify browser installation in logs

2. **API Key Issues**
   - Ensure API_KEY environment variable is set
   - Use correct header: `X-API-Key`

3. **Timeout Errors**
   - Increase PLAYWRIGHT_TIMEOUT if needed
   - Check Railway service timeout settings

4. **Memory Issues**
   - Playwright requires ~500MB per browser instance
   - Upgrade Railway plan if hitting limits

### Debug Commands

```bash
# View logs
railway logs

# Check environment variables
railway variables

# Run locally with Railway environment
railway run npm start
```

## Security Best Practices

1. **API Key Management**
   - Use strong, randomly generated API keys
   - Rotate keys periodically
   - Never commit keys to repository

2. **Network Security**
   - Railway provides HTTPS by default
   - Consider IP allowlisting if needed

3. **Container Security**
   - Service runs as non-root user
   - Minimal attack surface with specific dependencies

## Cost Optimization

1. **Resource Usage**
   - Monitor metrics in Railway dashboard
   - Optimize concurrent request limits
   - Use caching effectively

2. **Scaling**
   - Start with hobby plan
   - Scale based on actual usage
   - Consider horizontal scaling for high load

## API Usage Examples

### Basic Extraction
```javascript
const response = await fetch('https://your-service.railway.app/extract', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify({
    videoId: 'dQw4w9WgXcQ'
  })
});

const data = await response.json();
console.log(data.transcript);
```

### High Priority Request
```javascript
const response = await fetch('https://your-service.railway.app/extract', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key',
    'X-Priority': 'high'
  },
  body: JSON.stringify({
    videoId: 'dQw4w9WgXcQ'
  })
});
```

## Maintenance

### Updates
1. Push changes to connected repository
2. Railway auto-deploys on push
3. Monitor deployment status

### Monitoring
- Set up alerts for failures
- Monitor resource usage trends
- Check circuit breaker trips

### Backup
- Export environment variables regularly
- Keep deployment configuration in version control

## Support

- Railway Documentation: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Service Issues: Check logs and health endpoint first