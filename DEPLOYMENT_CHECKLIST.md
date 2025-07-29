# Railway Deployment Checklist

## Pre-Deployment
- [ ] Ensure all tests pass locally
- [ ] Generate secure API key for production
- [ ] Review resource requirements (memory/CPU)
- [ ] Commit all changes to repository

## Railway Setup
- [ ] Create new Railway project
- [ ] Connect GitHub repository (or use CLI)
- [ ] Select playwright-service directory as root

## Environment Variables (Required)
- [ ] `API_KEY` - Set secure API key
- [ ] `PORT` - Set to 6623
- [ ] `NODE_ENV` - Set to production

## Environment Variables (Optional)
- [ ] `CACHE_MAX_SIZE` - Default: 100
- [ ] `CACHE_MAX_AGE` - Default: 300000 (5 minutes)
- [ ] `CIRCUIT_BREAKER_THRESHOLD` - Default: 5
- [ ] `CIRCUIT_BREAKER_TIMEOUT` - Default: 60000 (1 minute)
- [ ] `MAX_RETRIES` - Default: 3
- [ ] `RETRY_DELAY` - Default: 2000 (2 seconds)
- [ ] `MAX_CONCURRENT_REQUESTS` - Default: 3
- [ ] `RATE_LIMIT_WINDOW` - Default: 60000 (1 minute)
- [ ] `RATE_LIMIT_MAX` - Default: 30

## Deployment Configuration
- [ ] Verify Dockerfile is detected by Railway
- [ ] Confirm build completes successfully
- [ ] Check deployment logs for errors
- [ ] Verify Playwright browsers installed

## Post-Deployment Testing
- [ ] Test health endpoint: `GET /health`
- [ ] Test stats endpoint: `GET /stats` (with API key)
- [ ] Test extraction: `POST /extract` with sample video ID
- [ ] Verify caching works (second request should be faster)
- [ ] Test circuit breaker (simulate failures)

## Monitoring Setup
- [ ] Set up Railway alerts
- [ ] Monitor memory usage
- [ ] Check response times
- [ ] Review error logs

## Production Readiness
- [ ] Document API endpoint URL
- [ ] Share API key securely with team
- [ ] Update main application configuration
- [ ] Create runbook for common issues
- [ ] Schedule API key rotation

## Quick Test Commands

```bash
# Health check
curl https://your-service.railway.app/health

# Stats check
curl -H "X-API-Key: your-key" https://your-service.railway.app/stats

# Extract transcript
curl -X POST https://your-service.railway.app/extract \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"videoId": "dQw4w9WgXcQ"}'
```