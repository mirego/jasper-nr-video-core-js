import Constants from "./constants";
import { BaseHarvester } from "./baseHarvester";
import Log from "./log";

const { INTERVAL } = Constants;

/**
 * Legacy harvester class for backward compatibility.
 * Extends BaseHarvester to eliminate code duplication.
 */
export class Harvester extends BaseHarvester {
  #started = false;
  #aggregate; // EventAggregator instance

  /**
   * @param {object} aggregate - The aggregator instance (e.g., EventAggregator).
   */
  constructor(aggregate) {
    super();
    this.#aggregate = aggregate;
    
    // Ensure any queued data is sent when the user navigates away.
    window.addEventListener("pagehide", () =>
      this.triggerHarvest({ isFinalHarvest: true })
    );
  }

  /**
   * Starts the periodic harvest timer.
   */
  startTimer() {
    if (this.#started) return;
    this.#started = true;
    
    const onHarvestInterval = () => {
      this.triggerHarvest({});
      if (this.#started) {
        setTimeout(onHarvestInterval, INTERVAL);
      }
    };
    
    setTimeout(onHarvestInterval, INTERVAL);
    Log.debug("Legacy harvester timer started", { interval: INTERVAL });
  }

  /**
   * Executes a harvest cycle by draining the queue and sending it in chunks.
   */
  triggerHarvest(options = {}) {
    if (this.#aggregate.isEmpty()) {
      Log.debug("Legacy harvest skipped - no events");
      return;
    }

    Log.debug("Starting legacy harvest cycle");

    // 1. Drain the entire queue to get all pending events.
    const allEvents = this.#aggregate.drain();

    // 2. Determine the correct size limit for this harvest.
    const maxChunkSize = this.getMaxChunkSize(options.isFinalHarvest);

    // 3. Split the events into chunks that respect size and count limits.
    const chunks = this.chunkEvents(allEvents, maxChunkSize);

    // 4. Send each chunk sequentially.
    chunks.forEach((chunk, index) => {
      const isLastChunk = index === chunks.length - 1;
      this.sendChunk(chunk, options, isLastChunk);
    });
  }

  /**
   * Sends a single chunk of events using the legacy approach.
   * @param {Array} chunk - Events to send
   * @param {object} options - Send options
   * @param {boolean} isLastChunk - Whether this is the last chunk
   */
  sendChunk(chunk, options, isLastChunk) {
    this.sendChunkLegacy(chunk, options, (result) => {
      this.#aggregate.postHarvestCleanup(result);
    });
  }
}
