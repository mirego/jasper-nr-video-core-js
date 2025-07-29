# Video Core JS - Enhanced Analytics System

## Overview

The Enhanced Video Analytics Harvesting System provides a comprehensive, configurable solution for collecting, processing, and transmitting video analytics data. It seamlessly integrates with the existing New Relic Video Core JS library while adding advanced features like priority-based event buffering, adaptive harvest scheduling, dead letter handling, and optimized HTTP transmission.

## Architecture

### Core Components

1. **VideoConfiguration** - Centralized configuration management
2. **PriorityEventBuffer** - Priority-based event queuing system
3. **DeadLetterHandler** - Failed event retry management
4. **OptimizedHttpClient** - Enhanced HTTP transmission with retry logic
5. **HarvestScheduler** - Adaptive scheduling and orchestration

### Integration Strategy

The system is designed to:
- **Maintain Backward Compatibility** - Existing APIs continue to work unchanged
- **Extend Existing Patterns** - Uses same module structure and coding conventions
- **Provide Migration Path** - Gradual adoption with feature flags
- **Enhance Performance** - Intelligent buffering and scheduling

## Configuration

### Basic Setup

```javascript
import nrvideo from '@newrelic/video-core';

// Basic configuration (backward compatible)
nrvideo.Core.addTracker(tracker, {
  info: {
    licenseKey: 'your-license-key',
    appName: 'your-app-name',
    region: 'US'
  }
});
```

### Enhanced Configuration

```javascript
// Enhanced configuration with video analytics features
nrvideo.setVideoConfig({
  // Required fields
  licenseKey: 'your-license-key',
  appName: 'your-app-name',
  region: 'US', // or 'EU', 'Stage', 'GOV'
  
  // Enhanced video analytics settings
  videoAnalytics: {
    enabled: true,
    harvestCycleInMs: 10000,
    maxEventsPerBatch: 1000,
    maxPayloadSize: 1000000,
    maxBeaconSize: 60000,
    priorityBufferSize: 100,
    deadLetterMaxRetries: 3,
    deadLetterRetryDelayMs: 5000,
    
    // Feature flags
    features: {
      priorityEventBuffer: true,
      deadLetterHandling: true,
      adaptiveHarvesting: true,
      performanceMonitoring: true,
      offlineSupport: false
    },
    
    // HTTP client configuration
    httpClient: {
      timeout: 30000,
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelayMs: 1000,
        maxDelayMs: 30000
      }
    },
    
    // Event processing
    eventProcessing: {
      enableBatching: true,
      enableDeduplication: true,
      maxQueueSize: 5000,
      flushOnPageHide: true
    }
  }
});
```

## Features

### Unified Event Buffer

All events are treated equally and processed in FIFO (First In, First Out) order, ensuring fair processing regardless of event type:

```javascript
// All events are treated with equal priority
nrvideo.recordEvent('VideoAction', {
  actionName: 'video_start',
  contentId: 'video-123'
});

nrvideo.recordEvent('VideoErrorAction', {
  actionName: 'playback_error',
  errorCode: 'NETWORK_TIMEOUT'
});

// Both events will be processed in the order they were received
```

### Adaptive Harvest Scheduling

The system automatically adjusts harvest frequency based on:
- Network conditions
- Consecutive failures
- Buffer fill rate
- Device performance

### Dead Letter Handling

Failed events are automatically:
- Queued for retry with exponential backoff
- Persisted across page reloads (if enabled)
- Eventually discarded after max retries
- Tracked with comprehensive metrics

### Optimized HTTP Client

Enhanced transmission features:
- Request deduplication
- Rate limiting
- Connection pooling
- Compression support (configurable)
- Performance monitoring

## API Reference

### Configuration Methods

```javascript
// Set complete configuration
nrvideo.setVideoConfig(config);

// Get current configuration
const config = nrvideo.getVideoConfig();

// Check feature status
const enabled = nrvideo.isFeatureEnabled('priorityEventBuffer');

// Set specific configuration value
nrvideo.setConfigValue('videoAnalytics.harvestCycleInMs', 15000);
```

### Event Recording

```javascript
// Standard event recording
nrvideo.recordEvent(eventType, attributes);

// Custom video events
nrvideo.recordCustomVideoEvent(actionName, customData);

// Core API (enhanced)
nrvideo.Core.send(eventType, actionName, data);
nrvideo.Core.sendCustom(actionName, data);
```

### Monitoring and Control

```javascript
// Get comprehensive metrics
const metrics = nrvideo.getMetrics();

// Force immediate harvest
const result = await nrvideo.forceHarvest();

// Reset metrics
nrvideo.Core.resetMetrics();
```

## Migration Guide

### From Standard to Enhanced System

1. **Phase 1: Enable Features Gradually**
   ```javascript
   // Start with basic priority buffering
   nrvideo.setVideoConfig({
     // ... existing config
     videoAnalytics: {
       features: {
         priorityEventBuffer: true,
         deadLetterHandling: false,
         adaptiveHarvesting: false
       }
     }
   });
   ```

2. **Phase 2: Add Dead Letter Handling**
   ```javascript
   // Enable retry logic
   videoAnalytics: {
     features: {
       priorityEventBuffer: true,
       deadLetterHandling: true,
       adaptiveHarvesting: false
     }
   }
   ```

3. **Phase 3: Full Enhanced System**
   ```javascript
   // Enable all features
   videoAnalytics: {
     features: {
       priorityEventBuffer: true,
       deadLetterHandling: true,
       adaptiveHarvesting: true,
       performanceMonitoring: true
     }
   }
   ```

### Backward Compatibility

All existing APIs continue to work:

```javascript
// These continue to work unchanged
nrvideo.Core.addTracker(tracker, options);
nrvideo.Core.send(eventType, actionName, data);
nrvideo.Core.sendError(attributes);
```

## Performance Monitoring

### Available Metrics

```javascript
const metrics = nrvideo.getMetrics();

console.log(metrics);
// Output:
{
  scheduler: {
    harvestsCompleted: 45,
    harvestsSuccessful: 43,
    harvestsFailed: 2,
    averageHarvestTime: 1250,
    totalEventsHarvested: 1834,
    adaptiveAdjustments: 3
  },
  buffer: {
    eventsAdded: 1834,
    eventsDropped: 0,
    eventsDrained: 1834,
    bufferOverflows: 0,
    totalEvents: 0,
    bufferSizes: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    }
  },
  deadLetter: {
    eventsReceived: 12,
    eventsRetried: 8,
    eventsDiscarded: 2,
    retriesSuccessful: 6,
    retriesFailed: 2,
    queueSize: 2
  },
  httpClient: {
    requestsSent: 45,
    requestsSuccessful: 43,
    requestsFailed: 2,
    averageResponseTime: 890,
    totalDataSent: 2456789,
    deduplicationCount: 3,
    pendingRequests: 0,
    queuedRequests: 0
  }
}
```

## Error Handling

### Built-in Error Recovery

The system automatically handles:
- Network failures
- Server errors (5xx)
- Rate limiting (429)
- Timeout errors
- Malformed responses

### Custom Error Handling

```javascript
// Monitor for system errors
window.addEventListener('nrvideo:error', (event) => {
  console.error('Video analytics error:', event.detail);
});

// Check system health
const metrics = nrvideo.getMetrics();
if (metrics.deadLetter.queueSize > 100) {
  console.warn('High number of failed events in dead letter queue');
}
```

## Best Practices

### Configuration

1. **Start Conservative**: Begin with default settings and adjust based on needs
2. **Monitor Metrics**: Regularly check performance metrics
3. **Tune for Your Use Case**: Adjust buffer sizes and intervals based on traffic

### Event Recording

1. **Use Appropriate Event Types**: Choose the correct event type for your use case
2. **Include Context**: Add relevant metadata to events
3. **Avoid Spam**: Don't record excessive low-value events
4. **FIFO Processing**: Remember that events are processed in the order they are received

### Performance

1. **Batch Events**: Let the system batch events naturally
2. **Monitor Buffer Health**: Watch for overflows or high retry rates
3. **Adjust Intervals**: Tune harvest cycles based on traffic patterns

## Troubleshooting

### Common Issues

**High Dead Letter Queue Size**
```javascript
const metrics = nrvideo.getMetrics();
if (metrics.deadLetter.queueSize > 50) {
  // Check network connectivity
  // Verify configuration
  // Consider increasing retry delays
}
```

**Buffer Overflows**
```javascript
if (metrics.buffer.bufferOverflows > 0) {
  // Increase buffer size
  // Reduce harvest interval
  // Check for event spam
}
```

**High Failure Rate**
```javascript
const failureRate = metrics.httpClient.requestsFailed / metrics.httpClient.requestsSent;
if (failureRate > 0.1) {
  // Check endpoint configuration
  // Verify network connectivity
  // Review retry policy settings
}
```

### Debug Mode

```javascript
// Enable debug logging
nrvideo.setVideoConfig({
  // ... other config
  videoAnalytics: {
    debugMode: true
  }
});

// View detailed logs in console
```

## Examples

### Basic Video Player Integration

```javascript
import nrvideo from '@newrelic/video-core';

// Initialize with enhanced analytics
nrvideo.setVideoConfig({
  licenseKey: 'your-license-key',
  appName: 'video-player-app',
  region: 'US',
  videoAnalytics: {
    features: {
      priorityEventBuffer: true,
      deadLetterHandling: true,
      adaptiveHarvesting: true
    }
  }
});

// Create tracker
const tracker = new nrvideo.VideoTracker();

// Add to core system
nrvideo.Core.addTracker(tracker, {
  info: {
    licenseKey: 'your-license-key',
    appName: 'video-player-app',
    region: 'US'
  }
});

// Record video events without priority discrimination
player.on('play', () => {
  nrvideo.recordEvent('VideoAction', {
    actionName: 'video_play',
    contentId: player.getContentId(),
    position: player.getCurrentTime()
  });
});

player.on('error', (error) => {
  nrvideo.recordEvent('VideoErrorAction', {
    actionName: 'playback_error',
    errorCode: error.code,
    errorMessage: error.message,
    contentId: player.getContentId()
  });
});
```

### Custom Analytics Integration

```javascript
// Record custom business metrics
function recordViewership(viewerCount, contentId) {
  nrvideo.recordCustomVideoEvent('viewership_update', {
    viewerCount,
    contentId,
    timestamp: Date.now()
  });
}

// Record quality metrics
function recordQualityChange(newQuality, oldQuality) {
  nrvideo.recordEvent('VideoAction', {
    actionName: 'quality_change',
    newBitrate: newQuality.bitrate,
    oldBitrate: oldQuality.bitrate,
    reason: 'adaptive'
  });
}
```

## Support

For issues, questions, or feature requests:
- Check the troubleshooting guide above
- Review configuration and metrics
- Contact New Relic support with relevant metrics data
