import https from 'https';

const testUrl = (url) => {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ url, success: true, count: parsed.items?.length || parsed.length });
        } catch(e) {
          resolve({ url, success: false, error: data.slice(0, 100) });
        }
      });
    }).on('error', e => resolve({ url, success: false, error: e.message }));
  });
};

async function run() {
  const urls = [
    'https://pipedapi.kavin.rocks/search?q=hituri&filter=all',
    'https://pipedapi.syncpundit.io/search?q=hituri&filter=all',
    'https://vid.puffyan.us/api/v1/search?q=hituri'
  ];
  for (const u of urls) {
    console.log(await testUrl(u));
  }
}
run();
