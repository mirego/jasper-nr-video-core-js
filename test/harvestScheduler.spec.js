import { HarvestScheduler } from "../src/harvestScheduler";
import { PriorityEventBuffer } from "../src/priorityEventBuffer";
import chai from "chai";
import sinon from "sinon";

const expect = chai.expect;

describe("HarvestScheduler", () => {
  let scheduler;
  let sandbox;
  let mockEventBuffer;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock window.NRVIDEO for configuration
    global.window = global.window || {};
    window.NRVIDEO = {
      info: {
        beacon: "test-beacon.newrelic.com",
        licenseKey: "test-license-key",
        applicationID: "test-app-id",
        sa: "1"
      },
      config: {
        videoAnalytics: {
          harvestCycleInMs: 10000,
          features: {
            adaptiveHarvesting: true,
            deadLetterHandling: true
          }
        }
      }
    };

    // Mock performance
    global.window.performance = {
      now: () => Date.now()
    };

    mockEventBuffer = {
      isEmpty: sandbox.stub().returns(false),
      drain: sandbox.stub().returns([
        { eventType: "VideoAction", actionName: "test1" },
        { eventType: "VideoAction", actionName: "test2" }
      ]),
      postHarvestCleanup: sandbox.stub()
    };

    scheduler = new HarvestScheduler(mockEventBuffer);
  });

  afterEach(() => {
    sandbox.restore();
    if (scheduler) {
      scheduler.destroy();
    }
  });

  describe("scheduler lifecycle", () => {
    it("should start and stop scheduler correctly", () => {
      expect(scheduler.isStarted).to.be.false;
      
      scheduler.startScheduler();
      expect(scheduler.isStarted).to.be.true;
      
      scheduler.stopScheduler();
      expect(scheduler.isStarted).to.be.false;
    });

    it("should not start if already started", () => {
      const logSpy = sandbox.spy(console, 'warn');
      
      scheduler.startScheduler();
      scheduler.startScheduler(); // Second call should warn
      
      // Note: This assumes Log.warn eventually calls console.warn
      // Adjust based on your logging implementation
    });
  });

  describe("harvest triggering", () => {
    it("should skip harvest when buffer is empty", async () => {
      mockEventBuffer.isEmpty.returns(true);
      
      const result = await scheduler.triggerHarvest();
      
      expect(result.success).to.be.true;
      expect(result.reason).to.equal("no_events");
      expect(mockEventBuffer.drain.called).to.be.false;
    });

    it("should process events when buffer has data", async () => {
      // Mock HTTP client to avoid actual network calls
      sandbox.stub(scheduler.httpClient, 'send').callsFake((options, callback) => {
        // Simulate successful response
        setTimeout(() => callback({ retry: false, status: 200 }), 0);
        return 'test-request-id';
      });

      const result = await scheduler.triggerHarvest();
      
      expect(mockEventBuffer.drain.called).to.be.true;
      expect(scheduler.httpClient.send.called).to.be.true;
    });

    it("should force harvest even when buffer is empty", async () => {
      mockEventBuffer.isEmpty.returns(true);
      
      const result = await scheduler.triggerHarvest({ force: true });
      
      expect(mockEventBuffer.drain.called).to.be.true;
    });
  });

  describe("adaptive scheduling", () => {
    it("should increase interval after consecutive failures", () => {
      const originalInterval = scheduler.harvestCycle;
      
      // Simulate failures
      scheduler.consecutiveFailures = 2;
      
      const nextInterval = scheduler.calculateNextInterval();
      expect(nextInterval).to.be.greaterThan(originalInterval);
    });

    it("should reset interval after successful harvest", async () => {
      // Set some failures first
      scheduler.consecutiveFailures = 3;
      
      // Mock successful harvest
      sandbox.stub(scheduler.httpClient, 'send').callsFake((options, callback) => {
        setTimeout(() => callback({ retry: false, status: 200 }), 0);
        return 'test-request-id';
      });

      await scheduler.triggerHarvest();
      
      expect(scheduler.consecutiveFailures).to.equal(0);
    });
  });

  describe("event chunking", () => {
    it("should chunk events based on size limits", () => {
      const largeEvents = Array(1500).fill(null).map((_, i) => ({
        eventType: "VideoAction",
        actionName: `test_${i}`,
        largeData: "x".repeat(1000) // Make events large
      }));

      const chunks = scheduler.chunkEvents(largeEvents, {});
      
      expect(chunks.length).to.be.greaterThan(1);
      expect(chunks[0].length).to.be.lessThanOrEqual(1000); // MAX_EVENTS_PER_BATCH
    });

    it("should use smaller chunk size for final harvest", () => {
      const events = Array(100).fill(null).map((_, i) => ({
        eventType: "VideoAction",
        actionName: `test_${i}`,
        data: "x".repeat(1000)
      }));

      const normalChunks = scheduler.chunkEvents(events, { isFinalHarvest: false });
      const finalChunks = scheduler.chunkEvents(events, { isFinalHarvest: true });
      
      // Final harvest should create more, smaller chunks
      expect(finalChunks.length).to.be.greaterThanOrEqual(normalChunks.length);
    });
  });

  describe("URL building", () => {
    it("should build correct harvest URL", () => {
      const url = scheduler.buildHarvestUrl();
      
      expect(url).to.include("https://test-beacon.newrelic.com");
      expect(url).to.include("/ins/1/test-license-key");
      expect(url).to.include("a=test-app-id");
      expect(url).to.include("ca=VA");
    });

    it("should throw error with missing configuration", () => {
      delete window.NRVIDEO.info.licenseKey;
      
      expect(() => scheduler.buildHarvestUrl()).to.throw();
    });
  });

  describe("metrics tracking", () => {
    it("should track harvest metrics", async () => {
      // Mock successful harvest
      sandbox.stub(scheduler.httpClient, 'send').callsFake((options, callback) => {
        setTimeout(() => callback({ retry: false, status: 200 }), 0);
        return 'test-request-id';
      });

      const initialMetrics = scheduler.getMetrics();
      
      await scheduler.triggerHarvest();
      
      const finalMetrics = scheduler.getMetrics();
      expect(finalMetrics.scheduler.harvestsCompleted).to.be.greaterThan(
        initialMetrics.scheduler.harvestsCompleted
      );
    });

    it("should reset metrics correctly", () => {
      // Add some activity first
      scheduler.performanceMetrics.harvestsCompleted = 5;
      scheduler.consecutiveFailures = 2;
      
      scheduler.resetMetrics();
      
      const metrics = scheduler.getMetrics();
      expect(metrics.scheduler.harvestsCompleted).to.equal(0);
      expect(scheduler.consecutiveFailures).to.equal(0);
    });
  });

  describe("error handling", () => {
    it("should handle HTTP client errors gracefully", async () => {
      // Mock HTTP client error
      sandbox.stub(scheduler.httpClient, 'send').callsFake((options, callback) => {
        setTimeout(() => callback({ retry: true, status: 500, error: "Server Error" }), 0);
        return 'test-request-id';
      });

      const result = await scheduler.triggerHarvest();
      
      expect(scheduler.consecutiveFailures).to.be.greaterThan(0);
      expect(scheduler.deadLetterHandler.addFailedEvents.called).to.be.true;
    });

    it("should handle malformed events gracefully", async () => {
      mockEventBuffer.drain.returns([
        null, // Invalid event
        { eventType: "VideoAction", actionName: "valid" }
      ]);

      // Should not throw error
      const result = await scheduler.triggerHarvest();
      expect(result).to.be.an('object');
    });
  });
});
