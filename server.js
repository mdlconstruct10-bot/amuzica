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
    console.log(`[DEBUG] Request for: ${videoId}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    res.setHeader('Accept-Ranges', 'bytes');

    try {
      // Use ANDROID client to bypass "bot" detection on Render
      const ytdlOptions = {
        requestOptions: {
          headers: {
            'User-Agent': 'com.google.android.youtube/19.05.36 (Linux; U; Android 14; en_US) gzip',
            'X-YouTube-Client-Name': '3',
            'X-YouTube-Client-Version': '19.05.36'
          }
        }
      };

      const info = await ytdl.getInfo(videoUrl, ytdlOptions);
      const format = ytdl.chooseFormat(info.formats, { filter: 'audioonly', quality: 'highestaudio' });
      
      if (!format) throw new Error('Nu am găsit un format audio.');

      const mimeType = format.mimeType.split(';')[0] || 'audio/webm';
      res.setHeader('Content-Type', mimeType);
      if (format.contentLength) res.setHeader('Content-Length', format.contentLength);

      console.log(`[STREAM] Redare (Android Client): ${info.videoDetails.title}`);
      
      const stream = ytdl.downloadFromInfo(info, { format });
      stream.on('error', (err) => {
        console.error('[STREAM ERROR]', err.message);
        lastError = `[${new Date().toISOString()}] Stream Error: ${err.message}`;
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);

      req.on('close', () => { stream.destroy(); });

    } catch (ytdlErr) {
      console.warn('[YTDL BOT DETECTED] Fallback to yt-dlp redirect...');
      lastError = `[${new Date().toISOString()}] YTDL Bot Error: ${ytdlErr.message}`;

      // FALLBACK: Redirect to direct Google Video URL obtained via yt-dlp
      // We use a redirect because it's more likely to work if Render's proxy is blocked but the user's IP is not.
      try {
        let ytdlpCmd = 'yt-dlp';
        if (process.platform === 'win32') {
          ytdlpCmd = `"${path.join(__dirname, 'yt-dlp.exe').replace(/\\/g, '/')}"`;
        } else if (fs.existsSync(path.join(__dirname, 'yt-dlp'))) {
          ytdlpCmd = `./yt-dlp`;
        }

        const fullCmd = `${ytdlpCmd} --force-ipv4 --extractor-args "youtube:player_client=android" -f bestaudio -g ${videoUrl}`;
        const { stdout } = await execAsync(fullCmd);
        const streamUrl = stdout.trim();
        
        if (streamUrl) {
           console.log("[DEBUG] Fallback successful: Redirecting client...");
           return res.redirect(streamUrl);
        }
      } catch (e) {
        console.error('[FALLBACK ERROR]', e.message);
        lastError += `\n[Fallback] ${e.message}`;
      }

      if (!res.headersSent) res.status(500).json({ error: 'YouTube a blocat conexiunea. Încearcă din nou.' });
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
