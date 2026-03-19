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
    
    // Using @distube/ytdl-core for robust streaming (no external exe needed)
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      const stream = ytdl(videoUrl, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25 // 32MB buffer for smoother streaming
      });

      stream.on('error', (err) => {
        console.error('ytdl stream error:', err);
        if (!res.headersSent) res.status(500).send('Stream failed');
      });

      stream.pipe(res);

      // Handle client disconnect
      req.on('close', () => {
        stream.destroy();
      });

    } catch (ytdlErr) {
      console.warn('ytdl-core failed, falling back to yt-dlp:', ytdlErr.message);
      
      // FALLBACK TO YT-DLP if ytdl-core fails
      const ytArgs = [
        '--no-playlist',
        '--flat-playlist',
        '-f', 'bestaudio',
        '--output', '-',
        '--force-ipv4',
        '--extractor-args', 'youtube:player_client=web,android',
        videoUrl
      ];

      const normalizedPath = ytdlpPath.startsWith('"') ? ytdlpPath.slice(1, -1) : ytdlpPath;
      const proc = spawn(normalizedPath, ytArgs);

      proc.stdout.pipe(res);

      proc.on('close', (code) => {
        if (code !== 0 && !res.headersSent) res.status(500).end();
        else res.end();
      });

      req.on('close', () => proc.kill());
    }

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
