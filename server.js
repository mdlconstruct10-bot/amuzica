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
      return res.status(400).json({ error: 'ID video missing' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[DEBUG] Redirecting for: ${videoId}`);

    // Set CORS headers just in case
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Strategy: Get a direct URL and redirect the browser (Redirect works best for iPhone/Safari)
    try {
      let ytdlpCmd = 'yt-dlp';
      if (process.platform === 'win32') {
        const localPath = path.join(__dirname, 'yt-dlp.exe').replace(/\\/g, '/');
        ytdlpCmd = fs.existsSync(localPath) ? `"${localPath}"` : 'yt-dlp';
      } else if (fs.existsSync('./yt-dlp')) {
        ytdlpCmd = './yt-dlp';
      }

      // Android client is the least likely to trigger "Sign in to confirm you're not a bot"
      // We use --force-ipv4 because Render IPv6 is almost always blocked
      const fullCmd = `${ytdlpCmd} --force-ipv4 --no-playlist --flat-playlist --extractor-args "youtube:player_client=android" -f bestaudio -g ${videoUrl}`;
      
      console.log(`Executing: ${fullCmd}`);
      const { stdout } = await execAsync(fullCmd);
      const streamUrl = stdout.trim();

      if (streamUrl) {
         console.log("[DEBUG] Redirecting client to direct Google Video URL");
         return res.redirect(streamUrl);
      } else {
         throw new Error("Nu s-a putut genera link-ul de streaming.");
      }

    } catch (err) {
      console.error('[REDIRECT ERROR]', err.message);
      lastError = `[${new Date().toISOString()}] Redirect Error: ${err.message}`;

      // FALLBACK: If yt-dlp fails, try ytdl-core as a last resort
      try {
        const info = await ytdl.getInfo(videoUrl, {
          requestOptions: {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          }
        });
        const format = ytdl.chooseFormat(info.formats, { filter: 'audioonly', quality: 'highestaudio' });
        if (format && format.url) {
           return res.redirect(format.url);
        }
      } catch (e) {
        lastError += `\n[YTDL Fallback] ${e.message}`;
      }

      if (!res.headersSent) {
        res.status(500).send(`Eroare YouTube: ${err.message}. Link-ul de diagnoză: /api/debug`);
      }
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
