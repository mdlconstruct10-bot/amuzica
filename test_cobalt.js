import https from 'https';

const videoId = 'dQw4w9WgXcQ';
const data = JSON.stringify({
  url: `https://www.youtube.com/watch?v=${videoId}`,
  aFormat: 'mp3',
  isAudioOnly: true
});

const options = {
  hostname: 'api.cobalt.tools',
  path: '/api/json',
  method: 'POST',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let responseData = '';
  res.on('data', chunk => responseData += chunk);
  res.on('end', () => {
    console.log("Status:", res.statusCode);
    console.log("Response:", responseData);
  });
});

req.on('error', err => console.error(err));
req.write(data);
req.end();
