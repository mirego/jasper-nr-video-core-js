/**
 * Makes an API call with retry logic and fallback to sendBeacon for final harvests
 * @param {Object} params - Request parameters
 * @param {string} params.url - The URL to send the request to
 * @param {Object} params.payload - The payload object containing body data
 * @param {Object} params.options - Request options
 * @param {boolean} params.options.isFinalHarvest - Whether this is a final harvest on page unload
 * @param {Function} callback - Callback function to handle the response
 */
export function callApi({ url, payload, options = {} }, callback) {
  // Input validation
  if (!url || !payload || !callback) {
    console.error("callApi: Missing required parameters");
    if (callback) callback({ retry: false, status: 0 });
    return;
  }

  // The Browser Agent sends the 'body' part of the payload object as the actual request body.
  let body;
  try {
    body = JSON.stringify(payload.body);
  } catch (error) {
    console.error("callApi: Error serializing payload", error);
    callback({ retry: false, status: 0 });
    return;
  }

  // For final harvests on page unload, use sendBeacon for reliability.
  if (options.isFinalHarvest && navigator.sendBeacon) {
    try {
      const success = navigator.sendBeacon(url, body);
      // sendBeacon returns true if the request was successfully queued
      callback({ retry: !success, status: success ? 200 : 0 });
    } catch (e) {
      // sendBeacon can fail if the payload is too large.
      callback({ retry: true, status: 0 });
    }
    return;
  }

  fetch(url, {
    method: "POST",
    body: body,
    headers: {
      "Content-Type": "application/json", // More accurate content type
    },
    keepalive: options.isFinalHarvest, // Important for final harvest fallback
  })
    .then((response) => {
      // Check for statuses that indicate a retry is needed.
      const isRetry = shouldRetry(response.status);
      callback({
        retry: isRetry,
        status: response.status,
        ok: response.ok,
      });
    })
    .catch(() => {
      // Any network failure (e.g., no internet) should also trigger a retry.
      callback({ retry: true, status: 0 });
    });
}

/**
 * Determines if a request should be retried based on HTTP status code
 * @param {number} status - HTTP status code
 * @returns {boolean} - True if request should be retried
 */
function shouldRetry(status) {
  switch (status) {
    case 408: // Request Timeout
    case 429: // Too Many Requests
    case 500: // Internal Server Error
      return true;
    case 401: // Unauthorized - don't retry
    case 403: // Forbidden - don't retry
    case 404: // Not Found - don't retry
      return false;
  }
  // Retry for 5xx server errors and specific ranges
  return (status >= 502 && status <= 504) || (status >= 512 && status <= 530);
}

/**
 * Calculates the size of a payload object in megabytes
 * @param {Object} obj - The object to calculate size for
 * @returns {number} - Size in megabytes, or 0 if calculation fails
 */
export function getPayloadSize(obj) {
  if (!obj || typeof obj !== "object") {
    return 0;
  }

  try {
    const json = JSON.stringify(obj);
    return new TextEncoder().encode(json).length / (1024 * 1024);
  } catch (error) {
    console.error("getPayloadSize: Error calculating payload size", error);
    return 0;
  }
}
