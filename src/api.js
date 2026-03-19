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
  // Return the direct proxy endpoint so the <audio> tag can handle buffering natively
  return `${API_URL}/stream?v=${videoId}`;
}
