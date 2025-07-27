export function callApi({ url, payload, options }, callback) {
  // The Browser Agent sends the 'body' part of the payload object as the actual request body.
  const body = JSON.stringify(payload.body);

  // For final harvests on page unload, use sendBeacon for reliability.
  if (options.isFinalHarvest && navigator.sendBeacon) {
    try {
      navigator.sendBeacon(url, body);
    } catch (e) {
      // sendBeacon can fail if the payload is too large.
    }
    return;
  }

  fetch(url, {
    method: "POST",
    body: body,
    headers: { "Content-Type": "text/plain" },
    keepalive: options.isFinalHarvest, // Important for final harvest fallback
  })
    .then((response) => {
      console.log("status", response.status);
      // Check for statuses that indicate a retry is needed.
      const isRetry = shouldRetry(response.status);
      callback({ retry: isRetry, status: response.status });
    })
    .catch(() => {
      // Any network failure (e.g., no internet) should also trigger a retry.
      callback({ retry: true, status: 0 });
    });
}

function shouldRetry(status) {
  switch (status) {
    case 408:
    case 429:
    case 500:
      return true;
  }
  return (status >= 502 && status <= 504) || (status >= 512 && status <= 530);
}
