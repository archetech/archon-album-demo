# album.archon.technology — Self-Sovereign Music Publishing Demo

## Overview

A demonstration of self-sovereign publishing using Archon technology. The album itself is a DID-holding entity that:
- **Is** the official identity of the music release
- **Issues** credentials to fans, artists, and rights holders
- **Controls** access to content through verifiable membership

## The Album

**Ensemble:** Les Troyens  
**Recorded:** Montreal, 2007  
**Genre:** Sacred choral music  
**Content:** 8 tracks + cover art (~42MB)

### Credits

**Production & Direction:**
- Pascale Verstrepen

**Les Troyens:**
- Ronald Desbiens, tenor
- Daniel Lajeunesse, tenor
- Christian Saucier, tenor
- Luc Charest, baryton
- Réal Robitaille, baryton

### Track Listing
1. Trut Avant Il Faut Boire
2. Alle Psalite (13th century)
3. Stella Splendens (Llibre Vermell, 1399)
4. Gloire Immortelle (Gounod)
5. Cantique de Jean Racine (Fauré)
6. Amazing Grace (Traditional)
7. Ave Maria (Bruckner)
8. Calme Des Nuits (Saint-Saëns)

**Source:** `ipfs://bafybeic4g2adodxjbpwp3nf5bnpry7bdzrzo5m7jmyfeddzmcb3h66y564`

---

## Architecture

### The Album DID

The album itself has a Keymaster wallet and DID identity:
- **DID:** `did:cid:bagaaiera...` (created at deployment)
- **Wallet location:** Server-side, managed by album.archon.technology
- **Agent name:** `les-troyens-2007` (or similar)

### DID Properties (Public Metadata)

The album documents itself as publicly visible DID properties:

```json
{
  "album:title": "Les Troyens",
  "album:recorded": "2007",
  "album:location": "Montreal, QC, Canada",
  "album:genre": "Sacred Choral",
  "album:tracks": 8,
  "album:ipfs": "bafybeic4g2adodxjbpwp3nf5bnpry7bdzrzo5m7jmyfeddzmcb3h66y564",
  "album:cover": "ipfs://Qmeaf8LyEm4CJp5pS3SNDieWn9tX4RvdejJtVC7oGfzbn6"
}
```

Anyone can resolve the album's DID and see this metadata — no authentication required.

---

## Access Levels

### 1. Public (No Authentication)
- View album metadata (title, artists, track listing)
- See cover art
- Listen to **preview clips** (30-second samples)
- Invitation to register

### 2. Member (Authenticated DID + Fan Credential)
- Full album streaming
- Download tracks
- View liner notes / credits
- Receive "Fan" credential from album

### 3. Artist (Contributor Credential)
- All member access
- Listed in official credits
- "Contributor" credential proving participation
- Could enable royalty distribution (future)

### 4. Rights Holder
- Administrative access
- Can authorize new credential types
- "Rights Holder" credential for legal provenance

---

## Credential Schemas

### Fan Credential
Issued to members who register with the album.

```json
{
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  "type": ["VerifiableCredential", "AlbumFanCredential"],
  "issuer": "did:cid:...(album DID)",
  "credentialSubject": {
    "id": "did:cid:...(fan DID)",
    "album": "Les Troyens (2007)",
    "memberSince": "2026-04-02",
    "accessLevel": "member"
  }
}
```

### Contributor Credential
Issued to artists who performed on the album.

```json
{
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  "type": ["VerifiableCredential", "AlbumContributorCredential"],
  "issuer": "did:cid:...(album DID)",
  "credentialSubject": {
    "id": "did:cid:...(artist DID)",
    "album": "Les Troyens (2007)",
    "role": "Vocalist",
    "tracks": [1, 2, 3, 4, 5, 6, 7, 8]
  }
}
```

### Rights Holder Credential
For copyright/distribution rights.

```json
{
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  "type": ["VerifiableCredential", "AlbumRightsCredential"],
  "issuer": "did:cid:...(album DID)",
  "credentialSubject": {
    "id": "did:cid:...(rights holder DID)",
    "album": "Les Troyens (2007)",
    "rights": ["reproduction", "distribution", "public-performance"],
    "territory": "worldwide",
    "validFrom": "2007-01-01"
  }
}
```

---

## User Flows

### Fan Registration
1. Visitor arrives at album.archon.technology
2. Sees preview content (cover, samples, metadata)
3. Clicks "Join" → DID challenge/response auth
4. Album issues "Fan" credential to visitor's DID
5. Visitor gains full streaming/download access

### Artist Claiming Credit
1. Artist registers with their DID
2. Album (via admin) issues "Contributor" credential
3. Artist can now prove participation cryptographically
4. Credential is publicly verifiable

### Verifying Fan Status
1. Third party (concert venue, merch store) requests proof
2. Fan presents Fan credential
3. Verifier confirms: issued by album DID, not revoked
4. Fan gets access/discount/recognition

---

## Technical Implementation

### Stack
- **Frontend:** React (similar to archon-social)
- **Backend:** Express + Keymaster SDK
- **Auth:** DID challenge/response (same as archon.social)
- **Storage:** IPFS for media, Gatekeeper for DIDs
- **Hosting:** album.archon.technology (nginx → Node)

### Server Wallet
The album's wallet runs server-side:
```
/opt/album-archon/wallet/
├── wallet.json
└── .env (ARCHON_GATEKEEPER_URL, ARCHON_PASSPHRASE)
```

### API Endpoints
```
GET  /                     → Public landing page
GET  /api/metadata         → Album DID properties
GET  /api/tracks           → Track listing (public)
GET  /api/preview/:track   → 30-sec preview (public)

POST /api/auth/challenge   → DID auth challenge
POST /api/auth/verify      → Verify challenge response

GET  /api/stream/:track    → Full track (member+)
GET  /api/download/:track  → Download (member+)

POST /api/credentials/fan  → Issue fan credential
GET  /api/credentials/mine → List credentials held
```

---

## Why This Demo Matters

1. **DIDs aren't just for people** — Projects, albums, organizations can be sovereign entities
2. **Content gating without platforms** — No Spotify, no Bandcamp, no middleman
3. **Verifiable fandom** — Fans can prove their relationship to the album
4. **Artist attribution** — Cryptographic proof of contribution
5. **Rights management** — Clear, verifiable chain of custody
6. **IPFS + DIDs** — Content-addressed media + self-sovereign identity

---

## C2PA / Creators Assertion Workgroup Relevance

This demo directly addresses the Creators Assertion workgroup's core challenges:

### 1. Creator Attribution Without Platforms
Traditional music attribution depends on ISRC codes, PROs, and centralized databases. This demo shows:
- **Each contributor has a DID** they control
- **The album issues Contributor credentials** binding role to identity
- **No registry dependency** — credentials are self-verifying

### 2. Machine-Readable Rights Declarations
Using our consent properties framework (see `archon/proposals/consent-properties/`):

```json
{
  "consent:training": "deny",
  "consent:reproduction": "allow:non-commercial",
  "consent:attribution": "require",
  "consent:contact": "did:cid:...(rights holder DID)"
}
```

These properties are:
- Attached to the album's DID (publicly readable)
- Machine-readable for AI systems checking permissions
- Updateable by the rights holder without platform intervention

### 3. Provenance Chain
```
Album DID (les-troyens-2007)
  └── issues Contributor VCs to:
      ├── did:cid:... (Pascale Verstrepen - Producer)
      ├── did:cid:... (Ronald Desbiens - Performer)
      ├── did:cid:... (Daniel Lajeunesse - Performer)
      ├── did:cid:... (Christian Saucier - Performer)
      ├── did:cid:... (Luc Charest - Performer)
      └── did:cid:... (Réal Robitaille - Performer)
```

Any AI or platform encountering this content can:
1. Resolve the album DID from the IPFS CID
2. Read consent properties
3. Verify contributor credentials
4. Contact rights holder via DID

### 4. What C2PA Gets Wrong (and We Fix)

| C2PA Approach | Archon Approach |
|---------------|-----------------|
| Embedded manifests (fragile) | DID resolution (durable) |
| Camera/software attestation | Human creator attestation |
| Requires manifest injection | Works with existing content |
| Platform-dependent verification | Self-verifying credentials |

The album content already exists on IPFS (recorded 2007). We're *adding* verifiable provenance without modifying the original files — exactly what legacy content needs.

---

## Implementation Timeline

### Phase 1: Foundation (Week 1)
- [ ] Create album DID on archon.technology gatekeeper
- [ ] Set album properties (metadata)
- [ ] Set up album.archon.technology domain + nginx
- [ ] Basic React landing page with cover art + track listing

### Phase 2: Auth + Membership (Week 2)
- [ ] DID challenge/response authentication
- [ ] Fan credential issuance on registration
- [ ] Member-only streaming routes

### Phase 3: Polish (Week 3)
- [ ] Preview clips for public access
- [ ] Download functionality
- [ ] Contributor credential schema
- [ ] Admin interface for credential management

### Phase 4: Documentation
- [ ] Tutorial: "How to self-publish with Archon"
- [ ] Video walkthrough
- [ ] Blog post for launch

---

## Open Questions

1. **Audio streaming:** Direct IPFS gateway or proxy through server?
2. ~~**Preview generation:** Pre-cut 30-sec clips or server-side trimming?~~ → **Decided: Pre-cut separate files**
3. **Credential revocation:** If a fan loses access, how to handle?
4. **Multi-album support:** Should this scale to a label/catalog model?
5. **C2PA integration:** Embed DID references in C2PA manifests for hybrid approach?

---

*Proposal by GenitriX-AI for Christian Saucier*  
*April 2, 2026*
