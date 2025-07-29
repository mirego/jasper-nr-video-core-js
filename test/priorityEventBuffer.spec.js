import { PriorityEventBuffer } from "../src/priorityEventBuffer";
import chai from "chai";
import sinon from "sinon";

const expect = chai.expect;

describe("PriorityEventBuffer", () => {
  let buffer;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock window.NRVIDEO for configuration
    global.window = global.window || {};
    window.NRVIDEO = {
      config: {
        videoAnalytics: {
          priorityBufferSize: 100,
          features: {
            priorityEventBuffer: true
          }
        }
      }
    };

    buffer = new PriorityEventBuffer();
  });

  afterEach(() => {
    sandbox.restore();
    buffer.clear();
  });

  describe("basic functionality", () => {
    it("should start empty", () => {
      expect(buffer.isEmpty()).to.be.true;
      expect(buffer.size()).to.equal(0);
    });

    it("should add events to the unified buffer", () => {
      const errorEvent = {
        eventType: "VideoErrorAction",
        actionName: "playback_error",
        timestamp: Date.now()
      };

      const videoEvent = {
        eventType: "VideoAction",
        actionName: "video_start",
        timestamp: Date.now()
      };

      expect(buffer.add(errorEvent)).to.be.true;
      expect(buffer.add(videoEvent)).to.be.true;
      expect(buffer.size()).to.equal(2);
    });

    it("should drain events in FIFO order", () => {
      // Add events in specific order
      buffer.add({ eventType: "VideoCustomAction", actionName: "first_event" });
      buffer.add({ eventType: "VideoErrorAction", actionName: "second_event" });
      buffer.add({ eventType: "VideoAction", actionName: "third_event" });

      const events = buffer.drain();
      
      expect(events).to.have.length(3);
      expect(events[0].actionName).to.equal("first_event");  // First in
      expect(events[1].actionName).to.equal("second_event"); // Second in
      expect(events[2].actionName).to.equal("third_event");  // Third in
    });
  });

  describe("event handling", () => {
    it("should treat all events equally regardless of type", () => {
      const errorEvent = { eventType: "VideoErrorAction", actionName: "error_event" };
      const videoEvent = { eventType: "VideoAction", actionName: "video_event" };
      const customEvent = { eventType: "VideoCustomAction", actionName: "custom_event" };

      buffer.add(errorEvent);
      buffer.add(videoEvent);
      buffer.add(customEvent);
      
      const bufferSizes = buffer.getBufferSizes();
      expect(bufferSizes.total).to.equal(3);
    });

    it("should accept explicit priority but not use it for ordering", () => {
      const event = { eventType: "VideoCustomAction", actionName: "test" };
      const result = buffer.add(event, "critical");
      
      expect(result).to.be.true;
      expect(buffer.size()).to.equal(1);
      
      const drained = buffer.drain();
      expect(drained[0].priority).to.equal("critical");
    });

    it("should maintain FIFO order regardless of event type", () => {
      // Add different event types in specific order
      buffer.add({ eventType: "VideoCustomAction", actionName: "first" });
      buffer.add({ eventType: "VideoErrorAction", actionName: "second" });
      buffer.add({ eventType: "VideoAction", actionName: "third" });
      buffer.add({ eventType: "VideoAdAction", actionName: "fourth" });

      const events = buffer.drain();
      
      expect(events[0].actionName).to.equal("first");
      expect(events[1].actionName).to.equal("second");
      expect(events[2].actionName).to.equal("third");
      expect(events[3].actionName).to.equal("fourth");
    });
  });

  describe("buffer management", () => {
    it("should drop oldest events when buffer is full", () => {
      // Fill buffer to capacity
      for (let i = 0; i < 100; i++) {
        buffer.add({ 
          eventType: "VideoCustomAction", 
          actionName: `event_${i}` 
        });
      }

      expect(buffer.size()).to.equal(100);

      // Add one more event - should drop the oldest (first) event
      buffer.add({ 
        eventType: "VideoErrorAction", 
        actionName: "newest_event" 
      });

      expect(buffer.size()).to.equal(100);
      
      const stats = buffer.getStats();
      expect(stats.eventsDropped).to.equal(1);

      // Verify the newest event is in the buffer and oldest is gone
      const events = buffer.drain();
      expect(events[events.length - 1].actionName).to.equal("newest_event");
      expect(events[0].actionName).to.equal("event_1"); // event_0 was dropped
    });

    it("should handle retry events correctly by adding them to front", () => {
      // Add some regular events first
      buffer.add({ eventType: "VideoAction", actionName: "regular1" });
      buffer.add({ eventType: "VideoAction", actionName: "regular2" });

      const retryEvents = [
        { eventType: "VideoAction", actionName: "retry1" },
        { eventType: "VideoErrorAction", actionName: "retry2" }
      ];

      buffer.retryEvents(retryEvents);
      
      expect(buffer.size()).to.equal(4);
      
      const drained = buffer.drain();
      // Retry events should be at the front
      expect(drained[0].actionName).to.equal("retry1");
      expect(drained[1].actionName).to.equal("retry2");
      expect(drained[2].actionName).to.equal("regular1");
      expect(drained[3].actionName).to.equal("regular2");
    });
  });

  describe("statistics", () => {
    it("should track events added and drained", () => {
      buffer.add({ eventType: "VideoAction", actionName: "test1" });
      buffer.add({ eventType: "VideoAction", actionName: "test2" });
      
      const stats1 = buffer.getStats();
      expect(stats1.eventsAdded).to.equal(2);
      expect(stats1.eventsDrained).to.equal(0);

      buffer.drain();
      
      const stats2 = buffer.getStats();
      expect(stats2.eventsDrained).to.equal(2);
    });

    it("should reset statistics", () => {
      buffer.add({ eventType: "VideoAction", actionName: "test" });
      buffer.drain();
      
      buffer.resetStats();
      
      const stats = buffer.getStats();
      expect(stats.eventsAdded).to.equal(0);
      expect(stats.eventsDrained).to.equal(0);
    });
  });

  describe("peek functionality", () => {
    it("should return events without removing them", () => {
      buffer.add({ eventType: "VideoAction", actionName: "test1" });
      buffer.add({ eventType: "VideoErrorAction", actionName: "test2" });
      
      const peeked = buffer.peek(5);
      expect(peeked).to.have.length(2);
      expect(buffer.size()).to.equal(2); // Events still in buffer
      
      const drained = buffer.drain();
      expect(drained).to.have.length(2);
      expect(drained[0].actionName).to.equal("test1"); // FIFO order
      expect(drained[1].actionName).to.equal("test2");
    });
  });

  describe("feature flag handling", () => {
    it("should respect feature flag when disabled", () => {
      window.NRVIDEO.config.videoAnalytics.features.priorityEventBuffer = false;
      
      const result = buffer.add({ eventType: "VideoAction", actionName: "test" });
      expect(result).to.be.false;
      expect(buffer.size()).to.equal(0);
    });
  });
});
