import https from 'https';

const videoId = 'dQw4w9WgXcQ';
https.get(`https://pipedapi.kavin.rocks/streams/${videoId}`, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log("Audio Streams:", parsed.audioStreams?.length);
      if (parsed.audioStreams && parsed.audioStreams.length > 0) {
        console.log("First URL:", parsed.audioStreams[0].url);
      }
    } catch(e) {
      console.error("Parse error", e);
    }
  });
}).on('error', err => console.error(err));
