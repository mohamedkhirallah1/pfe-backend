#!/bin/bash
# ==============================================================================
# Smart Fiber - Azure Ubuntu VM Automated Setup Script
# ==============================================================================
# Run this script on your fresh Azure Ubuntu 22.04 / 24.04 VM:
# chmod +x azure-vm-setup.sh && sudo ./azure-vm-setup.sh
# ==============================================================================

set -e

echo "🚀 [1/5] Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

echo "📦 [2/5] Installing prerequisites, Git, curl, UFW..."
sudo apt-get install -y ca-certificates curl gnupg lsb-release git ufw

echo "🐳 [3/5] Installing Docker and Docker Compose Plugin..."
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable docker on boot and allow current user to use docker without sudo
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER

echo "🛡️ [4/5] Configuring Ubuntu Firewall (UFW)..."
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw --force enable

echo "✅ [5/5] Docker and System Setup Complete!"
echo ""
echo "Next steps to run your Smart Fiber Stack:"
echo "1. Clone your repository: git clone https://github.com/mohamedkhirallah1/pfe-backend.git smart-fiber"
echo "2. cd smart-fiber"
echo "3. Copy env template: cp .env.production.example .env"
echo "4. Edit secrets: nano .env"
echo "5. Start all containers: docker compose -f docker-compose.prod.yml up -d --build"
echo "6. Seed database network: docker compose -f docker-compose.prod.yml exec backend npm run seed:network"
echo "=============================================================================="
