import express from 'express';
import cors from 'cors';
import ytSearch from 'yt-search';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import fs from 'fs';

const app = express();
app.use(cors());

app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.json([]);
    const r = await ytSearch(query);
    const videos = r.videos.slice(0, 20).map(v => ({
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail,
      uploaderName: v.author.name,
      videoId: v.videoId
    }));
    res.json(videos);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trending', async (req, res) => {
  try {
    const r = await ytSearch('top hituri muzica romaneasca 2024 2025');
    const videos = r.videos.slice(0, 15).map(v => ({
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail,
      uploaderName: v.author.name,
      videoId: v.videoId
    }));
    res.json(videos);
  } catch (err) {
    console.error('Trending error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stream', async (req, res) => {
  try {
    const videoId = req.query.v;
    if (!videoId || videoId === 'undefined' || videoId === 'null') {
      return res.status(400).json({ error: 'Invalid or missing videoId' });
    }
    
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`Streaming using yt-dlp: ${videoUrl}`);

    // Use 'yt-dlp' from PATH if available (for Linux/Render), otherwise fallback to local exe
    const ytdlpPath = process.platform === 'win32' ? `"C:/Users/Loren/Desktop/MUZICA/yt-dlp.exe"` : 'yt-dlp';
    const { stdout } = await execAsync(`${ytdlpPath} -f bestaudio -g ${videoUrl}`);
    const streamUrl = stdout.trim();
    
    if (!streamUrl) {
      throw new Error('yt-dlp failed to extract stream URL');
    }

    console.log(`yt-dlp extracted URL successfully`);

    // Proxy the stream
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    const response = await fetch(streamUrl, { headers });
    
    if (!response.ok) {
       console.error(`Google Video Proxy Failed: ${response.status} ${response.statusText}`);
       return res.status(response.status).json({ error: 'Google Video Access Denied', code: response.status });
    }

    // Forward headers
    response.headers.forEach((value, name) => {
      if (!['content-encoding', 'transfer-encoding', 'connection', 'host'].includes(name.toLowerCase())) {
        res.setHeader(name, value);
      }
    });

    res.status(response.status);
    
    const { Readable } = await import('node:stream');
    Readable.fromWeb(response.body).pipe(res);

  } catch (err) {
    fs.appendFileSync('error_log.txt', `[${new Date().toISOString()}] SERVER STREAM ERROR: ${err.message}\n${err.stack}\n`);
    console.error('SERVER STREAM ERROR:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

import http from 'http';
const PORT = 3000;
const server = http.createServer(app);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Music Backend is LIVE on port ${PORT}`);
});

// Force the event loop to stay active
setInterval(() => {
    // Keep alive heart-beat
}, 3600000);

server.on('error', (err) => {
    console.error('CRITICAL SERVER ERROR:', err);
});
