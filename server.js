import express from 'express';
import cors from 'cors';
import ytSearch from 'yt-search';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import ytdl from '@distube/ytdl-core';
import fs from 'fs';
import https from 'https';
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
      return res.status(400).json({ error: 'Invalid or missing videoId' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[DEBUG] Attempting stream for: ${videoId}`);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    res.setHeader('Accept-Ranges', 'bytes');

    try {
      const info = await ytdl.getInfo(videoUrl, {
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        }
      });

      const format = ytdl.chooseFormat(info.formats, { 
        filter: 'audioonly', 
        quality: 'highestaudio' 
      });

      if (!format) throw new Error('Nu am găsit un format audio compatibil.');

      // Essential for browser playback: Correct Mime Type
      const mimeType = format.mimeType.split(';')[0] || 'audio/webm';
      res.setHeader('Content-Type', mimeType);
      
      if (format.contentLength) {
        res.setHeader('Content-Length', format.contentLength);
      }

      console.log(`[STREAM] Redare: ${info.videoDetails.title} (${mimeType})`);

      const stream = ytdl.downloadFromInfo(info, { format });

      stream.on('error', (err) => {
        console.error('[STREAM ERROR]', err.message);
        lastError = `[${new Date().toISOString()}] Stream Error: ${err.message}`;
        if (!res.headersSent) res.status(500).end();
      });

      stream.pipe(res);

      req.on('close', () => {
        console.log(`[DEBUG] Client Deconectat: ${videoId}`);
        stream.destroy();
      });

    } catch (ytdlErr) {
      console.error('[YTDL ERROR]', ytdlErr.message);
      lastError = `[${new Date().toISOString()}] YTDL Error: ${ytdlErr.message}`;
      
      // Fallback redirect (Direct YouTube Stream URL) - last resort
      try {
        const info = await ytdl.getInfo(videoUrl);
        const format = ytdl.chooseFormat(info.formats, { filter: 'audioonly' });
        if (format && format.url) {
           console.log("[DEBUG] Fallback: redirecting to direct URL");
           return res.redirect(format.url);
        }
      } catch (e) {}

      if (!res.headersSent) res.status(500).json({ error: ytdlErr.message });
    }

  } catch (err) {
    console.error('[GLOBAL ERROR]', err.message);
    lastError = `[${new Date().toISOString()}] Global Error: ${err.message}`;
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// Catch-all to serve index.html
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

import http from 'http';
const PORT = process.env.PORT || 3000;
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
