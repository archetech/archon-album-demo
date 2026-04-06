/**
 * Album Archon Client
 * 
 * A React client for self-sovereign music publishing.
 * Forked from Archon Herald client reference implementation.
 */

import React, { useEffect, useState, useRef } from "react";
import {
    useNavigate,
    BrowserRouter as Router,
    Link,
    Routes,
    Route,
} from "react-router-dom";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    CardMedia,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import LockIcon from '@mui/icons-material/Lock';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import CloseIcon from '@mui/icons-material/Close';
import axios from 'axios';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';

import './App.css';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    withCredentials: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AuthState {
    authenticated: boolean;
    did: string | null;
    isOwner: boolean;
    fan?: {
        logins?: number;
        credentialDid?: string;
        accessLevel?: string;
        archonHandle?: string;
    };
}

interface AlbumMetadata {
    title: string;
    year: number;
    location: string;
    genre: string;
    ensemble: string;
    producer: string;
    performers: string[];
    cid: string;
    cover: string;
    did: string;
    trackCount: number;
}

interface Track {
    number: number;
    title: string;
    duration: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// App Router
// ─────────────────────────────────────────────────────────────────────────────

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<ViewLogin />} />
                <Route path="/logout" element={<ViewLogout />} />
                <Route path="/credential" element={<ViewCredential />} />
                <Route path="/fans" element={<ViewFans />} />
                <Route path="*" element={<NotFound />} />
            </Routes>
        </Router>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

function Header({ title }: { title: string }) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, mb: 3 }}>
            <Link to="/" style={{ textDecoration: 'none' }}>
                <Typography variant="h4" component="h1" sx={{ fontWeight: 700, color: '#f5f5f5' }}>
                    ♪ {title}
                </Typography>
            </Link>
            <Typography variant="subtitle2" sx={{ color: '#888' }}>
                Self-Sovereign Music Publishing
            </Typography>
        </Box>
    );
}

function LoadingShell({ title }: { title: string }) {
    return (
        <div className="App">
            <Header title={title} />
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress size={32} />
            </Box>
        </div>
    );
}

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface StickyPlayerProps {
    track: Track;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    onPlayPause: () => void;
    onSeek: (time: number) => void;
    onClose: () => void;
    onNext: () => void;
    onPrev: () => void;
}

function StickyPlayer({ track, isPlaying, currentTime, duration, onPlayPause, onSeek, onClose, onNext, onPrev }: StickyPlayerProps) {
    return (
        <div className="sticky-player">
            <div className="sticky-player-content">
                <div className="sticky-player-info">
                    <div className="sticky-player-title">{track.number}. {track.title}</div>
                    <div className="sticky-player-duration">{track.duration}</div>
                </div>
                
                <div className="sticky-player-controls">
                    <IconButton onClick={onPrev} size="small" sx={{ color: '#fff' }}>
                        <SkipPreviousIcon />
                    </IconButton>
                    <IconButton onClick={onPlayPause} sx={{ color: '#fff', bgcolor: 'rgba(196,92,58,0.3)', '&:hover': { bgcolor: 'rgba(196,92,58,0.5)' } }}>
                        {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
                    </IconButton>
                    <IconButton onClick={onNext} size="small" sx={{ color: '#fff' }}>
                        <SkipNextIcon />
                    </IconButton>
                </div>

                <div className="sticky-player-progress">
                    <span className="sticky-player-time">{formatTime(currentTime)}</span>
                    <input
                        type="range"
                        min={0}
                        max={duration || 100}
                        value={currentTime}
                        onChange={(e) => onSeek(Number(e.target.value))}
                    />
                    <span className="sticky-player-time">{formatTime(duration)}</span>
                </div>

                <IconButton onClick={onClose} size="small" sx={{ color: '#888' }}>
                    <CloseIcon />
                </IconButton>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Home - Album Page
// ─────────────────────────────────────────────────────────────────────────────

function Home() {
    const [auth, setAuth] = useState<AuthState | null>(null);
    const [metadata, setMetadata] = useState<AlbumMetadata | null>(null);
    const [tracks, setTracks] = useState<Track[]>([]);
    const [currentTrack, setCurrentTrack] = useState<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const init = async () => {
            try {
                // Fetch auth status
                const authRes = await api.get('/auth/status');
                setAuth(authRes.data);

                // Fetch album metadata
                const metaRes = await api.get('/metadata');
                setMetadata(metaRes.data);

                // Fetch tracks
                const tracksRes = await api.get('/tracks');
                setTracks(tracksRes.data);
            } catch (error) {
                console.error('Init error:', error);
            }
        };
        init();
    }, []);

    const handlePlayTrack = (trackNum: number) => {
        if (!auth?.authenticated) {
            // Public: can only preview
            navigate('/login');
            return;
        }

        if (currentTrack === trackNum && isPlaying) {
            audioRef.current?.pause();
            setIsPlaying(false);
        } else {
            setCurrentTrack(trackNum);
            setIsPlaying(true);
            // Audio element will auto-play via useEffect
        }
    };

    useEffect(() => {
        if (audioRef.current && currentTrack && isPlaying) {
            audioRef.current.src = `/api/stream/${currentTrack}`;
            audioRef.current.play().catch(console.error);
        }
    }, [currentTrack, isPlaying]);

    if (!metadata) {
        return <LoadingShell title="Album" />;
    }

    return (
        <div className="App">
            <Header title="Les Troyens" />

            {/* Auth Bar */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, maxWidth: 800, mx: 'auto' }}>
                {auth?.authenticated ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {auth.fan?.accessLevel === 'vip' ? (
                            <Typography variant="body2" sx={{ color: '#c45c3a', fontWeight: 600 }}>
                                ⭐ {auth.fan?.archonHandle}@archon.social — VIP Member
                            </Typography>
                        ) : (
                            <Typography variant="body2" sx={{ color: '#22c55e' }}>
                                ✓ Fan Member
                            </Typography>
                        )}
                        <Button size="small" component={Link} to="/credential" sx={{ color: '#c45c3a' }}>
                            My Credential
                        </Button>
                        <Button size="small" onClick={() => navigate('/logout')} sx={{ color: '#888' }}>
                            Logout
                        </Button>
                    </Box>
                ) : (
                    <Button 
                        variant="contained" 
                        onClick={() => navigate('/login')}
                        sx={{ bgcolor: '#c45c3a', '&:hover': { bgcolor: '#d4664a' } }}
                    >
                        Sign in with DID
                    </Button>
                )}
            </Box>

            {/* VIP Upgrade Banner for non-VIP authenticated users */}
            {auth?.authenticated && auth.fan?.accessLevel !== 'vip' && (
                <Box sx={{ 
                    maxWidth: 800, 
                    mx: 'auto', 
                    mb: 3, 
                    p: 2, 
                    backgroundColor: 'rgba(196,92,58,0.1)', 
                    borderRadius: 2,
                    border: '1px solid rgba(196,92,58,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 2,
                }}>
                    <Box>
                        <Typography variant="body2" sx={{ color: '#f5f0e8', fontWeight: 600 }}>
                            ⭐ Upgrade to VIP
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#a89a88' }}>
                            Register your @name on archon.social to get VIP status and your handle in your credential!
                        </Typography>
                    </Box>
                    <Button 
                        variant="outlined" 
                        size="small"
                        href="https://archon.social"
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ 
                            borderColor: '#c45c3a', 
                            color: '#c45c3a', 
                            '&:hover': { borderColor: '#d4664a', bgcolor: 'rgba(196,92,58,0.1)' } 
                        }}
                    >
                        Claim @name →
                    </Button>
                </Box>
            )}

            {/* Album Card */}
            <Card sx={{ maxWidth: 800, mx: 'auto', mb: 4, bgcolor: '#1a1a1a', border: '1px solid #333' }}>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' } }}>
                    <CardMedia
                        component="img"
                        sx={{ width: { xs: '100%', sm: 280 }, height: { xs: 280, sm: 280 } }}
                        image="/api/cover"
                        alt={metadata.title}
                    />
                    <CardContent sx={{ flex: 1 }}>
                        <Typography variant="h4" component="h2" gutterBottom sx={{ color: '#f5f5f5' }}>
                            {metadata.title}
                        </Typography>
                        <Typography variant="subtitle1" sx={{ color: '#a0a0a0' }} gutterBottom>
                            {metadata.ensemble} • {metadata.year}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#888' }} gutterBottom>
                            {metadata.location}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 2, color: '#ccc' }}>
                            <strong>Genre:</strong> {metadata.genre}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#ccc' }}>
                            <strong>Produced by:</strong> {metadata.producer}
                        </Typography>
                        
                        <Box sx={{ mt: 2, p: 1.5, backgroundColor: '#0d0d0d', borderRadius: 1, border: '1px solid #333' }}>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', color: '#c45c3a' }}>
                                <strong style={{ color: '#888' }}>Album DID:</strong> {metadata.did}
                            </Typography>
                        </Box>
                    </CardContent>
                </Box>
            </Card>

            {/* Track List */}
            <Box sx={{ maxWidth: 800, mx: 'auto', mb: 4 }}>
                <Typography variant="h5" sx={{ mb: 2, color: '#f5f5f5' }}>
                    Tracks ({tracks.length})
                </Typography>
                
                {!auth?.authenticated && (
                    <Alert severity="info" sx={{ mb: 2, bgcolor: 'rgba(196,92,58,0.15)', color: '#f5f5f5', border: '1px solid rgba(196,92,58,0.3)' }}>
                        🎵 Sign in with your DID to stream full tracks and receive a Fan Credential
                    </Alert>
                )}

                <List sx={{ backgroundColor: '#1a1a1a', borderRadius: 2, border: '1px solid #333' }}>
                    {tracks.map((track) => (
                        <ListItem key={track.number} disablePadding divider sx={{ borderColor: '#333' }}>
                            <ListItemButton 
                                onClick={() => handlePlayTrack(track.number)}
                                sx={{ '&:hover': { bgcolor: 'rgba(196,92,58,0.1)' } }}
                            >
                                <ListItemIcon sx={{ minWidth: 40 }}>
                                    {auth?.authenticated ? (
                                        currentTrack === track.number && isPlaying ? (
                                            <PauseIcon sx={{ color: '#c45c3a' }} />
                                        ) : (
                                            <PlayArrowIcon sx={{ color: '#888' }} />
                                        )
                                    ) : (
                                        <LockIcon sx={{ color: '#555' }} />
                                    )}
                                </ListItemIcon>
                                <ListItemText
                                    primary={`${track.number}. ${track.title}`}
                                    secondary={track.duration}
                                    primaryTypographyProps={{
                                        fontWeight: currentTrack === track.number ? 600 : 400,
                                        color: currentTrack === track.number ? '#c45c3a' : '#f5f5f5',
                                    }}
                                    secondaryTypographyProps={{
                                        color: '#888',
                                    }}
                                />
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            </Box>

            {/* Credits */}
            <Box sx={{ maxWidth: 800, mx: 'auto', mb: 4 }}>
                <Typography variant="h5" sx={{ mb: 2, color: '#f5f5f5' }}>
                    Performers
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {metadata.performers.map((performer, i) => (
                        <Box
                            key={i}
                            sx={{
                                px: 2,
                                py: 1,
                                backgroundColor: '#242424',
                                borderRadius: 2,
                                border: '1px solid #333',
                            }}
                        >
                            <Typography variant="body2" sx={{ color: '#ccc' }}>{performer}</Typography>
                        </Box>
                    ))}
                </Box>
            </Box>

            {/* Provenance */}
            <Box sx={{ maxWidth: 800, mx: 'auto', mb: 4, textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: '#666' }}>
                    Self-sovereign music publishing powered by{' '}
                    <a href="https://archon.technology" target="_blank" rel="noopener noreferrer" style={{ color: '#c45c3a' }}>
                        Archon Protocol
                    </a>
                    {' • '}
                    <a href={`https://ipfs.io/ipfs/${metadata.cid}`} target="_blank" rel="noopener noreferrer" style={{ color: '#c45c3a' }}>
                        View on IPFS
                    </a>
                </Typography>
            </Box>

            {/* Sticky Player */}
            {currentTrack && (
                <StickyPlayer
                    track={tracks.find(t => t.number === currentTrack)!}
                    isPlaying={isPlaying}
                    currentTime={currentTime}
                    duration={duration}
                    onPlayPause={() => {
                        if (isPlaying) {
                            audioRef.current?.pause();
                            setIsPlaying(false);
                        } else {
                            audioRef.current?.play();
                            setIsPlaying(true);
                        }
                    }}
                    onSeek={(time) => {
                        if (audioRef.current) {
                            audioRef.current.currentTime = time;
                            setCurrentTime(time);
                        }
                    }}
                    onClose={() => {
                        audioRef.current?.pause();
                        setCurrentTrack(null);
                        setIsPlaying(false);
                    }}
                    onNext={() => {
                        if (currentTrack < tracks.length) {
                            setCurrentTrack(currentTrack + 1);
                            setIsPlaying(true);
                        }
                    }}
                    onPrev={() => {
                        if (currentTrack > 1) {
                            setCurrentTrack(currentTrack - 1);
                            setIsPlaying(true);
                        }
                    }}
                />
            )}

            {/* Hidden audio element */}
            <audio
                ref={audioRef}
                onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
                onEnded={() => {
                    setIsPlaying(false);
                    // Auto-advance to next track
                    if (currentTrack && currentTrack < tracks.length) {
                        setCurrentTrack(currentTrack + 1);
                        setIsPlaying(true);
                    }
                }}
            />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────

function ViewLogin() {
    const [challengeDID, setChallengeDID] = useState<string>('');
    const [challengeURL, setChallengeURL] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const navigate = useNavigate();
    const intervalRef = useRef<number | null>(null);

    useEffect(() => {
        const init = async () => {
            try {
                // Poll for auth completion
                intervalRef.current = window.setInterval(async () => {
                    const res = await api.get('/auth/status');
                    if (res.data.authenticated) {
                        clearInterval(intervalRef.current!);
                        navigate('/');
                    }
                }, 2000);

                // Get challenge
                const res = await api.get('/auth/challenge');
                setChallengeDID(res.data.challenge);
                setChallengeURL(res.data.walletURL);
            } catch (error) {
                console.error('Login init error:', error);
            }
        };

        init();
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [navigate]);

    const copyChallenge = async () => {
        await navigator.clipboard.writeText(challengeDID);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #1f1a14 0%, #12100d 100%)',
                p: 2,
            }}
        >
            <Dialog 
                open 
                onClose={() => navigate('/')} 
                maxWidth="xs" 
                fullWidth
                PaperProps={{
                    sx: {
                        bgcolor: '#241f19',
                        color: '#f5f0e8',
                        border: '1px solid #3d352a',
                    }
                }}
            >
                <DialogContent sx={{ textAlign: 'center', pt: 3 }}>
                    <Typography variant="h5" sx={{ mb: 1, fontWeight: 600, color: '#f5f0e8' }}>
                        🎵 Join as Fan
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#a89a88', mb: 3 }}>
                        Scan with Archon Wallet to authenticate and receive your Fan Credential.
                    </Typography>

                    {challengeURL && (
                        <Box
                            component="a"
                            href={challengeURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="qr-container"
                            sx={{
                                display: 'inline-flex',
                                p: 2,
                                borderRadius: 2,
                                backgroundColor: '#f5f0e8',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                            }}
                        >
                            <QRCodeSVG value={challengeURL} size={180} fgColor="#241f19" bgColor="#f5f0e8" />
                        </Box>
                    )}

                    <Typography variant="caption" sx={{ display: 'block', mt: 2, color: '#a89a88', fontFamily: 'monospace' }}>
                        {challengeDID.substring(0, 32)}...
                    </Typography>
                </DialogContent>

                <DialogActions sx={{ justifyContent: 'center', gap: 1, pb: 3 }}>
                    <Button 
                        variant="outlined" 
                        onClick={copyChallenge} 
                        disabled={copied}
                        sx={{ borderColor: '#3d352a', color: '#f5f0e8', '&:hover': { borderColor: '#c45c3a', bgcolor: 'rgba(196,92,58,0.1)' } }}
                    >
                        {copied ? 'Copied!' : 'Copy Challenge'}
                    </Button>
                    <Button 
                        variant="text" 
                        onClick={() => navigate('/')}
                        sx={{ color: '#a89a88' }}
                    >
                        Cancel
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────────────────────

function ViewLogout() {
    const navigate = useNavigate();

    useEffect(() => {
        const logout = async () => {
            await api.post('/auth/logout');
            navigate('/');
        };
        logout();
    }, [navigate]);

    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Credential View
// ─────────────────────────────────────────────────────────────────────────────

function ViewCredential() {
    const [credentialData, setCredentialData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const fetch = async () => {
            try {
                const res = await api.get('/credentials');
                setCredentialData(res.data);
            } catch (err: any) {
                if (err.response?.status === 401) {
                    navigate('/login');
                } else {
                    setError(err.response?.data?.error || 'Failed to fetch credential');
                }
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [navigate]);

    if (loading) return <LoadingShell title="My Credential" />;

    return (
        <div className="App">
            <Header title="My Fan Credential" />

            <Box sx={{ maxWidth: 700, mx: 'auto' }}>
                {error && <Alert severity="error" sx={{ mb: 2, bgcolor: 'rgba(220,38,38,0.15)', color: '#f5f0e8', border: '1px solid rgba(220,38,38,0.3)' }}>{error}</Alert>}

                {!credentialData?.hasCredential ? (
                    <Alert severity="info" sx={{ bgcolor: 'rgba(196,92,58,0.15)', color: '#f5f0e8', border: '1px solid rgba(196,92,58,0.3)' }}>
                        No credential yet. Your Fan Credential will be issued automatically when you sign in.
                    </Alert>
                ) : (
                    <Box>
                        {(() => {
                            const accessLevel = credentialData.credential?.credentialSubject?.accessLevel || 'fan';
                            const archonHandle = credentialData.credential?.credentialSubject?.archonHandle;
                            const isVip = accessLevel === 'vip';
                            
                            return (
                                <Box sx={{
                                    backgroundColor: isVip ? 'rgba(196, 92, 58, 0.15)' : 'rgba(127, 176, 105, 0.15)',
                                    borderRadius: 2,
                                    p: 3,
                                    mb: 3,
                                    textAlign: 'center',
                                    border: isVip ? '1px solid rgba(196, 92, 58, 0.3)' : '1px solid rgba(127, 176, 105, 0.3)',
                                }}>
                                    <Typography variant="h5" sx={{ color: isVip ? '#c45c3a' : '#7fb069', mb: 1 }}>
                                        {isVip ? '⭐ Verified VIP' : '✓ Verified Fan'}
                                    </Typography>
                                    {archonHandle && (
                                        <Typography variant="h6" sx={{ color: '#f5f0e8', mb: 1 }}>
                                            {archonHandle}@archon.social
                                        </Typography>
                                    )}
                                    <Typography variant="body2" sx={{ color: '#a89a88' }}>
                                        Issued: {credentialData.credentialIssuedAt
                                            ? format(new Date(credentialData.credentialIssuedAt), 'MMM d, yyyy')
                                            : 'Unknown'}
                                    </Typography>
                                </Box>
                            );
                        })()}

                        <Typography variant="h6" sx={{ mb: 1, color: '#f5f0e8' }}>Credential DID</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', mb: 3, color: '#c45c3a' }}>
                            {credentialData.credentialDid}
                        </Typography>

                        <Typography variant="h6" sx={{ mb: 1, color: '#f5f0e8' }}>Verifiable Credential</Typography>
                        <Box sx={{ backgroundColor: '#12100d', borderRadius: 2, p: 2, overflow: 'auto', border: '1px solid #3d352a' }}>
                            <pre style={{ color: '#a89a88', margin: 0, fontSize: '0.8rem' }}>
                                {JSON.stringify(credentialData.credential, null, 2)}
                            </pre>
                        </Box>

                        {/* VIP upgrade tip for non-VIP users */}
                        {credentialData.credential?.credentialSubject?.accessLevel !== 'vip' && (
                            <Box sx={{ 
                                mt: 3, 
                                p: 2, 
                                backgroundColor: 'rgba(196,92,58,0.1)', 
                                borderRadius: 2,
                                border: '1px solid rgba(196,92,58,0.2)',
                            }}>
                                <Typography variant="body2" sx={{ color: '#f5f0e8', mb: 1 }}>
                                    ⭐ <strong>Upgrade to VIP</strong>
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#a89a88' }}>
                                    Claim your @name on{' '}
                                    <a 
                                        href="https://archon.social" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        style={{ color: '#c45c3a' }}
                                    >
                                        archon.social
                                    </a>
                                    {' '}and log in again to get VIP status with your handle in your credential.
                                </Typography>
                            </Box>
                        )}
                    </Box>
                )}

                <Box sx={{ mt: 3, textAlign: 'center' }}>
                    <Button 
                        component={Link} 
                        to="/" 
                        variant="outlined"
                        sx={{ borderColor: '#3d352a', color: '#f5f0e8', '&:hover': { borderColor: '#c45c3a', bgcolor: 'rgba(196,92,58,0.1)' } }}
                    >
                        ← Back to Album
                    </Button>
                </Box>
            </Box>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fans List (optional, for owner)
// ─────────────────────────────────────────────────────────────────────────────

function ViewFans() {
    const [fans, setFans] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetch = async () => {
            try {
                const res = await api.get('/admin/fans');
                setFans(res.data);
            } catch {
                navigate('/');
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [navigate]);

    if (loading) return <LoadingShell title="Fans" />;

    const fanList = Object.entries(fans);

    return (
        <div className="App">
            <Header title="Registered Fans" />

            <Box sx={{ maxWidth: 800, mx: 'auto' }}>
                <Typography variant="body2" sx={{ mb: 2, color: '#666' }}>
                    {fanList.length} registered {fanList.length === 1 ? 'fan' : 'fans'}
                </Typography>

                <List sx={{ backgroundColor: '#fff', borderRadius: 2 }}>
                    {fanList.map(([did, fan]) => (
                        <ListItem key={did} divider>
                            <ListItemText
                                primary={did.substring(0, 32) + '...'}
                                secondary={`Logins: ${fan.logins || 0} • Joined: ${fan.firstLogin?.substring(0, 10)}`}
                                primaryTypographyProps={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                            />
                        </ListItem>
                    ))}
                </List>

                <Box sx={{ mt: 3, textAlign: 'center' }}>
                    <Button component={Link} to="/" variant="outlined">
                        ← Back to Album
                    </Button>
                </Box>
            </Box>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 404
// ─────────────────────────────────────────────────────────────────────────────

function NotFound() {
    const navigate = useNavigate();
    useEffect(() => { navigate('/'); }, [navigate]);
    return null;
}

export default App;
