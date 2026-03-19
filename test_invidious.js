import https from 'https';

const videoId = 'dQw4w9WgXcQ';
https.get(`https://vid.puffyan.us/api/v1/videos/${videoId}`, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      const audioStreams = parsed.adaptiveFormats?.filter(f => f.type.startsWith('audio'));
      console.log("Audio Streams:", audioStreams?.length);
      if (audioStreams && audioStreams.length > 0) {
        console.log("First URL:", audioStreams[0].url);
      }
    } catch(e) {
      console.error("Parse error", e);
      console.log("Raw:", data.slice(0, 500));
    }
  });
}).on('error', err => console.error(err));
