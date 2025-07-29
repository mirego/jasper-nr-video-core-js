import { getConfigValue } from "./videoConfiguration";
import Log from "./log";

/**
 * Optimized HTTP client for video analytics data transmission with
 * retry logic, request deduplication, and performance monitoring.
 */
export class OptimizedHttpClient {
  constructor() {
    this.config = this.loadConfiguration();
    this.pendingRequests = new Map();
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.rateLimitState = {
      requests: 0,
      resetTime: Date.now() + 60000 // Reset every minute
    };
    
    // Performance metrics
    this.metrics = {
      requestsSent: 0,
      requestsSuccessful: 0,
      requestsFailed: 0,
      averageResponseTime: 0,
      totalDataSent: 0,
      retryCount: 0,
      deduplicationCount: 0
    };

    // Request deduplication cache
    this.requestCache = new Map();
    this.cacheCleanupInterval = setInterval(() => this.cleanupCache(), 60000);

    // Bind methods
    this.processQueue = this.processQueue.bind(this);
  }

  /**
   * Loads HTTP client configuration from video configuration.
   * @returns {object} HTTP client configuration
   * @private
   */
  loadConfiguration() {
    return {
      timeout: getConfigValue('videoAnalytics.httpClient.timeout') || 30000,
      maxRetries: getConfigValue('videoAnalytics.httpClient.retryPolicy.maxRetries') || 3,
      backoffMultiplier: getConfigValue('videoAnalytics.httpClient.retryPolicy.backoffMultiplier') || 2,
      initialDelayMs: getConfigValue('videoAnalytics.httpClient.retryPolicy.initialDelayMs') || 1000,
      maxDelayMs: getConfigValue('videoAnalytics.httpClient.retryPolicy.maxDelayMs') || 30000,
      headers: getConfigValue('videoAnalytics.httpClient.headers') || {
        'Content-Type': 'text/plain',
        'User-Agent': 'NewRelic-VideoCore-JS'
      },
      maxConcurrentRequests: 3,
      rateLimitPerMinute: 60,
      enableDeduplication: getConfigValue('videoAnalytics.eventProcessing.enableDeduplication') || true,
      enableCompression: getConfigValue('videoAnalytics.eventProcessing.enableCompression') || false
    };
  }

  /**
   * Sends data to the specified URL with retry logic and performance monitoring.
   * @param {object} requestOptions - Request configuration
   * @param {string} requestOptions.url - Target URL
   * @param {object} requestOptions.payload - Request payload
   * @param {object} requestOptions.options - Additional options
   * @param {Function} callback - Callback function for handling response
   * @returns {Promise<string>} Request ID for tracking
   */
  async send(requestOptions, callback) {
    const requestId = this.generateRequestId();
    const { url, payload, options = {} } = requestOptions;

    try {
      // Validate input
      if (!url || !payload) {
        throw new Error('URL and payload are required');
      }

      // Check for duplicate requests
      if (this.config.enableDeduplication && this.isDuplicateRequest(payload)) {
        Log.debug(`Duplicate request detected, skipping`, { requestId });
        this.metrics.deduplicationCount++;
        callback({ retry: false, status: 200, cached: true });
        return requestId;
      }

      // Create request object
      const request = {
        id: requestId,
        url,
        payload,
        options,
        callback,
        retryCount: 0,
        timestamp: Date.now(),
        size: this.calculatePayloadSize(payload)
      };

      // Check rate limiting
      if (this.isRateLimited()) {
        Log.warn('Rate limit exceeded, queueing request', { requestId });
        this.queueRequest(request);
        return requestId;
      }

      // Execute request immediately or queue it
      if (this.pendingRequests.size < this.config.maxConcurrentRequests) {
        await this.executeRequest(request);
      } else {
        this.queueRequest(request);
      }

      return requestId;

    } catch (error) {
      Log.error(`Failed to send request ${requestId}:`, error.message);
      callback({ retry: false, status: 0, error: error.message });
      return requestId;
    }
  }

  /**
   * Executes an HTTP request with timeout and error handling.
   * @param {object} request - Request object
   * @private
   */
  async executeRequest(request) {
    const { id, url, payload, options, callback } = request;
    const startTime = Date.now();

    try {
      this.pendingRequests.set(id, request);
      this.updateRateLimit();
      this.metrics.requestsSent++;

      Log.debug(`Executing HTTP request ${id}`, {
        url,
        payloadSize: request.size,
        retryCount: request.retryCount
      });

      // Prepare request body
      const body = this.prepareRequestBody(payload);

      // Handle final harvest with sendBeacon
      if (options.isFinalHarvest && navigator.sendBeacon) {
        const success = await this.sendWithBeacon(url, body);
        this.handleRequestComplete(request, { success, status: success ? 200 : 0 }, startTime);
        return;
      }

      // Use fetch with timeout
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        body,
        headers: this.config.headers,
        keepalive: options.isFinalHarvest
      }, this.config.timeout);

      const result = {
        success: response.ok,
        status: response.status,
        statusText: response.statusText
      };

      this.handleRequestComplete(request, result, startTime);

    } catch (error) {
      const result = {
        success: false,
        status: 0,
        error: error.message
      };

      this.handleRequestComplete(request, result, startTime);
    }
  }

  /**
   * Handles request completion and determines retry strategy.
   * @param {object} request - Request object
   * @param {object} result - Request result
   * @param {number} startTime - Request start timestamp
   * @private
   */
  handleRequestComplete(request, result, startTime) {
    const { id, callback } = request;
    const duration = Date.now() - startTime;

    // Update metrics
    this.updateMetrics(request, result, duration);

    // Remove from pending requests
    this.pendingRequests.delete(id);

    // Determine if retry is needed
    const shouldRetry = this.shouldRetryRequest(result, request);

    if (shouldRetry && request.retryCount < this.config.maxRetries) {
      this.scheduleRetry(request);
    } else {
      // Request complete (success or max retries reached)
      if (result.success) {
        this.cacheRequest(request.payload);
      }

      callback({
        retry: shouldRetry && request.retryCount >= this.config.maxRetries,
        status: result.status,
        error: result.error
      });

      Log.debug(`Request ${id} completed`, {
        success: result.success,
        status: result.status,
        duration,
        retryCount: request.retryCount
      });
    }

    // Process next queued request
    this.processQueue();
  }

  /**
   * Schedules a retry for a failed request with exponential backoff.
   * @param {object} request - Request to retry
   * @private
   */
  scheduleRetry(request) {
    request.retryCount++;
    this.metrics.retryCount++;

    const delay = this.calculateRetryDelay(request.retryCount);

    Log.debug(`Scheduling retry ${request.retryCount} for request ${request.id}`, {
      delayMs: delay
    });

    setTimeout(() => {
      this.executeRequest(request);
    }, delay);
  }

  /**
   * Calculates retry delay with exponential backoff and jitter.
   * @param {number} retryCount - Current retry count
   * @returns {number} Delay in milliseconds
   * @private
   */
  calculateRetryDelay(retryCount) {
    const { backoffMultiplier, initialDelayMs, maxDelayMs } = this.config;
    
    // Exponential backoff
    const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, retryCount - 1);
    
    // Apply maximum delay limit
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
    
    // Add jitter (±25%)
    const jitter = cappedDelay * 0.25 * (Math.random() - 0.5);
    
    return Math.max(cappedDelay + jitter, initialDelayMs);
  }

  /**
   * Determines if a request should be retried based on the result.
   * @param {object} result - Request result
   * @param {object} request - Request object
   * @returns {boolean} True if should retry
   * @private
   */
  shouldRetryRequest(result, request) {
    // Don't retry if successful
    if (result.success) {
      return false;
    }

    // Network errors should be retried
    if (result.status === 0) {
      return true;
    }

    // Specific HTTP status codes that should be retried
    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    return retryableStatuses.includes(result.status);
  }

  /**
   * Queues a request for later processing.
   * @param {object} request - Request to queue
   * @private
   */
  queueRequest(request) {
    this.requestQueue.push(request);
    Log.debug(`Request ${request.id} queued`, {
      queueSize: this.requestQueue.length
    });
  }

  /**
   * Processes the request queue.
   * @private
   */
  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    if (this.pendingRequests.size >= this.config.maxConcurrentRequests) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (
        this.requestQueue.length > 0 && 
        this.pendingRequests.size < this.config.maxConcurrentRequests &&
        !this.isRateLimited()
      ) {
        const request = this.requestQueue.shift();
        await this.executeRequest(request);
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Sends data using navigator.sendBeacon for final harvests.
   * @param {string} url - Target URL
   * @param {string} body - Request body
   * @returns {Promise<boolean>} True if successful
   * @private
   */
  async sendWithBeacon(url, body) {
    try {
      return navigator.sendBeacon(url, body);
    } catch (error) {
      Log.warn('sendBeacon failed, falling back to fetch:', error.message);
      return false;
    }
  }

  /**
   * Fetch with timeout implementation.
   * @param {string} url - Target URL
   * @param {object} options - Fetch options
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Response>} Fetch response
   * @private
   */
  async fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Prepares the request body, optionally applying compression.
   * @param {object} payload - Payload to prepare
   * @returns {string} Prepared body
   * @private
   */
  prepareRequestBody(payload) {
    const body = JSON.stringify(payload.body);
    
    // TODO: Implement compression if enabled
    if (this.config.enableCompression) {
      // Compression implementation would go here
      Log.debug('Compression is enabled but not yet implemented');
    }

    return body;
  }

  /**
   * Calculates the size of a payload in bytes.
   * @param {object} payload - Payload to measure
   * @returns {number} Size in bytes
   * @private
   */
  calculatePayloadSize(payload) {
    return new Blob([JSON.stringify(payload)]).size;
  }

  /**
   * Checks if a request is a duplicate.
   * @param {object} payload - Payload to check
   * @returns {boolean} True if duplicate
   * @private
   */
  isDuplicateRequest(payload) {
    const hash = this.generatePayloadHash(payload);
    return this.requestCache.has(hash);
  }

  /**
   * Caches a request payload to prevent duplicates.
   * @param {object} payload - Payload to cache
   * @private
   */
  cacheRequest(payload) {
    const hash = this.generatePayloadHash(payload);
    this.requestCache.set(hash, Date.now());
  }

  /**
   * Generates a hash for payload deduplication.
   * @param {object} payload - Payload to hash
   * @returns {string} Hash string
   * @private
   */
  generatePayloadHash(payload) {
    // Simple hash based on payload content
    const str = JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Checks if rate limiting is active.
   * @returns {boolean} True if rate limited
   * @private
   */
  isRateLimited() {
    const now = Date.now();
    
    // Reset rate limit window if needed
    if (now >= this.rateLimitState.resetTime) {
      this.rateLimitState.requests = 0;
      this.rateLimitState.resetTime = now + 60000;
    }

    return this.rateLimitState.requests >= this.config.rateLimitPerMinute;
  }

  /**
   * Updates rate limit state.
   * @private
   */
  updateRateLimit() {
    this.rateLimitState.requests++;
  }

  /**
   * Updates performance metrics.
   * @param {object} request - Request object
   * @param {object} result - Request result
   * @param {number} duration - Request duration
   * @private
   */
  updateMetrics(request, result, duration) {
    if (result.success) {
      this.metrics.requestsSuccessful++;
    } else {
      this.metrics.requestsFailed++;
    }

    this.metrics.totalDataSent += request.size;

    // Update average response time
    const totalRequests = this.metrics.requestsSuccessful + this.metrics.requestsFailed;
    const currentAverage = this.metrics.averageResponseTime;
    this.metrics.averageResponseTime = 
      ((currentAverage * (totalRequests - 1)) + duration) / totalRequests;
  }

  /**
   * Cleans up old entries from the request cache.
   * @private
   */
  cleanupCache() {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes

    for (const [hash, timestamp] of this.requestCache.entries()) {
      if (now - timestamp > maxAge) {
        this.requestCache.delete(hash);
      }
    }
  }

  /**
   * Generates a unique request ID.
   * @returns {string} Request ID
   * @private
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets current performance metrics.
   * @returns {object} Metrics object
   */
  getMetrics() {
    return {
      ...this.metrics,
      pendingRequests: this.pendingRequests.size,
      queuedRequests: this.requestQueue.length,
      cacheSize: this.requestCache.size,
      rateLimitState: { ...this.rateLimitState }
    };
  }

  /**
   * Resets performance metrics.
   */
  resetMetrics() {
    this.metrics = {
      requestsSent: 0,
      requestsSuccessful: 0,
      requestsFailed: 0,
      averageResponseTime: 0,
      totalDataSent: 0,
      retryCount: 0,
      deduplicationCount: 0
    };
  }

  /**
   * Cancels a pending request.
   * @param {string} requestId - ID of request to cancel
   * @returns {boolean} True if request was cancelled
   */
  cancelRequest(requestId) {
    const request = this.pendingRequests.get(requestId);
    if (request) {
      this.pendingRequests.delete(requestId);
      Log.debug(`Cancelled request ${requestId}`);
      return true;
    }

    // Also check queue
    const queueIndex = this.requestQueue.findIndex(req => req.id === requestId);
    if (queueIndex !== -1) {
      this.requestQueue.splice(queueIndex, 1);
      Log.debug(`Cancelled queued request ${requestId}`);
      return true;
    }

    return false;
  }

  /**
   * Clears all pending and queued requests.
   */
  clearAll() {
    this.pendingRequests.clear();
    this.requestQueue = [];
    this.requestCache.clear();
    
    Log.debug('Cleared all HTTP client requests and cache');
  }

  /**
   * Destroys the HTTP client and cleans up resources.
   */
  destroy() {
    this.clearAll();
    
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }

    Log.debug('HTTP client destroyed');
  }
}

export default OptimizedHttpClient;
