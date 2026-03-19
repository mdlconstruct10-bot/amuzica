const API_URL = '/api';

export async function searchYouTube(query) {
  if (!query) return [];
  try {
    const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Network error');
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

export async function getTrendingMusic() {
  try {
    const res = await fetch(`${API_URL}/trending`);
    if (!res.ok) throw new Error('Network error');
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

export async function getAudioStream(videoId) {
  // CLIENT-SIDE EXTRACTION: Bypass Render IP blocks completely
  // We use decentalized Piped API instances that maintain unblocked IPs.
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.syncpundit.io',
    'https://pipedapi.smnz.de'
  ];

  for (const instance of pipedInstances) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`);
      if (res.ok) {
        const data = await res.json();
        const audioStreams = data.audioStreams || [];
        
        // Prefer m4a (better for iOS Safari), then webm
        const m4a = audioStreams.find(s => s.mimeType && (s.mimeType.includes('mp4') || s.mimeType.includes('m4a')));
        const webm = audioStreams.find(s => s.mimeType && s.mimeType.includes('webm'));
        
        const bestStream = m4a || webm || audioStreams[0];
        if (bestStream && bestStream.url) {
          console.log(`[API] Stream fetched from ${instance}`);
          return bestStream.url;
        }
      }
    } catch (e) {
      console.warn(`[API] Piped instance ${instance} failed`, e);
    }
  }

  // LAST RESORT FALLBACK: Our Render proxy
  console.warn('[API] All Piped instances failed, falling back to Render Proxy');
  return `${API_URL}/stream?v=${videoId}`;
}
