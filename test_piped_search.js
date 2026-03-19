import https from 'https';

https.get('https://pipedapi.kavin.rocks/search?q=hituri&filter=all', res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log("Items count:", parsed.items?.length);
      if (parsed.items && parsed.items.length > 0) {
        // filter for type 'stream' (video/audio)
        const streams = parsed.items.filter(i => i.type === 'stream');
        if (streams.length > 0) {
          console.log("First item:", streams[0].title, streams[0].url, streams[0].uploaderName);
        }
      }
    } catch(e) { console.error(e); }
  });
});
