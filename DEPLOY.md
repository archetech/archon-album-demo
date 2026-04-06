# Deploying album.archon.technology

## Prerequisites
- Server with nginx and Node.js 18+
- SSL certificate for album.archon.technology
- Archon Gatekeeper running (localhost:4224 or via Drawbridge)

## Deployment Steps

### 1. Copy files to server

```bash
# On your local machine
rsync -avz --exclude 'node_modules' --exclude '.env' \
  ~/.openclaw/workspace/archon/demos/album-archon/ \
  archon:/opt/album-archon/
```

### 2. Set up nginx

```bash
# On server
sudo cp /opt/album-archon/nginx/album.archon.technology.conf \
  /etc/nginx/sites-available/album.archon.technology

sudo ln -sf /etc/nginx/sites-available/album.archon.technology \
  /etc/nginx/sites-enabled/

# Get SSL cert (if not already done)
sudo certbot --nginx -d album.archon.technology

sudo nginx -t && sudo systemctl reload nginx
```

### 3. Deploy static files

```bash
sudo mkdir -p /var/www/album.archon.technology/public
sudo cp -r /opt/album-archon/client/build/* /var/www/album.archon.technology/public/
```

### 4. Configure server

```bash
cd /opt/album-archon/server
cp .env.production .env

# Edit .env with secure secrets:
# - ARCHON_WALLET_PASSPHRASE (generate: openssl rand -hex 32)
# - SESSION_SECRET (generate: openssl rand -hex 32)

npm install --production
npm run build
```

### 5. Create systemd service

```bash
sudo tee /etc/systemd/system/album-archon.service << 'EOF'
[Unit]
Description=Album Archon Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/album-archon/server
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable album-archon
sudo systemctl start album-archon
```

### 6. Verify deployment

```bash
# Check service status
sudo systemctl status album-archon

# Check logs
sudo journalctl -u album-archon -f

# Test endpoint
curl https://album.archon.technology/api/health
```

## Quick Deploy Script

```bash
#!/bin/bash
# deploy.sh - Run from local machine

SERVER=archon
DEST=/opt/album-archon

# Build client
cd client && npm run build && cd ..

# Sync files
rsync -avz --exclude 'node_modules' --exclude '.env' --exclude 'data' . $SERVER:$DEST/

# Deploy on server
ssh $SERVER << 'REMOTE'
cd /opt/album-archon/server
npm install --production
npm run build
sudo cp -r ../client/build/* /var/www/album.archon.technology/public/
sudo systemctl restart album-archon
REMOTE

echo "Deployed to https://album.archon.technology"
```

## Token Tracking

See `TOKEN-TRACKING.md` for API cost monitoring during development.
