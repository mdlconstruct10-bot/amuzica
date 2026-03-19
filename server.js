import express from 'express';
import cors from 'cors';
import ytSearch from 'yt-search';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import fs from 'fs';
import https from 'https';
import { IncomingMessage } from 'http';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'dist')));

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

    // Use 'yt-dlp' from PATH if available (for Linux/Render), otherwise fallback to local exe or downloaded binary
    let ytdlpPath = 'yt-dlp';
    if (process.platform === 'win32') {
      ytdlpPath = `"${path.join(__dirname, 'yt-dlp.exe').replace(/\\/g, '/')}"`;
    } else if (fs.existsSync(path.join(__dirname, 'yt-dlp'))) {
      ytdlpPath = `./yt-dlp`;
    }
    
    // Fixed yt-dlp command with better flags
    const command = `${ytdlpPath} --no-playlist --flat-playlist -f bestaudio -g ${videoUrl}`;
    console.log(`Executing: ${command}`);
    
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr) console.warn(`yt-dlp stderr: ${stderr}`);
    
    const streamUrl = stdout.trim();
    
    if (!streamUrl) {
      throw new Error(`yt-dlp failed to extract stream URL. stderr: ${stderr}`);
    }

    console.log(`yt-dlp extracted URL successfully`);

    // Proxy the stream using https module for better stability
    const proxyHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'identity;q=1, *;q=0',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'audio',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
      'Referer': 'https://www.youtube.com/'
    };

    if (req.headers.range) {
      proxyHeaders.Range = req.headers.range;
    }

    const proxyReq = https.get(streamUrl, { headers: proxyHeaders }, (proxyRes) => {
      // Forward status code
      res.status(proxyRes.statusCode || 200);

      // Forward headers
      const headersToForward = [
        'content-type',
        'content-length',
        'accept-ranges',
        'content-range',
        'cache-control',
        'expires',
        'last-modified'
      ];

      headersToForward.forEach(h => {
        if (proxyRes.headers[h]) {
          res.setHeader(h, proxyRes.headers[h]);
        }
      });

      // Essential for cross-origin audio
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

      proxyRes.pipe(res);

      proxyRes.on('error', (err) => {
        console.error('Proxy Response Error:', err);
        res.end();
      });
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy Request Error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Proxy request failed' });
    });

    // Handle client disconnect
    req.on('close', () => {
      proxyReq.destroy();
    });

  } catch (err) {
    fs.appendFileSync('error_log.txt', `[${new Date().toISOString()}] SERVER STREAM ERROR: ${err.message}\n${err.stack}\n`);
    console.error('SERVER STREAM ERROR:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// Catch-all to serve the frontend index.html for any non-API route
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

import http from 'http';
const PORT = process.env.PORT || 3000;
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
