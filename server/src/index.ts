/**
 * Album Archon Server
 * 
 * A self-sovereign music publishing backend using Archon Protocol.
 * This serves as a reference implementation for third-party developers
 * wanting to use Archon for content publishing with DID-based access control.
 * 
 * Features:
 * - DID challenge/response authentication
 * - Fan credential issuance
 * - Access-controlled streaming
 * - Public preview tracks
 * 
 * Based on Archon Herald service architecture.
 */

import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import morgan from 'morgan';
import path from 'path';
import dotenv from 'dotenv';
import cors from 'cors';

import CipherNode from '@didcid/cipher/node';
import GatekeeperClient from '@didcid/gatekeeper/client';
import Keymaster from '@didcid/keymaster';
import WalletJson from '@didcid/keymaster/wallet/json';
import { DatabaseInterface, Fan } from './db/interfaces.js';
import { DbJson } from './db/json.js';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

dotenv.config();

const PORT = Number(process.env.PORT) || 4265;
const GATEKEEPER_URL = process.env.ARCHON_GATEKEEPER_URL || 'http://localhost:4224';
const WALLET_URL = process.env.ARCHON_WALLET_URL || 'https://wallet.archon.technology';
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const SESSION_SECRET = process.env.SESSION_SECRET;
const OWNER_DID = process.env.OWNER_DID || '';
const DATA_DIR = process.env.DATA_DIR || './data';

// Album-specific config
const ALBUM_NAME = process.env.ALBUM_NAME || 'album';
const ALBUM_TITLE = process.env.ALBUM_TITLE || 'Untitled Album';
const ALBUM_DOMAIN = process.env.ALBUM_DOMAIN || 'localhost';
const ALBUM_CID = process.env.ALBUM_CID || '';
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://ipfs.io/ipfs';

if (!SESSION_SECRET || SESSION_SECRET === 'change-me-to-a-random-string') {
  throw new Error('SESSION_SECRET must be set to a secure random value');
}

const WALLET_PASSPHRASE = process.env.ARCHON_WALLET_PASSPHRASE;
if (!WALLET_PASSPHRASE || WALLET_PASSPHRASE === 'change-me-to-a-secure-passphrase') {
  throw new Error('ARCHON_WALLET_PASSPHRASE must be set');
}

// ─────────────────────────────────────────────────────────────────────────────
// Album Metadata
// ─────────────────────────────────────────────────────────────────────────────

interface Track {
  number: number;
  title: string;
  duration: string;
  file: string;       // filename in IPFS directory
  preview?: string;   // preview clip filename (if separate)
}

const ALBUM_METADATA = {
  title: 'Les Troyens',
  year: 2007,
  location: 'Montreal, QC, Canada',
  genre: 'Sacred Choral',
  ensemble: 'Les Troyens',
  producer: 'Pascale Verstrepen',
  performers: [
    'Pascale Verstrepen (piano)',
    'Ronald Desbiens (tenor)',
    'Daniel Lajeunesse (tenor)',
    'Christian Saucier (tenor)',
    'Luc Charest (baryton)',
    'Réal Robitaille (baryton)',
  ],
  cid: ALBUM_CID,
  cover: '00 Cover Art.png',
};

const TRACKS: Track[] = [
  { number: 1, title: 'Trut Avant Il Faut Boire', duration: '3:42', file: '01 Trut Avant Il Faut Boire.mp3' },
  { number: 2, title: 'Alle Psalite (13th century)', duration: '2:58', file: '02 Alle Psalite.mp3' },
  { number: 3, title: 'Stella Splendens (Llibre Vermell, 1399)', duration: '4:15', file: '03 Stella Splendens.mp3' },
  { number: 4, title: 'Gloire Immortelle (Gounod)', duration: '3:21', file: '04 Gloire Immortelle.mp3' },
  { number: 5, title: 'Cantique de Jean Racine (Fauré)', duration: '5:03', file: '05 Cantique de Jean Racine.mp3' },
  { number: 6, title: 'Amazing Grace (Traditional)', duration: '4:47', file: '06 Amazing Grace.mp3' },
  { number: 7, title: 'Ave Maria (Bruckner)', duration: '4:32', file: '07 Ave Maria - Bruckner.mp3' },
  { number: 8, title: 'Calme Des Nuits (Saint-Saëns)', duration: '3:56', file: '08 Calme Des Nuits.mp3' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Express Session Type Extension
// ─────────────────────────────────────────────────────────────────────────────

declare module 'express-session' {
  interface SessionData {
    user?: { did: string };
    challenge?: string;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Globals
// ─────────────────────────────────────────────────────────────────────────────

let keymaster: Keymaster;
let db: DatabaseInterface;
let albumDID = '';

// In-memory challenge tracking (login sessions awaiting response)
const logins: Record<string, {
  response: string;
  challenge: string;
  did: string;
  verify: any;
}> = {};

// ─────────────────────────────────────────────────────────────────────────────
// Express App Setup
// ─────────────────────────────────────────────────────────────────────────────

const app = express();

app.use(morgan('dev'));
app.use(express.json());
app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto',
    sameSite: 'lax',
    httpOnly: true,
  }
}));

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

async function initAlbumIdentity(): Promise<void> {
  const currentId = await keymaster.getCurrentId();

  try {
    const doc = await keymaster.resolveDID(ALBUM_NAME);
    if (!doc.didDocument?.id) {
      throw new Error('No DID found');
    }
    albumDID = doc.didDocument.id;
    console.log(`Album identity: ${ALBUM_NAME} → ${albumDID}`);
  } catch {
    console.log(`Creating album identity: ${ALBUM_NAME}`);
    albumDID = await keymaster.createId(ALBUM_NAME);
    console.log(`Created: ${albumDID}`);
    
    // Set album properties on the DID
    await keymaster.setCurrentId(ALBUM_NAME);
    // Properties could be set here if Keymaster supports it
  }

  if (currentId) {
    await keymaster.setCurrentId(currentId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Authentication Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function loginUser(response: string): Promise<any> {
  const verify = await keymaster.verifyResponse(response, { retries: 10 });

  if (verify.match) {
    const challenge = verify.challenge;
    const did = verify.responder!;
    const now = new Date().toISOString();
    
    let fan = await db.getFan(did);

    if (fan) {
      fan.lastLogin = now;
      fan.logins = (fan.logins || 0) + 1;
    } else {
      fan = {
        firstLogin: now,
        lastLogin: now,
        logins: 1,
        accessLevel: 'fan',
      };
    }
    
    await db.setFan(did, fan);

    logins[challenge] = {
      response,
      challenge,
      did,
      verify,
    };
  }

  return verify;
}

function isAuthenticated(req: Request, res: Response, next: NextFunction): void {
  // Check if session already has user
  if (req.session.user) {
    return next();
  }
  
  // Check if challenge was completed
  if (req.session.challenge) {
    const challengeData = logins[req.session.challenge];
    if (challengeData) {
      req.session.user = { did: challengeData.did };
      return next();
    }
  }

  res.status(401).json({ error: 'Authentication required' });
}

function isOwner(req: Request, res: Response, next: NextFunction): void {
  isAuthenticated(req, res, () => {
    if (req.session.user?.did === OWNER_DID) {
      return next();
    }
    res.status(403).json({ error: 'Owner access required' });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Archon.social Name Lookup
// ─────────────────────────────────────────────────────────────────────────────

const ARCHON_SOCIAL_API = process.env.ARCHON_SOCIAL_API || 'https://archon.social/api';

interface ArchonRegistry {
  version: number;
  updated: string;
  names: Record<string, string>;  // name → did
}

// Cache the registry to avoid hitting the API on every login
let registryCache: ArchonRegistry | null = null;
let registryCacheTime = 0;
const REGISTRY_CACHE_TTL = 60 * 1000; // 1 minute

async function lookupArchonName(did: string): Promise<string | null> {
  try {
    // Check if cache is valid
    const now = Date.now();
    if (!registryCache || now - registryCacheTime > REGISTRY_CACHE_TTL) {
      const response = await fetch(`${ARCHON_SOCIAL_API}/registry`);
      if (!response.ok) {
        console.log(`Failed to fetch archon.social registry: ${response.status}`);
        return null;
      }
      registryCache = await response.json();
      registryCacheTime = now;
      console.log(`Refreshed archon.social registry: ${Object.keys(registryCache?.names || {}).length} names`);
    }
    
    // Reverse lookup: find name for this DID
    if (registryCache?.names) {
      for (const [name, registryDid] of Object.entries(registryCache.names)) {
        if (registryDid === did) {
          console.log(`Found archon.social name for ${did}: @${name}`);
          return name;
        }
      }
    }
    
    console.log(`No archon.social name found for ${did}`);
    return null;
  } catch (error) {
    console.log(`Could not lookup archon.social name for ${did}:`, error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Credential Issuance
// ─────────────────────────────────────────────────────────────────────────────

async function issueFanCredential(fanDid: string, archonName?: string | null): Promise<string> {
  await keymaster.setCurrentId(ALBUM_NAME);
  
  const isVip = !!archonName;
  const accessLevel = isVip ? 'vip' : 'fan';
  
  const claims: Record<string, any> = {
    album: ALBUM_TITLE,
    albumDid: albumDID,
    memberSince: new Date().toISOString(),
    accessLevel,
  };
  
  if (archonName) {
    claims.archonHandle = `@${archonName}`;
  }
  
  const credential = await keymaster.bindCredential(fanDid, {
    validFrom: new Date().toISOString(),
    claims,
  });
  
  const credentialDid = await keymaster.issueCredential(credential);
  console.log(`Issued ${accessLevel} credential ${credentialDid} for ${fanDid}${archonName ? ` (@${archonName})` : ''}`);
  
  return credentialDid;
}

async function upgradeCredentialToVip(credentialDid: string, fanDid: string, archonName: string): Promise<boolean> {
  await keymaster.setCurrentId(ALBUM_NAME);
  
  // Get existing credential
  const existingCredential = await keymaster.getCredential(credentialDid);
  if (!existingCredential || !existingCredential.credentialSubject) {
    console.error(`Could not fetch credential ${credentialDid} for upgrade`);
    return false;
  }
  
  // Update the claims
  const subject = existingCredential.credentialSubject as Record<string, any>;
  subject.accessLevel = 'vip';
  subject.archonHandle = `@${archonName}`;
  subject.upgradedAt = new Date().toISOString();
  
  // Update credential (maintains version history)
  const updated = await keymaster.updateCredential(credentialDid, existingCredential);
  console.log(`Upgraded credential ${credentialDid} to VIP for ${fanDid} (@${archonName})`);
  
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Routes: Public
// ─────────────────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, album: ALBUM_NAME, did: albumDID });
});

// Album metadata (public)
app.get('/api/metadata', (_req, res) => {
  res.json({
    ...ALBUM_METADATA,
    did: albumDID,
    trackCount: TRACKS.length,
  });
});

// Track listing (public - titles and durations, no streaming URLs)
app.get('/api/tracks', (_req, res) => {
  const publicTracks = TRACKS.map(t => ({
    number: t.number,
    title: t.title,
    duration: t.duration,
  }));
  res.json(publicTracks);
});

// Cover art (public)
app.get('/api/cover', (_req, res) => {
  if (!ALBUM_CID) {
    res.status(404).json({ error: 'Album CID not configured' });
    return;
  }
  const encodedCover = encodeURIComponent(ALBUM_METADATA.cover);
  res.redirect(`${IPFS_GATEWAY}/${ALBUM_CID}/${encodedCover}`);
});

// Preview clip (public - 30 second samples)
app.get('/api/preview/:track', (req, res) => {
  const trackNum = parseInt(req.params.track, 10);
  const track = TRACKS.find(t => t.number === trackNum);
  
  if (!track) {
    res.status(404).json({ error: 'Track not found' });
    return;
  }
  
  // For now, redirect to full track (implement preview clips later)
  // In production, this would serve pre-cut 30-sec samples
  if (!ALBUM_CID) {
    res.status(404).json({ error: 'Album CID not configured' });
    return;
  }
  
  res.redirect(`${IPFS_GATEWAY}/${ALBUM_CID}/previews/${track.file}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// API Routes: Authentication
// ─────────────────────────────────────────────────────────────────────────────

// Get a challenge for DID authentication
app.get('/api/auth/challenge', async (req, res) => {
  try {
    await keymaster.setCurrentId(ALBUM_NAME);
    
    const challenge = await keymaster.createChallenge({
      callback: `${PUBLIC_URL}/api/auth/callback`,
    });
    
    req.session.challenge = challenge;
    
    // Build wallet URL with challenge parameter
    const walletURL = `${WALLET_URL}?challenge=${challenge}`;
    
    res.json({
      challenge,
      walletURL,
      albumDid: albumDID,
    });
  } catch (error: any) {
    console.error('Challenge creation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Callback for challenge response (GET - for wallet redirect)
app.get('/api/auth/callback', async (req, res) => {
  try {
    const { response } = req.query;
    
    if (typeof response !== 'string') {
      res.status(400).json({ error: 'Missing response parameter' });
      return;
    }
    
    const verify = await loginUser(response);
    
    if (verify.match) {
      req.session.user = { did: verify.responder };
      
      // Check if fan needs credential or upgrade
      const fan = await db.getFan(verify.responder);
      if (fan) {
        try {
          // Lookup archon.social name for VIP status
          const archonName = await lookupArchonName(verify.responder);
          
          const needsCredential = !fan.credentialDid;
          const needsUpgrade = archonName && fan.accessLevel !== 'vip' && fan.credentialDid;
          
          if (needsCredential) {
            // First-time credential issuance
            if (archonName) {
              fan.archonHandle = `@${archonName}`;
              fan.accessLevel = 'vip';
            }
            
            const credDid = await issueFanCredential(verify.responder, archonName);
            fan.credentialDid = credDid;
            fan.credentialIssuedAt = new Date().toISOString();
            await db.setFan(verify.responder, fan);
          } else if (needsUpgrade) {
            // Upgrade existing credential to VIP (maintains version history)
            const upgraded = await upgradeCredentialToVip(fan.credentialDid!, verify.responder, archonName!);
            if (upgraded) {
              fan.archonHandle = `@${archonName}`;
              fan.accessLevel = 'vip';
              fan.upgradedAt = new Date().toISOString();
              await db.setFan(verify.responder, fan);
            }
          }
        } catch (err) {
          console.error('Failed to issue/upgrade credential:', err);
        }
      }
      
      res.json({ authenticated: true, did: verify.responder });
    } else {
      res.json({ authenticated: false });
    }
  } catch (error: any) {
    console.error('Auth callback failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Callback for challenge response (POST - for programmatic auth)
app.post('/api/auth/callback', async (req, res) => {
  try {
    const { response } = req.body;
    
    if (typeof response !== 'string') {
      res.status(400).json({ error: 'Missing response in body' });
      return;
    }
    
    const verify = await loginUser(response);
    
    if (verify.match) {
      req.session.user = { did: verify.responder };
      
      // Check if fan needs credential or upgrade
      const fan = await db.getFan(verify.responder);
      if (fan) {
        try {
          // Lookup archon.social name for VIP status
          const archonName = await lookupArchonName(verify.responder);
          
          const needsCredential = !fan.credentialDid;
          const needsUpgrade = archonName && fan.accessLevel !== 'vip' && fan.credentialDid;
          
          if (needsCredential) {
            // First-time credential issuance
            if (archonName) {
              fan.archonHandle = `@${archonName}`;
              fan.accessLevel = 'vip';
            }
            
            const credDid = await issueFanCredential(verify.responder, archonName);
            fan.credentialDid = credDid;
            fan.credentialIssuedAt = new Date().toISOString();
            await db.setFan(verify.responder, fan);
          } else if (needsUpgrade) {
            // Upgrade existing credential to VIP (maintains version history)
            const upgraded = await upgradeCredentialToVip(fan.credentialDid!, verify.responder, archonName!);
            if (upgraded) {
              fan.archonHandle = `@${archonName}`;
              fan.accessLevel = 'vip';
              fan.upgradedAt = new Date().toISOString();
              await db.setFan(verify.responder, fan);
            }
          }
        } catch (err) {
          console.error('Failed to issue/upgrade credential:', err);
        }
      }
      
      res.json({ authenticated: true, did: verify.responder });
    } else {
      res.json({ authenticated: false });
    }
  } catch (error: any) {
    console.error('Auth callback failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check authentication status
app.get('/api/auth/status', async (req, res) => {
  // Check for completed challenge
  if (!req.session.user && req.session.challenge) {
    const challengeData = logins[req.session.challenge];
    if (challengeData) {
      req.session.user = { did: challengeData.did };
    }
  }

  const isAuth = !!req.session.user;
  const userDid = req.session.user?.did || null;
  let fan = null;

  if (isAuth && userDid) {
    fan = await db.getFan(userDid);
  }

  res.json({
    authenticated: isAuth,
    did: userDid,
    isOwner: userDid === OWNER_DID,
    fan,
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Session destroy error:', err);
  });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// API Routes: Protected (Fans Only)
// ─────────────────────────────────────────────────────────────────────────────

// Full track streaming (authenticated fans)
app.get('/api/stream/:track', isAuthenticated, (req, res) => {
  const trackNum = parseInt(req.params.track, 10);
  const track = TRACKS.find(t => t.number === trackNum);
  
  if (!track) {
    res.status(404).json({ error: 'Track not found' });
    return;
  }
  
  if (!ALBUM_CID) {
    res.status(404).json({ error: 'Album CID not configured' });
    return;
  }
  
  // Redirect to IPFS gateway for streaming (URL-encode filename)
  const encodedFile = encodeURIComponent(track.file);
  res.redirect(`${IPFS_GATEWAY}/${ALBUM_CID}/${encodedFile}`);
});

// Get user's credentials
app.get('/api/credentials', isAuthenticated, async (req, res) => {
  const did = req.session.user!.did;
  const fan = await db.getFan(did);
  
  if (!fan?.credentialDid) {
    res.json({ hasCredential: false });
    return;
  }
  
  try {
    const credential = await keymaster.getCredential(fan.credentialDid);
    res.json({
      hasCredential: true,
      credentialDid: fan.credentialDid,
      credentialIssuedAt: fan.credentialIssuedAt,
      credential,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API Routes: Admin (Owner Only)
// ─────────────────────────────────────────────────────────────────────────────

// List all fans
app.get('/api/admin/fans', isOwner, async (_req, res) => {
  const fans = await db.listFans();
  res.json(fans);
});

// ─────────────────────────────────────────────────────────────────────────────
// Server Startup
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', async () => {
  console.log('─'.repeat(60));
  console.log('Album Archon Server');
  console.log('─'.repeat(60));
  
  // Initialize database
  db = new DbJson(path.join(DATA_DIR, 'fans.json'));
  if (db.init) await db.init();
  console.log(`Database: ${DATA_DIR}/fans.json`);
  
  // Initialize Keymaster
  const gatekeeper = new GatekeeperClient();
  await gatekeeper.connect({
    url: GATEKEEPER_URL,
    waitUntilReady: true,
    intervalSeconds: 5,
    chatty: true,
  });
  
  const wallet = new WalletJson('wallet.json', DATA_DIR);
  const cipher = new CipherNode();
  
  keymaster = new Keymaster({
    gatekeeper,
    wallet,
    cipher,
    passphrase: WALLET_PASSPHRASE,
  });
  
  await keymaster.loadWallet();
  console.log(`Gatekeeper: ${GATEKEEPER_URL}`);
  
  // Initialize album identity
  await initAlbumIdentity();
  
  console.log('─'.repeat(60));
  console.log(`Album: ${ALBUM_TITLE}`);
  console.log(`DID: ${albumDID}`);
  console.log(`Tracks: ${TRACKS.length}`);
  console.log(`IPFS: ${ALBUM_CID || '(not configured)'}`);
  console.log('─'.repeat(60));
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
  if (OWNER_DID) {
    console.log(`Owner: ${OWNER_DID}`);
  }
});

// Graceful error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});
