import express from 'express';
import cors from 'cors';
import ytSearch from 'yt-search';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import ytdl from '@distube/ytdl-core';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { IncomingMessage } from 'http';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

let lastError = "Nicio eroare înregistrată încă.";

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

app.get('/api/debug', (req, res) => {
  res.send(`<h1>MDL System Debug</h1><pre>${lastError}</pre>`);
});

app.get('/api/stream', async (req, res) => {
  try {
    const videoId = req.query.v;
    if (!videoId || videoId === 'undefined' || videoId === 'null') {
      return res.status(400).json({ error: 'ID video missing' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[DEBUG] Proxying stream for: ${videoId}`);

    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      let ytdlpCmd = 'yt-dlp';
      if (process.platform === 'win32') {
        const localPath = path.join(__dirname, 'yt-dlp.exe').replace(/\\/g, '/');
        ytdlpCmd = fs.existsSync(localPath) ? `"${localPath}"` : 'yt-dlp';
      } else if (fs.existsSync('./yt-dlp')) {
        ytdlpCmd = './yt-dlp';
      }

      // 1. Get Google Video URL using Android Client to bypass bot detection
      const fullCmd = `${ytdlpCmd} --force-ipv4 --no-playlist --extractor-args "youtube:player_client=android" -f bestaudio -g ${videoUrl}`;
      const { stdout } = await execAsync(fullCmd);
      const streamUrl = stdout.trim();

      if (!streamUrl) throw new Error("Nu am putut prelua link-ul audio (yt-dlp failed).");

      // 2. Proxy the request from Render to YouTube
      // Crucial: Forward `Range` header for iOS Safari compatibility
      const proxyHeaders = {
        'User-Agent': 'com.google.android.youtube/19.05.36 (Linux; U; Android 14; en_US) gzip',
      };
      
      if (req.headers.range) {
        proxyHeaders.Range = req.headers.range;
      }

      const proxyReq = https.get(streamUrl, { headers: proxyHeaders }, (proxyRes) => {
        // Check if YouTube blocked us despite Android Client
        if (proxyRes.statusCode === 403) {
           throw new Error("YouTube 403 Forbidden (Blocked)");
        }

        // Forward essential headers
        const headers = { 'Access-Control-Allow-Origin': '*' };
        ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(h => {
          if (proxyRes.headers[h]) headers[h] = proxyRes.headers[h];
        });

        res.writeHead(proxyRes.statusCode || 200, headers);
        proxyRes.pipe(res);

        proxyRes.on('error', (err) => {
          console.error('[PROXY RES ERROR]', err.message);
          res.end();
        });
      });

      proxyReq.on('error', (err) => {
        console.error('[PROXY REQ ERROR]', err.message);
        if (!res.headersSent) res.status(500).json({ error: err.message });
      });

      req.on('close', () => {
        proxyReq.destroy();
      });

    } catch (err) {
      console.error('[EXTRACTION/PROXY ERROR]', err.message);
      lastError = `[${new Date().toISOString()}] Stream Error: ${err.message}`;
      if (!res.headersSent) res.status(500).json({ error: `Eroare Proxy: ${err.message}` });
    }

  } catch (err) {
    console.error('[GLOBAL ERROR]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// Catch-all to serve index.html
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// VERY IMPORTANT: Parse PORT as integer
const PORT = parseInt(process.env.PORT || '3000', 10);
const server = http.createServer(app);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 MDL Music Processor is LIVE on port ${PORT}`);
});

setInterval(() => {
    // Keep alive heart-beat
}, 30000);

server.on('error', (err) => {
    console.error('CRITICAL SERVER ERROR:', err);
});
