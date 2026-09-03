#!/bin/bash
# ==============================================================================
# Smart Fiber - Automated SSL Certificate Setup (Let's Encrypt / Certbot)
# ==============================================================================
# Usage: ./setup-ssl.sh your-domain.francecentral.cloudapp.azure.com your-email@example.com
# ==============================================================================

DOMAIN=$1
EMAIL=$2

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "❌ Usage: $0 <DOMAIN_NAME> <EMAIL_ADDRESS>"
    echo "Example: $0 smartfiber.francecentral.cloudapp.azure.com admin@example.com"
    exit 1
fi

echo "🔒 Setting up SSL for domain: $DOMAIN ..."

# 1. Install certbot
sudo apt-get update
sudo apt-get install -y certbot

# 2. Stop Nginx container temporarily to free port 80 for standalone verification
echo "⏸️ Temporarily stopping Nginx container..."
docker compose -f docker-compose.prod.yml stop nginx

# 3. Obtain certificate
echo "📜 Requesting SSL Certificate from Let's Encrypt..."
sudo certbot certonly --standalone -d $DOMAIN --non-interactive --agree-tos -m $EMAIL

# 4. Copy certificate paths into nginx volume structure
mkdir -p ./nginx/certbot/conf/live/$DOMAIN
sudo cp -L /etc/letsencrypt/live/$DOMAIN/fullchain.pem ./nginx/certbot/conf/live/$DOMAIN/
sudo cp -L /etc/letsencrypt/live/$DOMAIN/privkey.pem ./nginx/certbot/conf/live/$DOMAIN/

# 5. Update Nginx configuration for HTTPS
cat << 'EOF' > ./nginx/nginx.conf
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 50M;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    upstream backend_upstream {
        server backend:3001;
        keepalive 32;
    }

    # HTTP Redirect to HTTPS
    server {
        listen 80;
        listen [::]:80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    # HTTPS Server
    server {
        listen 443 ssl http2;
        listen [::]:443 ssl http2;
        server_name _;

        ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        location / {
            root /usr/share/nginx/html;
            index index.html index.htm;
            try_files $uri $uri/ /index.html;
        }

        location /api/ {
            proxy_pass http://backend_upstream;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_read_timeout 90s;
        }

        location /socket.io/ {
            proxy_pass http://backend_upstream;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_read_timeout 86400s;
            proxy_send_timeout 86400s;
        }
    }
}
EOF

sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" ./nginx/nginx.conf

# 6. Restart Nginx
echo "🚀 Starting Nginx with HTTPS enabled..."
docker compose -f docker-compose.prod.yml up -d nginx

echo "✅ SSL Certificate successfully installed and active on https://$DOMAIN"
