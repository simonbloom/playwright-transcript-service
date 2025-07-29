# Playwright Service Test Suite

Comprehensive test coverage for the enhanced YouTube transcript extraction service using Playwright.

## Test Structure

### Unit Tests (`/tests/unit/`)

#### `circuit-breaker.test.js`
- State transitions (CLOSED → OPEN → HALF_OPEN)
- Failure threshold enforcement
- Automatic recovery mechanisms
- Metrics tracking
- Manual reset functionality

#### `retry-manager.test.js`
- Exponential backoff calculations
- Jitter implementation
- Retry budget enforcement
- Error classification (retryable vs non-retryable)
- Rate limit handling with Retry-After headers

#### `cache-manager.test.js`
- LRU eviction policy
- TTL expiration
- Cache hit/miss tracking
- Size estimation
- Warm-up functionality
- Key generation strategies

#### `request-queue.test.js`
- Priority queue ordering
- Concurrency limits
- Rate limiting
- Timeout handling
- Retry with priority elevation
- Throughput monitoring

#### `youtube-ui-detector.test.js`
- UI version detection (Polymer 3, mobile, legacy)
- Multi-strategy button finding
- Transcript panel detection
- Segment extraction strategies
- Transcript availability checks

### Integration Tests (`/tests/integration/`)

#### `server.test.js`
- API endpoint testing
- Authentication validation
- Request/response handling
- Error responses
- Cache integration
- Queue processing

#### `transcript-extractor.test.js`
- Full extraction workflow
- Browser lifecycle management
- Error handling and recovery
- Metadata extraction
- Debug screenshot capture
- Resource cleanup

#### `edge-cases.test.js`
- Rapid state transitions
- Concurrent operations
- Cache stampede scenarios
- Queue overflow handling
- Priority inversion
- Cascading failures
- Malformed data handling

### Performance Benchmarks (`/tests/benchmark/`)

#### `performance.test.js`
- Playwright vs Puppeteer comparison
- Extraction speed metrics
- Resource usage analysis
- Statistical analysis (avg, min, max, std dev)
- Feature comparison matrix

## Running Tests

### All Tests
```bash
pnpm test
```

### Specific Test Suites
```bash
# Unit tests only
pnpm test:unit

# Integration tests only
pnpm test:integration

# Performance benchmarks
pnpm test:benchmark

# Watch mode for development
pnpm test:watch
```

### Coverage Report
```bash
pnpm test:coverage
```

## Test Configuration

Tests are configured in `package.json` with Jest:
- Test timeout: 30 seconds (for integration tests)
- Coverage threshold: 80% (recommended)
- Test environment: Node.js

## Mock Strategy

### Browser Mocking
- Playwright's `chromium.launch()` is mocked in integration tests
- Page objects are mocked with common methods
- Realistic timing delays are simulated

### Service Mocking
- External services use Jest mocks
- Circuit breaker states can be manipulated
- Cache can be pre-populated for testing

## Test Data

### Video IDs
- `test123`: Generic test video
- `cached123`: Pre-cached video
- `no-transcript`: Video without transcripts
- `error-video`: Triggers extraction errors
- `dQw4w9WgXcQ`: Real video for benchmarks

## Debugging Failed Tests

### Enable Debug Output
```bash
DEBUG=* pnpm test
```

### Run Single Test
```bash
pnpm test -- --testNamePattern="should extract transcript"
```

### Debug in VS Code
Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "--no-cache"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

## Continuous Integration

Tests should run in CI with:
1. Install dependencies: `pnpm install`
2. Run linting: `pnpm lint`
3. Run tests: `pnpm test:coverage`
4. Check coverage thresholds
5. Generate test reports

## Performance Expectations

### Unit Tests
- Circuit breaker: < 100ms per test
- Retry manager: < 500ms per test (includes delays)
- Cache manager: < 50ms per test
- Request queue: < 200ms per test
- UI detector: < 100ms per test

### Integration Tests
- Server endpoints: < 1s per test
- Transcript extraction: < 5s per test
- Edge cases: < 2s per test

### Benchmarks
- Full extraction: 5-15s per video
- Playwright typically 10-20% faster than Puppeteer

## Future Test Additions

1. **E2E Tests**: Real YouTube videos with actual extraction
2. **Load Tests**: High concurrency scenarios
3. **Memory Leak Tests**: Long-running stability tests
4. **Cross-browser Tests**: Firefox and WebKit support
5. **Network Condition Tests**: Slow/unreliable connections