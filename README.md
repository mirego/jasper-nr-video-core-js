[![Community Project header](https://github.com/newrelic/open-source-office/raw/master/examples/categories/images/Community_Project.png)](https://github.com/newrelic/open-source-office/blob/master/examples/categories/index.md#community-project)

# New Relic Video Core - JavaScript

The New Relic video tracking core library is the base for all video trackers in the browser platform. It contains the classes and core mechanisms used by the player specific trackers.
It segregates the events into different event types based on action, such as video-related events going to `VideoAction`, ad-related events to `VideoAdAction`, errors to `VideoErrorAction`, and custom actions to `VideoCustomAction`.

## Build

Install dependencies:

```
$ npm install
```

And build:

```
$ npm run build:dev
```

Or if you need a production build:

```
$ npm run build
```

## Usage

Add **scripts** inside `dist` folder to your page.

> If you want to know how to generate `dist` folder, refer to **npm commands** section.

### Enhanced Video Analytics (Recommended)

The enhanced video analytics system is **enabled by default** and provides improved data collection, adaptive harvesting, and robust error handling.

#### Simple Usage

```javascript
import { VideoTracker } from 'nrvideo';

// Basic usage - enhanced analytics enabled automatically
const tracker = new VideoTracker(player);

// The system automatically:
// ✅ Enables enhanced harvesting
// ✅ Starts the harvest scheduler
// ✅ Uses smart default configuration
// ✅ Handles all event buffering and transmission
```

#### Custom Configuration

You can override specific settings while keeping sensible defaults:

```javascript
// Override only what you need - defaults are used for everything else
const tracker = new VideoTracker(player, {
  videoAnalytics: {
    harvestCycleInMs: 20000, // Change to 20 seconds (default: 30s)
    maxEventsPerBatch: 150,  // Change batch size (default: 100)
  },
  deadLetterQueue: {
    maxRetries: 5,           // More retries (default: 3)
  }
});

// Alternative: Configure globally then create tracker
import { setVideoConfig } from 'nrvideo';

setVideoConfig({
  videoAnalytics: {
    harvestCycleInMs: 15000, // 15 seconds
    enableAdaptiveHarvesting: false, // Disable adaptive timing
  }
});

const tracker = new VideoTracker(player);
```

#### Disable Enhanced Analytics

If you need to use legacy mode:

```javascript
// Disable enhanced analytics entirely
const tracker = new VideoTracker(player, {
  useEnhancedHarvesting: false
});
```

#### Advanced Usage

```javascript
// Access enhanced features
const metrics = tracker.getAnalyticsMetrics();
console.log('Buffer size:', metrics.buffer.totalEvents);
console.log('Success rate:', metrics.scheduler.harvestsSuccessful);

// Force immediate transmission
await tracker.forceHarvest();

// Adjust harvest timing
tracker.setHarvestInterval(10000); // 10 seconds

// Check if enhanced analytics is active
if (tracker.isEnhancedAnalyticsEnabled()) {
  console.log('Enhanced analytics is running');
}
```

#### Sending Events

The enhanced system automatically handles event buffering, chunking, and transmission:

```javascript
// All events are automatically enhanced and buffered
tracker.sendVideoAction("VideoEvent", { 
  currentTime: 120.5,
  duration: 300,
  playbackRate: 1.0 
});

tracker.sendVideoAdAction("AdEvent", { 
  adType: "preroll",
  adDuration: 30,
  adPosition: "start"
});

tracker.sendVideoErrorAction("ErrorEvent", { 
  errorCode: "PLAYBACK_ERROR",
  errorMessage: "Failed to load video",
  timestamp: Date.now()
});

tracker.sendVideoCustomAction("CustomEvent", { 
  customMetric: "user_engagement",
  value: 85.7
});

// Events are automatically:
// ✅ Buffered in FIFO order
// ✅ Chunked for optimal transmission
// ✅ Retried on failure with exponential backoff
// ✅ Monitored for performance metrics
// ✅ Transmitted at optimal intervals
```

### Legacy Basic Usage

For backward compatibility, the basic tracker interface is still supported:

```javascript
var tracker = new VideoTracker(player);

tracker.sendVideoAction("VideoEvent", { data: 1 });
tracker.sendVideoAdAction("AdEvent", { data: "test-1" });
tracker.sendVideoErrorAction("ErrorEvent", { data: "error-test" });
tracker.sendVideoCustomAction("CustomEvent", { data: "custom-test" });
```

## Data Model

To understand which actions and attributes are captured and emitted by the tracker under different event types, see [DataModel.md](DATAMODEL.md).

For detailed information about the enhanced video analytics data flow, processing, and API interactions, see [Enhanced Data Flow Documentation](ENHANCED_DATA_FLOW.md).

## Documentation

All classes are documented using autodocs. The documents, generated with [jsdoc](https://github.com/jsdoc/jsdoc), can be found in the `documentation` directory of the current repo.

# Support

New Relic has open-sourced this project. This project is provided AS-IS WITHOUT WARRANTY OR DEDICATED SUPPORT. Issues and contributions should be reported to the project here on GitHub.

We encourage you to bring your experiences and questions to the [Explorers Hub](https://discuss.newrelic.com) where our community members collaborate on solutions and new ideas.

## Community

New Relic hosts and moderates an online forum where customers can interact with New Relic employees as well as other customers to get help and share best practices. Like all official New Relic open source projects, there's a related Community topic in the New Relic Explorers Hub. You can find this project's topic/threads here:

https://discuss.newrelic.com/t/video-core-js-tracker/100303

## Issues / enhancement requests

Issues and enhancement requests can be submitted in the [Issues tab of this repository](../../issues). Please search for and review the existing open issues before submitting a new issue.

# Contributing

Contributions are encouraged! If you submit an enhancement request, we'll invite you to contribute the change yourself. Please review our [Contributors Guide](CONTRIBUTING.md).

Keep in mind that when you submit your pull request, you'll need to sign the CLA via the click-through using CLA-Assistant. If you'd like to execute our corporate CLA, or if you have any questions, please drop us an email at opensource+videoagent@newrelic.com.

# License

This project is distributed under the [Apache 2.0](https://apache.org/licenses/LICENSE-2.0.txt) License.

The video-core also uses source code from third-party libraries. Full details on which libraries are used and the terms under which they are licensed can be found in the [third-party notices document](THIRD_PARTY_NOTICES.md).
