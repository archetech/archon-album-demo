# Archon Album Demo — Self-Sovereign Music Publishing

A reference implementation for self-publishing music using [Archon Protocol](https://archon.technology). 

**Live Demo:** https://album.archon.technology

The album itself is a DID-holding entity that controls access to content through verifiable credentials.

## Overview

This demo shows how to:
- **Create an album identity** (the album has its own DID)
- **Authenticate fans** using QR code challenge/response
- **Issue verifiable credentials** proving fan membership
- **Gate content access** to credential holders
- **Serve public previews** to unauthenticated visitors

## Quick Start

### Prerequisites

1. **Archon Gatekeeper** running (e.g., at `http://localhost:4224`)
2. **Node.js** 18+ installed

### Setup

```bash
# Clone and install
cd server
cp sample.env .env
npm install
npm run build

# Configure .env with your gatekeeper URL and passphrase
# See sample.env for all options

# Start the server
npm start
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 4260 |
| `ARCHON_GATEKEEPER_URL` | Your Gatekeeper instance | http://localhost:4224 |
| `ARCHON_WALLET_PASSPHRASE` | **Required** — wallet encryption | - |
| `ARCHON_WALLET_URL` | Wallet app for QR auth | https://wallet.archon.technology |
| `SESSION_SECRET` | **Required** — session encryption | - |
| `PUBLIC_URL` | Callback URL for auth | http://localhost:4260 |
| `ALBUM_NAME` | Identity name for album | album |
| `ALBUM_CID` | IPFS CID for album content | - |
| `OWNER_DID` | Admin DID (optional) | - |

## API Reference

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/metadata` | Album info (title, artists, etc.) |
| GET | `/api/tracks` | Track listing (titles + durations) |
| GET | `/api/cover` | Album cover art (redirects to IPFS) |
| GET | `/api/preview/:track` | 30-second preview clip |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/challenge` | Get QR code challenge |
| GET/POST | `/api/auth/callback` | Submit challenge response |
| GET | `/api/auth/status` | Check auth status |
| POST | `/api/auth/logout` | Clear session |

### Protected (Fans Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stream/:track` | Full track streaming |
| GET | `/api/credentials` | Get your fan credential |

### Admin (Owner Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/fans` | List all registered fans |

## Authentication Flow

1. **Client** calls `GET /api/auth/challenge`
2. **Server** returns `{ challenge, walletURL }` where `walletURL` encodes the challenge
3. **Client** displays QR code with `walletURL`
4. **User** scans with Archon Wallet app, approves challenge
5. **Wallet** calls `GET /api/auth/callback?response=did:cid:...`
6. **Server** verifies response, creates session, issues Fan credential
7. **Client** polls `/api/auth/status` until authenticated

## Credential Schema

When a fan authenticates, they receive a verifiable credential:

```json
{
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  "type": ["VerifiableCredential"],
  "issuer": "did:cid:...(album DID)",
  "credentialSubject": {
    "id": "did:cid:...(fan DID)",
    "album": "Les Troyens",
    "albumDid": "did:cid:...",
    "memberSince": "2026-04-06T...",
    "accessLevel": "fan"
  }
}
```

This credential can be verified anywhere — the fan can prove they're a member without the album server being involved.

## Project Structure

```
album-archon/
├── client/          # React frontend (optional)
├── server/
│   ├── src/
│   │   ├── index.ts        # Main server
│   │   └── db/             # Database layer
│   ├── data/               # Wallet + fan database
│   ├── package.json
│   └── sample.env
├── nginx/           # Production config
└── docker-compose.yml
```

## Customization

### Adding Your Own Album

1. **Upload tracks to IPFS** — use `ipfs add -r ./my-album/`
2. **Update metadata** in `server/src/index.ts`:
   - `ALBUM_METADATA` — title, performers, etc.
   - `TRACKS` — track listing with filenames
3. **Set `ALBUM_CID`** in your `.env`

### Custom Credential Schemas

Modify `issueFanCredential()` to add custom claims:

```typescript
const credential = await keymaster.bindCredential(fanDid, {
  schema: 'did:cid:your-schema-did',  // Optional schema
  claims: {
    album: ALBUM_TITLE,
    tier: 'gold',
    perks: ['early-access', 'bonus-tracks'],
  }
});
```

## Docker Deployment

```bash
docker compose up --build
```

Configure via environment variables or `.env` file.

## Related Resources

- [Archon Protocol](https://archon.technology)
- [Herald Service](https://github.com/archetech/archon/tree/main/services/herald) — naming + OAuth
- [Keymaster SDK](https://www.npmjs.com/package/@didcid/keymaster)

## License

MIT — fork freely for your own music!

---

*Built with Archon Protocol by Archetech*
