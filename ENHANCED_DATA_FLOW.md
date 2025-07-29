# Enhanced Video Analytics Data Flow

This document explains how data flows through the enhanced video analytics system, from event generation to API transmission.

## Architecture Overview

The enhanced video analytics system consists of several interconnected components that work together to provide robust, efficient, and reliable data collection:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   VideoTracker │───▶│ PriorityEventBuffer│───▶│ HarvestScheduler│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                          │
                       ┌──────────────────┐               │
                       │ DeadLetterHandler│◀──────────────┤
                       └──────────────────┘               │
                                                          ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  BaseHarvester   │◀───│OptimizedHttpClient│
                       └──────────────────┘    └─────────────────┘
                                                          │
                                                          ▼
                                               ┌─────────────────┐
                                               │  New Relic API  │
                                               └─────────────────┘
```

## Detailed Data Flow

### 1. Event Generation and Initial Processing

**Entry Point: VideoTracker**
```javascript
tracker.sendVideoAction("VideoEvent", { currentTime: 120.5 });
```

**Flow:**
1. **VideoTracker** receives the event and validates the input
2. **recordEvent.js** processes the event, adding timestamps and metadata
3. Event is enriched with session information, player state, and configuration data
4. Event is passed to the **PriorityEventBuffer** for queuing

### 2. Event Buffering and Prioritization

**PriorityEventBuffer (Unified FIFO System)**

The priority buffer uses a simplified First-In-First-Out (FIFO) approach:

```javascript
// All events are treated with equal priority
buffer: [] // Single unified queue

add(event) {
  this.buffer.push(event); // FIFO ordering
  this.updateStats();
}

drain() {
  const events = [...this.buffer]; // Get all events
  this.buffer = []; // Clear buffer
  return events;
}
```

**Key Features:**
- **Unified Processing:** No discrimination based on event type
- **FIFO Ordering:** Events processed in the order they arrive
- **Memory Management:** Automatic buffer size monitoring
- **Statistics Tracking:** Real-time buffer metrics

### 3. Harvest Scheduling and Orchestration

**HarvestScheduler - The Central Coordinator**

The HarvestScheduler manages when and how events are transmitted:

```javascript
// Adaptive scheduling algorithm
calculateNextInterval() {
  let interval = this.harvestCycle; // Base interval (default: 30s)
  
  if (this.consecutiveFailures > 0) {
    // Exponential backoff on failures
    interval *= Math.pow(1.5, this.consecutiveFailures);
  }
  
  return Math.min(interval, this.maxInterval);
}
```

**Harvest Trigger Conditions:**
1. **Time-based:** Regular intervals (configurable, default 30 seconds)
2. **Event-based:** Buffer size thresholds
3. **Page lifecycle:** Before page unload, visibility changes
4. **Manual:** Force harvest via API calls
5. **Error recovery:** Adaptive scheduling after failures

### 4. Event Processing and Chunking

**BaseHarvester - Shared Processing Logic**

When a harvest is triggered, events go through systematic processing:

```javascript
// Event chunking algorithm
chunkEvents(events, maxChunkSize) {
  const chunks = [];
  let currentChunk = [];
  
  for (const event of events) {
    // Size-based chunking
    if (this.calculateChunkSize(currentChunk) > maxChunkSize) {
      chunks.push(currentChunk);
      currentChunk = [event];
    } else {
      currentChunk.push(event);
    }
  }
  
  return chunks;
}
```

**Processing Steps:**
1. **Event Validation:** Ensure event integrity and completeness
2. **Chunking:** Split events into transmission-sized chunks
3. **Size Calculation:** Monitor payload size limits (64KB default)
4. **URL Generation:** Build harvest endpoint URLs with proper parameters
5. **Preparation:** Format events for API transmission

### 5. HTTP Transmission and Optimization

**OptimizedHttpClient - Reliable Transmission**

The HTTP client handles the actual API communication:

```javascript
// Request optimization and deduplication
send(requestOptions, callback) {
  const requestId = this.generateRequestId(requestOptions);
  
  // Prevent duplicate requests
  if (this.pendingRequests.has(requestId)) {
    return this.handleDuplicateRequest(requestId, callback);
  }
  
  // Execute with timeout and retry logic
  this.executeRequest(requestOptions, callback);
}
```

**Key Features:**
- **Request Deduplication:** Prevents duplicate API calls
- **Timeout Management:** Configurable request timeouts (30s default)
- **Concurrent Limiting:** Max 3 simultaneous requests
- **Performance Monitoring:** Request timing and success metrics

### 6. Error Handling and Dead Letter Processing

**DeadLetterHandler - Failure Recovery**

Failed events are not lost but systematically retried:

```javascript
// Exponential backoff retry strategy
processRetry() {
  const batch = this.getNextRetryBatch();
  
  for (const failedEvent of batch) {
    const delay = Math.min(
      this.baseRetryInterval * Math.pow(2, failedEvent.attempts),
      this.maxRetryDelay
    );
    
    setTimeout(() => this.retryEvent(failedEvent), delay);
  }
}
```

**Recovery Process:**
1. **Immediate Capture:** Failed events are immediately stored
2. **Exponential Backoff:** 5s → 10s → 20s → 30s retry intervals
3. **Persistent Storage:** Failed events saved to localStorage (optional)
4. **Retry Limits:** Maximum 3 retry attempts per event
5. **Final Handling:** Permanent storage or logging after max retries

## API Endpoint Structure

**Harvest URL Format:**
```
https://{beacon}/ins/1/{licenseKey}?{queryParams}
```

**Query Parameters:**
- `a`: Application ID
- `sa`: Sub-account ID
- `v`: Library version
- `t`: Transaction name
- `rst`: Request timestamp
- `ck`: Cookie flag
- `s`: Session identifier
- `ref`: Page reference URL
- `ptid`: Parent transaction ID
- `ca`: Category (VA = Video Analytics)

**Payload Structure:**
```json
{
  "body": {
    "ins": [
      {
        "eventType": "VideoAction",
        "timestamp": 1643723400000,
        "attributes": {
          "currentTime": 120.5,
          "duration": 300,
          "sessionId": "abc123",
          "playerId": "video-player-1"
        }
      }
    ]
  }
}
```

## Performance Monitoring and Metrics

The system continuously monitors performance across all components:

### Scheduler Metrics
- `harvestsCompleted`: Total harvests attempted
- `harvestsSuccessful`: Successful transmissions
- `harvestsFailed`: Failed transmissions
- `averageHarvestTime`: Mean harvest duration
- `totalEventsHarvested`: Total events processed
- `adaptiveAdjustments`: Timing adjustments made

### Buffer Metrics
- `totalEvents`: Current buffer size
- `eventsAdded`: Lifetime events added
- `eventsRemoved`: Lifetime events drained
- `peakBufferSize`: Maximum buffer size reached

### HTTP Metrics
- `requestsSent`: Total API requests
- `requestsSuccessful`: Successful requests
- `requestsFailed`: Failed requests
- `averageRequestTime`: Mean request duration
- `duplicatesPrevented`: Deduplicated requests

### Dead Letter Metrics
- `eventsStored`: Events in dead letter queue
- `eventsRetried`: Retry attempts made
- `eventsRecovered`: Successfully recovered events
- `permanentFailures`: Unrecoverable events

## Configuration and Tuning

### Key Configuration Options

```javascript
{
  videoAnalytics: {
    harvestCycleInMs: 30000,        // Base harvest interval
    maxEventsPerBatch: 100,         // Events per chunk
    maxPayloadSize: 64000,          // 64KB payload limit
    enableAdaptiveHarvesting: true,  // Dynamic scheduling
    enableEventDeduplication: true   // Prevent duplicate events
  },
  deadLetterQueue: {
    maxRetries: 3,                  // Retry attempts
    retryInterval: 5000,            // Base retry delay
    maxRetryDelay: 30000,           // Maximum retry delay
    persistToStorage: true          // localStorage persistence
  },
  httpOptimization: {
    timeout: 30000,                 // Request timeout
    maxConcurrentRequests: 3,       // Concurrent limit
    enableRequestDeduplication: true // Prevent duplicate requests
  }
}
```

### Performance Tuning Guidelines

1. **High-Volume Applications:**
   - Reduce `harvestCycleInMs` to 15-20 seconds
   - Increase `maxEventsPerBatch` to 150-200
   - Enable compression optimization

2. **Low-Bandwidth Environments:**
   - Increase `harvestCycleInMs` to 45-60 seconds
   - Reduce `maxPayloadSize` to 32KB
   - Enable adaptive harvesting

3. **Real-Time Applications:**
   - Set `harvestCycleInMs` to 10-15 seconds
   - Enable force harvest on critical events
   - Minimize retry delays

## Lifecycle Management

### Startup Sequence
1. Configuration validation and loading
2. Component initialization (buffers, handlers, clients)
3. Scheduler startup with initial interval
4. Page lifecycle event binding

### Runtime Operations
1. Continuous event processing and buffering
2. Periodic harvest cycles with adaptive timing
3. Error handling and retry processing
4. Performance monitoring and metrics collection

### Shutdown Sequence
1. Final harvest trigger on page unload
2. Pending request completion
3. Dead letter queue persistence
4. Resource cleanup and destruction

This enhanced data flow ensures reliable, efficient, and scalable video analytics collection while providing comprehensive error handling and performance monitoring.
