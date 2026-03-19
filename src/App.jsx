import { useState, useRef, useEffect } from 'react'
import { searchYouTube, getAudioStream, getTrendingMusic } from './api'
import './App.css'

function App() {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState([])
  const [trending, setTrending] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingTrending, setIsLoadingTrending] = useState(true)
  const [playbackStatus, setPlaybackStatus] = useState("") // "Loading...", "Playing", "Error"

  const [activeTab, setActiveTab] = useState('home') // 'home' or 'favorites'
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('muzica_favorites')) || [] } catch { return [] }
  })

  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const currentTrack = queue[currentIndex] || null

  const [isPlaying, setIsPlaying] = useState(false)
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [repeatMode, setRepeatMode] = useState('none') // 'none', 'one', 'all'
  const [showEffects, setShowEffects] = useState(false)
  const [bassAmount, setBassAmount] = useState(0) // 0 to 40 dB
  const [boostVolume, setBoostVolume] = useState(1) // 1 to 4x multiplier

  const audioRef = useRef(null)
  const audioCtxRef = useRef(null)
  const sourceRef = useRef(null)
  const bassFilterRef = useRef(null)
  const gainNodeRef = useRef(null)
  const [useAudioFx, setUseAudioFx] = useState(false) 
  const [showSplash, setShowSplash] = useState(true)
  const [searchHistory, setSearchHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('muzica_search_history')) || [] } catch { return [] }
  })
  const [recentPlayed, setRecentPlayed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('muzica_recent_played')) || [] } catch { return [] }
  })

  const resetAudioEngine = () => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(console.error)
      audioCtxRef.current = null
      sourceRef.current = null
    }
    setUseAudioFx(false)
    alert("Motor Audio resetat. Încearcă să pornești muzica acum (fără Bass Boost).")
  }

  // Initialize Web Audio API
  const initAudioCtx = () => {
    try {
      if (audioCtxRef.current) return

      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) {
        console.warn('Web Audio API not supported')
        return
      }

      const ctx = new AudioContext()
      
      // CRITICAL: Ensure source is only created once
      if (!sourceRef.current) {
        sourceRef.current = ctx.createMediaElementSource(audioRef.current)
      }
      
      const bass = ctx.createBiquadFilter()
      const gain = ctx.createGain()

      bass.type = 'lowshelf'
      bass.frequency.value = 100
      bass.gain.value = bassAmount

      gain.gain.value = boostVolume

      sourceRef.current.connect(bass)
      bass.connect(gain)
      gain.connect(ctx.destination)

      audioCtxRef.current = ctx
      bassFilterRef.current = bass
      gainNodeRef.current = gain
      console.log('Web Audio Engine initialized')
    } catch (err) {
      console.error('Web Audio Init Failed:', err)
    }
  }

  useEffect(() => {
    if (bassFilterRef.current) {
      bassFilterRef.current.gain.value = bassAmount
    }
  }, [bassAmount])

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = boostVolume
    }
  }, [boostVolume])

  useEffect(() => {
    if (useAudioFx && audioRef.current && isPlaying) {
      initAudioCtx()
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume()
      }
    } else if (!useAudioFx && audioCtxRef.current) {
      // We don't necessarily want to close it, just disconnect if we could, 
      // but simpler to just let the user re-play. 
      // Actually, let's just make it so change requires a re-load for now to be safe, 
      // OR better:
      if (audioRef.current && isPlaying) {
        // Resetting engine to bypass FX
        resetAudioEngine()
      }
    }
  }, [useAudioFx])

  // Search logic
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      const query = searchQuery.trim()
      if (query.length > 2) {
        setIsSearching(true)
        const items = await searchYouTube(query)
        setResults(items)
        setIsSearching(false)
        
        // Add to history
        setSearchHistory(prev => {
          const filtered = prev.filter(h => h !== query)
          const updated = [query, ...filtered].slice(0, 10)
          localStorage.setItem('muzica_search_history', JSON.stringify(updated))
          return updated
        })
      } else if (query.length === 0) {
        setResults([])
      }
    }, 300) // Faster debounce (300ms)
    return () => clearTimeout(delayDebounce)
  }, [searchQuery])

  const clearHistory = () => {
    setSearchHistory([])
    localStorage.removeItem('muzica_search_history')
  }

  const toggleFavorite = (e, track) => {
    e.stopPropagation()
    const exists = favorites.find(t => t.videoId === track.videoId)
    if (exists) {
      setFavorites(favorites.filter(t => t.videoId !== track.videoId))
    } else {
      setFavorites([...favorites, track])
    }
  }

  const playAllFavorites = () => {
    if (favorites.length === 0) return
    setQueue([...favorites])
    setCurrentIndex(0)
    loadAudio(favorites[0])
    setIsPlayerOpen(true)
  }

  const playTrackFromSearch = async (track) => {
    // CRITICAL for iOS: Unlock the audio element immediately in the click handler
    if (audioRef.current) {
      audioRef.current.play().catch(() => {}); // Attempt to play (will fail but unlock)
      audioRef.current.pause();
    }
    setQueue([track])
    setCurrentIndex(0)
    loadAudio(track)
    setIsPlayerOpen(true)
  }

  const addToQueue = (e, track) => {
    e.stopPropagation()
    setQueue(prev => [...prev, track])
  }

  const playFromQueue = (index) => {
    // Unlock for iOS
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
      audioRef.current.pause();
    }
    setCurrentIndex(index)
    loadAudio(queue[index])
  }

  const loadAudio = async (track) => {
    try {
      setPlaybackStatus("Se încarcă...")
      setIsPlaying(false)
      setProgress(0)
      const vidId = track.videoId || (track.url && track.url.split('?v=')[1])
      if (!vidId) return;

      setRecentPlayed(prev => {
        const filtered = prev.filter(t => t.videoId !== vidId)
        const updated = [track, ...filtered].slice(0, 20)
        localStorage.setItem('muzica_recent_played', JSON.stringify(updated))
        return updated
      })

      const streamUrl = await getAudioStream(vidId)
      if (streamUrl && audioRef.current) {
        audioRef.current.src = streamUrl
        audioRef.current.load()

        if (useAudioFx) {
          initAudioCtx()
          if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
            await audioCtxRef.current.resume().catch(console.error)
          }
        }

        const playPromise = audioRef.current.play()
        if (playPromise !== undefined) {
          playPromise.then(() => {
            setIsPlaying(true)
            setPlaybackStatus("Redare activă")
          }).catch(e => {
            console.error("Playback failed:", e)
            setPlaybackStatus("Eroare redare - reîncearcă")
            if (useAudioFx) {
              resetAudioEngine()
              audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error)
            }
          })
        }
      }
    } catch (err) {
      console.error("Load Audio failed:", err)
      setPlaybackStatus("Eroare conexiune!")
    }
  }

  const playNext = () => {
    if (currentIndex < queue.length - 1) {
      const nextIdx = currentIndex + 1
      setCurrentIndex(nextIdx)
      loadAudio(queue[nextIdx])
    } else if (repeatMode === 'all') {
      setCurrentIndex(0)
      loadAudio(queue[0])
    }
  }

  const handleEnded = () => {
    if (repeatMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(console.error)
      }
    } else {
      playNext()
    }
  }

  const playPrev = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1
      setCurrentIndex(prevIdx)
      loadAudio(queue[prevIdx])
    }
  }

  const togglePlayPause = async () => {
    if (!audioRef.current || !currentTrack) return
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume()
    }
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play().catch(console.error)
      setIsPlaying(true)
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime)
      setDuration(audioRef.current.duration || 0)
    }
  }

  const handleSeek = (e) => {
    const time = Number(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setProgress(time)
    }
  }

  const formatTime = (sec) => {
    if (isNaN(sec)) return "0:00"
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const renderTrackItem = (track, index, keyPrefix) => {
    const isFav = favorites.find(t => t.videoId === track.videoId)
    return (
      <div key={`${keyPrefix}-${index}`} className="track-item" onClick={() => playTrackFromSearch(track)}>
        <img className="track-thumb" src={track.thumbnail} alt="Thumb" loading="lazy" />
        <div className="track-info">
          <div className="track-title" dangerouslySetInnerHTML={{ __html: track.title }} />
          <div className="track-artist">{track.uploaderName}</div>
        </div>
        <button className="fav-btn" onClick={(e) => toggleFavorite(e, track)}>
          {isFav ? (
            <svg viewBox="0 0 24 24" fill="var(--accent-color)" width="24" height="24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="var(--text-muted)" width="24" height="24"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" /></svg>
          )}
        </button>
        <button className="add-queue-btn" onClick={(e) => addToQueue(e, track)} style={{ marginLeft: 8 }}>+</button>
      </div>
    )
  }

  // MediaSession logic
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title.replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
        artist: currentTrack.uploaderName || 'YouTube Artist',
        album: 'MDL MUZICCA',
        artwork: [{ src: currentTrack.thumbnail, type: 'image/jpeg' }]
      })
      navigator.mediaSession.setActionHandler('play', () => {
        if (audioRef.current) { audioRef.current.play(); setIsPlaying(true); }
      })
      navigator.mediaSession.setActionHandler('pause', () => {
        if (audioRef.current) { audioRef.current.pause(); setIsPlaying(false); }
      })
      navigator.mediaSession.setActionHandler('previoustrack', playPrev)
      navigator.mediaSession.setActionHandler('nexttrack', playNext)
    }
  }, [currentTrack, playPrev, playNext])

  // Load trending on mount
  useEffect(() => {
    async function fetchTrending() {
      setIsLoadingTrending(true)
      const data = await getTrendingMusic()
      setTrending(data)
      setIsLoadingTrending(false)
    }
    fetchTrending()
  }, [])

  useEffect(() => {
    localStorage.setItem('muzica_favorites', JSON.stringify(favorites))
  }, [favorites])

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2500)
    return () => clearTimeout(timer)
  }, [])



  return (
    <div className="app-container">
      {/* HIDDEN AUDIO ELEMENT - CRITICAL FOR PLAYBACK */}
      <audio 
        ref={audioRef} 
        onTimeUpdate={handleTimeUpdate} 
        onEnded={handleEnded} 
        onCanPlay={() => {
          if (isPlaying && audioRef.current) {
            audioRef.current.play().catch(e => console.error("Auto-play failed:", e));
          }
        }}
      />

      {/* Splash Screen */}
      <div className={`splash-screen ${!showSplash ? 'hidden' : ''}`}>
        <div className="mdl-logo">MDL</div>
        <div className="mdl-subtitle">Premium Muzică System</div>
      </div>

      <header className="header">
        <form onSubmit={(e) => { e.preventDefault(); document.activeElement.blur(); }} style={{ width: '100%', position: 'relative' }}>
          <input
            type="text"
            className="search-bar glass-panel"
            placeholder="Căutare pe YouTube..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" style={{ position: 'absolute', right: 20, top: 12 }}>
            <svg fill="var(--text-muted)" width="24" height="24" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>
          </button>
        </form>

        {searchQuery.length === 0 && searchHistory.length > 0 && activeTab === 'home' && (
          <div className="history-section">
            {searchHistory.map((h, i) => (
              <div key={i} className="history-tag" onClick={() => setSearchQuery(h)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
                {h}
              </div>
            ))}
            <button onClick={clearHistory} style={{ fontSize: 11, color: 'var(--accent-color)', marginLeft: 'auto' }}>Șterge Tot</button>
          </div>
        )}

        <div className="tabs">
          <button className={`tab-btn ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>Acasă</button>
          <button className={`tab-btn ${activeTab === 'favorites' ? 'active' : ''}`} onClick={() => setActiveTab('favorites')}>Inimă ❤️</button>
        </div>
      </header>

      <main className="content">
        {activeTab === 'favorites' ? (
          <div>
            <div className="section-header">
              <h2 className="section-title">Melodii Apreciate</h2>
              {favorites.length > 0 && (
                <button className="play-all-btn" onClick={playAllFavorites}>
                  ▶ Joacă Toate
                </button>
              )}
            </div>
            <div className="track-list">
              {favorites.length === 0 && <p className="status-text">Nu ai apreciat nicio melodie.</p>}
              {favorites.map((track, i) => renderTrackItem(track, i, 'fav'))}
            </div>
          </div>
        ) : (
          <div>
            {searchQuery.length > 0 ? (
              <h2 className="section-title">Rezultate Căutare</h2>
            ) : (
              <>
                {recentPlayed.length > 0 && (
                  <div className="recent-section">
                    <h2 className="section-title">Ascultate Recent</h2>
                    <div className="horizontal-scroll">
                      {recentPlayed.map((track, i) => (
                        <div key={i} className="recent-card" onClick={() => playTrackFromSearch(track)}>
                          <img src={track.thumbnail} alt="Card" />
                          <div className="recent-card-title" dangerouslySetInnerHTML={{ __html: track.title }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <h2 className="section-title">Sugerată pentru tine</h2>
              </>
            )}

            <div className="track-list">
              {isSearching && searchQuery.length > 2 && <p className="status-text">Se caută...</p>}

              {/* Search Results */}
              {!isSearching && searchQuery.length > 2 && results.map((track, i) => renderTrackItem(track, i, 's'))}

              {/* Trending if no search */}
              {searchQuery.trim().length <= 2 && isLoadingTrending && <p className="status-text">Se încarcă sugestii...</p>}
              {searchQuery.trim().length <= 2 && !isLoadingTrending && trending.map((track, i) => renderTrackItem(track, i, 't'))}

              {!isSearching && results.length === 0 && searchQuery.length > 2 && (
                <p className="status-text">Nu a fost găsită nicio melodie.</p>
              )}
            </div>
          </div>
        )}

        {queue.length > 0 && (
          <div className="queue-section">
            <h2 className="section-title">În Așteptare (Queue)</h2>
            <div className="track-list">
              {queue.map((track, i) => (
                <div key={i} className={`track-item ${currentIndex === i ? 'active' : ''}`} onClick={() => playFromQueue(i)}>
                  <div className="queue-index">{i === currentIndex ? '▶' : i + 1}</div>
                  <img className="track-thumb" src={track.thumbnail} alt="Thumb" loading="lazy" />
                  <div className="track-info">
                    <div className="track-title" dangerouslySetInnerHTML={{ __html: track.title }} />
                    <div className="track-artist">{track.uploaderName}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onEnded={handleEnded}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={handleTimeUpdate}
      />

      {/* Mini Player */}
      {currentTrack && !isPlayerOpen && (
        <div className="mini-player glass-panel" onClick={() => setIsPlayerOpen(true)}>
          <div className="mini-progress" style={{ width: `${(progress / duration) * 100}%` }}></div>
          <img className="mini-thumb" src={currentTrack.thumbnail} alt="Mini Thumb" />
          <div className="track-info">
            <div className="track-title" dangerouslySetInnerHTML={{ __html: currentTrack.title }} />
            <div className="playback-status" style={{ fontSize: 10, color: 'var(--accent-color)' }}>{playbackStatus}</div>
          </div>
          <div className="mini-controls" onClick={(e) => e.stopPropagation()}>
            <button className="btn-play-pause" onClick={togglePlayPause}>
              {isPlaying ? (
                // Pause Icon
                <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              ) : (
                // Play Icon
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Full Player Modal */}
      {isPlayerOpen && currentTrack && (
        <div className="full-player glass-panel">
          <div className="fp-header">
            <button className="fp-close" onClick={() => setIsPlayerOpen(false)}>
              <svg viewBox="0 0 24 24"><path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z" /></svg>
            </button>
            <span className="fp-header-title">Now Playing</span>
            <div style={{ width: 24 }}></div> {/* Placeholder for alignment */}
          </div>

          <div className="fp-art-container">
            <img className="fp-art" src={currentTrack.thumbnail.replace('mqdefault', 'hqdefault')} alt="Album Art" />
          </div>

          <div className="fp-info">
            <h2 className="fp-title" dangerouslySetInnerHTML={{ __html: currentTrack.title }}></h2>
            <p className="fp-artist">{currentTrack.uploaderName}</p>
          </div>

          <div className="fp-progress-container">
            <input
              type="range"
              className="fp-progress-bar"
              min="0"
              max={duration || 100}
              value={progress}
              onChange={handleSeek}
            />
            <div className="fp-time-labels">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="fp-controls">
            <button className="fp-btn-secondary" onClick={() => setRepeatMode(prev => prev === 'none' ? 'one' : prev === 'one' ? 'all' : 'none')}>
              <svg viewBox="0 0 24 24" style={{ fill: repeatMode !== 'none' ? 'var(--accent-color)' : 'var(--text-main)', width: 24, height: 24 }}>
                {repeatMode === 'one' ? (
                  <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z" />
                ) : (
                  <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
                )}
              </svg>
              {repeatMode === 'all' && <span style={{ fontSize: 10, position: 'absolute', bottom: -5, color: 'var(--accent-color)' }}>ALL</span>}
            </button>

            <button className="fp-btn-secondary" onClick={playPrev} disabled={currentIndex === 0}>
              <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
            </button>
            <button className="fp-btn-main" onClick={togglePlayPause}>
              {isPlaying ? (
                <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              ) : (
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <button className="fp-btn-secondary" onClick={playNext} disabled={currentIndex === queue.length - 1 && repeatMode !== 'all'}>
              <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>

            <button className="fp-btn-secondary" onClick={() => setShowEffects(true)}>
              <svg viewBox="0 0 24 24" style={{ width: 24, height: 24 }}><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" /></svg>
            </button>
          </div>

          {showEffects && (
            <div className="fx-panel">
              <div className="fx-header">
                <h3 className="fx-title">Setări Audio PRO</h3>
                <button className="fx-close" onClick={() => setShowEffects(false)}>✕</button>
              </div>

              <button className="fx-reset-btn" onClick={resetAudioEngine}>
                Resetare Audio (Dacă nu se aude nimic)
              </button>

              <div className="fx-control">
                <div className="fx-label">
                  <span>MOD BASS EXTREM (PRO)</span>
                  <button
                    className={`toggle-fx-btn ${useAudioFx ? 'on' : 'off'}`}
                    onClick={() => setUseAudioFx(!useAudioFx)}
                  >
                    {useAudioFx ? 'ACTIVAT' : 'DEZACTIVAT'}
                  </button>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  * Activează acest mod pentru a folosi glisantele de mai jos. Pe unele telefoane poate opri sunetul.
                </p>
              </div>

              <div className="fx-control" style={{ opacity: useAudioFx ? 1 : 0.4, pointerEvents: useAudioFx ? 'all' : 'none' }}>
                <div className="fx-label">
                  <span>BASS MOD (EXTREM)</span>
                  <span>{bassAmount} dB</span>
                </div>
                <input
                  type="range"
                  className="fx-slider"
                  min="0"
                  max="40"
                  value={bassAmount}
                  onChange={(e) => setBassAmount(Number(e.target.value))}
                />
              </div>

              <div className="fx-control">
                <div className="fx-label">
                  <span>VOLUM BOOST (LOUD)</span>
                  <span>{Math.round(boostVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="fx-slider"
                  min="1"
                  max="4"
                  step="0.1"
                  value={boostVolume}
                  onChange={(e) => setBoostVolume(Number(e.target.value))}
                />
              </div>

              <p style={{ marginTop: 'auto', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                Atenție: Volumul ridicat poate distorsiona sunetul sau afecta difuzoarele. MDL MUZICCA - No limits.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
