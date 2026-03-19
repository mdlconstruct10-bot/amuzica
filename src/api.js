// 🚀 HYBRID ARCHITECTURE (MDL SYSTEM)
// Search & Trending -> Render Backend (Very fast, doesn't trigger bot block)
// Audio Streaming -> Piped API (Client-side, solves YouTube Render IP block)

const API_URL = 'https://amuzica-1.onrender.com/api';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.syncpundit.io',
  'https://pipedapi.smnz.de'
];

async function fetchFromPiped(endpoint) {
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}${endpoint}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`[API] Piped instance ${instance} failed`, e);
    }
  }
  throw new Error("Toate serverele Piped au eșuat pentru stream.");
}

export async function searchYouTube(query) {
  if (!query) return [];
  try {
    const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Eroare rețea căutare');
    const data = await res.json();
    console.log(`[API] Căutare prin serverul dedicat: ${query}`);
    return data;
  } catch (err) {
    console.error(err);
    return [];
  }
}

export async function getTrendingMusic() {
  try {
    const res = await fetch(`${API_URL}/trending`);
    if (!res.ok) throw new Error('Eroare rețea topuri');
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

export async function getAudioStream(videoId) {
  try {
    const data = await fetchFromPiped(`/streams/${videoId}`);
    const audioStreams = data.audioStreams || [];
    
    // Prefer m4a (better for iOS Safari), then webm
    const m4a = audioStreams.find(s => s.mimeType && (s.mimeType.includes('mp4') || s.mimeType.includes('m4a')));
    const webm = audioStreams.find(s => s.mimeType && s.mimeType.includes('webm'));
    
    const bestStream = m4a || webm || audioStreams[0];
    if (bestStream && bestStream.url) {
      console.log(`[API] Redare directă descentralizată activată.`);
      return bestStream.url;
    }
  } catch (e) {
    console.error("Eroare Piped:", e);
  }
  
  // Ultimul caz (dacă pică Piped): 
  // Folosim fallback-ul de proxy pe Render implementat anterior (care are Android Client Fix)
  console.warn('[API] Piped a picat. Se folosește tunelul Render!');
  return `${API_URL}/stream?v=${videoId}`;
}
