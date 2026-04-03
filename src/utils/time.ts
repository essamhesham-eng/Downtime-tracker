export let serverTimeOffset = 0;
let isOffsetFetched = false;

export const fetchServerTimeOffset = async () => {
  if (isOffsetFetched) return serverTimeOffset;
  
  try {
    const start = Date.now();
    // Try to get time from worldtimeapi first, as it's very reliable for this
    try {
      const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const serverTime = new Date(data.utc_datetime).getTime();
        const end = Date.now();
        const rtt = end - start;
        const estimatedServerTime = serverTime + (rtt / 2);
        serverTimeOffset = estimatedServerTime - end;
        isOffsetFetched = true;
        return serverTimeOffset;
      }
    } catch (e) {
      console.warn('worldtimeapi failed, falling back to HEAD request');
    }

    // Fallback to HEAD request on current origin
    const response = await fetch(window.location.origin, { method: 'HEAD', cache: 'no-store' });
    const dateHeader = response.headers.get('Date');
    
    if (dateHeader) {
      const serverTime = new Date(dateHeader).getTime();
      const end = Date.now();
      const rtt = end - start;
      
      const estimatedServerTime = serverTime + (rtt / 2);
      serverTimeOffset = estimatedServerTime - end;
      isOffsetFetched = true;
    }
  } catch (error) {
    console.warn('Failed to fetch server time offset:', error);
  }
  
  return serverTimeOffset;
};

export const getServerTime = () => {
  return new Date(Date.now() + serverTimeOffset);
};

export const getServerTimeMs = () => {
  return Date.now() + serverTimeOffset;
};
