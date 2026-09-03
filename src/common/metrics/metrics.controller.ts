import {
  Body,
  Controller,
  Get,
  Inject,
  Optional,
  Post,
  Res,
  forwardRef,
} from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from './metrics.service';
import { CryptoService } from '../crypto/crypto.service';
import { UsersService } from '../../modules/users/services/users.service';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly cryptoService: CryptoService,
    @Optional()
    @Inject(forwardRef(() => UsersService))
    private readonly usersService?: UsersService,
  ) {}

  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    const metrics = await this.metricsService.getMetrics();
    res.setHeader('Content-Type', this.metricsService.getContentType());
    res.send(metrics);
  }

  @Get('summary')
  async getSummary(): Promise<Record<string, any>> {
    const summary = await this.metricsService.getSummary();
    let realUsers: any[] = [];
    if (this.usersService) {
      try {
        const users = await this.usersService.findAll();
        realUsers = users.map((u: any) => ({
          id: u._id?.toString() || u.id,
          username: u.username,
          role: u.role,
          zoneId: u.zoneId || null,
          isActive: u.isActive !== false,
          createdAt: u.createdAt || null,
        }));
      } catch (err) {
        // fallback
      }
    }
    return {
      ...summary,
      realUsers,
      totalRealUsers: realUsers.length,
    };
  }

  @Get('real-users')
  async getRealUsers(): Promise<{ users: any[] }> {
    if (!this.usersService) return { users: [] };
    const users = await this.usersService.findAll();
    return { users };
  }

  @Post('simulate')
  async simulate(@Body() body: { type: 'bruteforce' | 'success' | 'security_401' | 'create_user' }): Promise<any> {
    if (body.type === 'bruteforce') {
      for (let i = 0; i < 5; i++) {
        this.metricsService.recordAuthAttempt('failure', 'UNKNOWN');
      }
      return { status: 'ok', message: '5 failed login attempts recorded' };
    }
    if (body.type === 'success') {
      this.metricsService.recordAuthAttempt('success', 'ADMIN');
      return { status: 'ok', message: '1 successful login recorded' };
    }
    if (body.type === 'security_401') {
      this.metricsService.recordSecurityEvent('unauthorized_401', '/api/users');
      this.metricsService.recordSecurityEvent('forbidden_403', '/api/admin');
      this.metricsService.recordSecurityEvent('rate_limit_exceeded', '/api/auth/login');
      return { status: 'ok', message: 'Security rejection events recorded' };
    }
    if (body.type === 'create_user') {
      this.metricsService.recordUserOperation('created', 'manager_demo_' + Math.floor(Math.random() * 100), 'RESPONSABLE_ZONE');
      return { status: 'ok', message: 'Zone manager created simulation recorded' };
    }
    return { status: 'error', message: 'Unknown simulation type' };
  }

  @Get('dashboard')
  async getDashboard(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Fiber - Security & Infrastructure Observability</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg-primary: #0b1329;
      --bg-secondary: #17233f;
      --bg-card: #17233f;
      --border-color: #2b3b64;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --accent-green: #10b981;
      --accent-red: #ef4444;
      --accent-orange: #f59e0b;
      --accent-blue: #3b82f6;
      --accent-purple: #8b5cf6;
      --accent-cyan: #06b6d4;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background-color: var(--bg-primary); color: var(--text-primary); padding: 24px; min-height: 100vh; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color); }
    .header-title h1 { font-size: 22px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
    .header-title p { color: var(--text-secondary); font-size: 13px; margin-top: 4px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; background: rgba(16, 185, 129, 0.15); color: var(--accent-green); border: 1px solid var(--accent-green); }
    .pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-green); animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.3); } }
    
    .actions-bar { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; background: var(--bg-secondary); padding: 14px; border-radius: 10px; border: 1px solid var(--border-color); }
    .actions-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-right: 8px; }
    .btn-action { padding: 8px 14px; border-radius: 6px; border: none; font-size: 12px; font-weight: 600; cursor: pointer; transition: transform 0.1s, opacity 0.2s; display: inline-flex; align-items: center; gap: 6px; }
    .btn-action:hover { opacity: 0.9; transform: translateY(-1px); }
    .btn-action:active { transform: translateY(0); }
    .btn-red { background: #dc2626; color: white; }
    .btn-green { background: #059669; color: white; }
    .btn-orange { background: #d97706; color: white; }
    .btn-purple { background: #7c3aed; color: white; }

    .grid-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 18px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2); }
    .stat-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .stat-value { font-size: 32px; font-weight: 800; }
    .stat-sub { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
    
    .val-green { color: var(--accent-green); }
    .val-red { color: var(--accent-red); }
    .val-orange { color: var(--accent-orange); }
    .val-blue { color: var(--accent-blue); }
    .val-purple { color: var(--accent-purple); }
    .val-cyan { color: var(--accent-cyan); }
    
    .grid-charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap: 20px; margin-bottom: 24px; }
    .chart-container { height: 260px; position: relative; width: 100%; }
    .chart-title { font-size: 15px; font-weight: 600; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
    
    .grid-bottom { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 24px; }
    @media (max-width: 900px) { .grid-bottom { grid-template-columns: 1fr; } }

    .users-table-box { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; }
    .table-container { width: 100%; overflow-x: auto; margin-top: 10px; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th { padding: 12px; background: rgba(0,0,0,0.2); color: var(--text-secondary); font-weight: 600; border-bottom: 1px solid var(--border-color); text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
    td { padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-primary); }
    tr:hover td { background: rgba(255,255,255,0.02); }
    .role-badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
    .role-ADMIN { background: rgba(59, 130, 246, 0.2); color: var(--accent-blue); border: 1px solid rgba(59, 130, 246, 0.4); }
    .role-RESPONSABLE_ZONE { background: rgba(139, 92, 246, 0.2); color: var(--accent-purple); border: 1px solid rgba(139, 92, 246, 0.4); }
    .status-dot { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; }
    .dot { width: 7px; height: 7px; border-radius: 50%; }
    .dot-active { background: var(--accent-green); }
    .user-avatar { width: 28px; height: 28px; border-radius: 50%; background: #2b3b64; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; margin-right: 8px; }

    .activity-feed { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; max-height: 380px; overflow-y: auto; }
    .activity-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px; }
    .activity-item:last-child { border-bottom: none; }
    .activity-badge { font-size: 10px; font-weight: 700; padding: 3px 6px; border-radius: 4px; }
    .badge-AUTH { background: rgba(16, 185, 129, 0.2); color: var(--accent-green); }
    .badge-SECURITY { background: rgba(239, 68, 68, 0.2); color: var(--accent-red); }
    .badge-USER { background: rgba(139, 92, 246, 0.2); color: var(--accent-purple); }
    .badge-AI { background: rgba(59, 130, 246, 0.2); color: var(--accent-blue); }
    .badge-NETWORK { background: rgba(245, 158, 11, 0.2); color: var(--accent-orange); }

    /* Crypto Vault Section */
    .crypto-vault-box { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 22px; margin-bottom: 24px; }
    .crypto-badges-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .crypto-badge-item { background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; flex: 1; min-width: 220px; }
    .crypto-icon { font-size: 20px; }
    .crypto-title { font-size: 12px; font-weight: 700; color: var(--text-primary); }
    .crypto-desc { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
    .code-snippet { font-family: monospace; background: #060b18; padding: 4px 8px; border-radius: 4px; font-size: 12px; color: var(--accent-orange); border: 1px solid rgba(255,255,255,0.05); }
    .code-dim { color: #64748b; }
    .code-cipher { color: #38bdf8; word-break: break-all; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">
      <h1>🛡️ Smart Fiber - Security & Infrastructure Observability</h1>
      <p>Surveillance en direct des accès, détection des attaques, gestion des utilisateurs & registre cryptographique</p>
    </div>
    <div class="badge">
      <div class="pulse"></div>
      CONNECTÉ (Live 2s)
    </div>
  </div>

  <div class="actions-bar">
    <span class="actions-label">⚡ Actions Rapides :</span>
    <button class="btn-action btn-red" onclick="triggerSimulation('bruteforce')">🚨 Attaque Bruteforce (+5)</button>
    <button class="btn-action btn-green" onclick="triggerSimulation('success')">✅ Connexion Réussie (+1)</button>
    <button class="btn-action btn-purple" onclick="triggerSimulation('create_user')">👤 Simuler Création User (+1)</button>
    <button class="btn-action btn-orange" onclick="triggerSimulation('security_401')">⛔ Simuler Rejets 401/403/429</button>
  </div>

  <div class="grid-stats">
    <div class="card">
      <div class="stat-label">👥 Total Utilisateurs en Base</div>
      <div class="stat-value val-purple" id="stat-users-total">0</div>
      <div class="stat-sub">Comptes enregistrés dans MongoDB</div>
    </div>
    <div class="card">
      <div class="stat-label">✅ Connexions Réussies</div>
      <div class="stat-value val-green" id="stat-auth-success">0</div>
      <div class="stat-sub">Sessions actives validées</div>
    </div>
    <div class="card">
      <div class="stat-label">🚨 Échecs de Connexion</div>
      <div class="stat-value val-red" id="stat-auth-failure">0</div>
      <div class="stat-sub">Mots de passe incorrects</div>
    </div>
    <div class="card">
      <div class="stat-label">⛔ Menaces Bloquées (401/403/429)</div>
      <div class="stat-value val-orange" id="stat-security-threats">0</div>
      <div class="stat-sub" id="stat-security-detail">401: 0 | 403: 0 | 429: 0</div>
    </div>
    <div class="card">
      <div class="stat-label">🤖 Circuit Breaker Groq IA</div>
      <div class="stat-value val-green" id="stat-ai-status">FERMÉ</div>
      <div class="stat-sub" id="stat-ai-desc">Opérationnel</div>
    </div>
  </div>

  <div class="grid-charts">
    <div class="card">
      <div class="chart-title">
        <span>🔐 Tentatives d'Authentification (Temps Réel)</span>
      </div>
      <div class="chart-container">
        <canvas id="authChart"></canvas>
      </div>
    </div>
    <div class="card">
      <div class="chart-title">
        <span>🛡️ Événements de Sécurité (Rejets 401, 403 & Rate Limit 429)</span>
      </div>
      <div class="chart-container">
        <canvas id="securityChart"></canvas>
      </div>
    </div>
  </div>

  <div class="grid-bottom">
    <div class="users-table-box">
      <div class="chart-title">
        <span>👥 Utilisateurs & Responsables de Zone Réels (Base MongoDB)</span>
        <span class="badge" style="font-size: 11px; padding: 4px 8px;" id="users-count-badge">0 Utilisateurs</span>
      </div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Rôle</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody id="users-tbody">
            <tr>
              <td colspan="3" style="text-align: center; color: var(--text-secondary); padding: 24px;">Chargement des utilisateurs réels...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="activity-feed">
      <div class="chart-title">
        <span>📜 Journal d'Activité (Live Audit)</span>
      </div>
      <div id="activity-list">
        <div class="activity-item">
          <span>Système démarré & surveillance active</span>
          <span class="activity-badge badge-AUTH">SYSTEM</span>
        </div>
      </div>
    </div>
  </div>

  <!-- SECTION DES DONNEES CRYPTEES -->
  <div class="crypto-vault-box">
    <div class="chart-title">
      <span>🔐 Registre & Architecture des Données Chiffrées (Data Protection Vault)</span>
      <span class="badge" style="background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan); border-color: var(--accent-cyan);">
        Chiffrement Authentifié Actif
      </span>
    </div>

    <div class="crypto-badges-row">
      <div class="crypto-badge-item">
        <div class="crypto-icon">🔒</div>
        <div>
          <div class="crypto-title">Chiffrement Symétrique Réversible</div>
          <div class="crypto-desc">AES-256-GCM (IV 96-bit + AuthTag 128-bit)</div>
        </div>
      </div>
      <div class="crypto-badge-item">
        <div class="crypto-icon">🔎</div>
        <div>
          <div class="crypto-title">Indexation Déterministe Aveugle</div>
          <div class="crypto-desc">HMAC-SHA256 avec clé Pepper secrète</div>
        </div>
      </div>
      <div class="crypto-badge-item">
        <div class="crypto-icon">🛡️</div>
        <div>
          <div class="crypto-title">Protection Mots de Passe</div>
          <div class="crypto-desc">Bcrypt 10 rounds + Exclusion automatique</div>
        </div>
      </div>
      <div class="crypto-badge-item">
        <div class="crypto-icon">🤖</div>
        <div>
          <div class="crypto-title">Anonymisation PII pour l'IA</div>
          <div class="crypto-desc">Masquage dynamique avant envoi à Groq</div>
        </div>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Champ Sensible</th>
            <th>Donnée en Clair</th>
            <th>Stockage en Base MongoDB (Chiffré / Haché)</th>
            <th>Recherche / Indexation</th>
            <th>Masquage IA / Logs</th>
            <th>Algorithme</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>password</strong> (Mot de passe)</td>
            <td><span class="code-snippet">admin1234</span></td>
            <td><span class="code-snippet code-cipher">$2b$10$w... (Hachage irréversible)</span></td>
            <td><span class="code-dim">Non indexé</span></td>
            <td><span class="code-snippet">********</span></td>
            <td><span class="role-badge role-ADMIN">Bcrypt-10</span></td>
          </tr>
          <tr>
            <td><strong>cin</strong> (Carte d'Identité)</td>
            <td><span class="code-snippet">09876543</span></td>
            <td><span class="code-snippet code-cipher">enc:v1:a12f1f...:7731ce...:d516f211</span></td>
            <td><span class="code-snippet">4b71d9... (HMAC)</span></td>
            <td><span class="code-snippet">09****43</span></td>
            <td><span class="role-badge role-RESPONSABLE_ZONE">AES-256-GCM</span></td>
          </tr>
          <tr>
            <td><strong>telephone</strong> (Numéro Contact)</td>
            <td><span class="code-snippet">20111222</span></td>
            <td><span class="code-snippet code-cipher">enc:v1:711cb7...:ca3ca3...:24fcdd02</span></td>
            <td><span class="code-snippet">d78ec4... (HMAC)</span></td>
            <td><span class="code-snippet">20****22</span></td>
            <td><span class="role-badge role-RESPONSABLE_ZONE">AES-256-GCM</span></td>
          </tr>
          <tr>
            <td><strong>email</strong> (Courriel Client)</td>
            <td><span class="code-snippet">mohamed.k@smartfiber.tn</span></td>
            <td><span class="code-snippet">mohamed.k@smartfiber.tn</span></td>
            <td><span class="code-dim">Index standard</span></td>
            <td><span class="code-snippet">m***k@smartfiber.tn</span></td>
            <td><span class="role-badge" style="background: rgba(6, 182, 212, 0.2); color: var(--accent-cyan); border: 1px solid rgba(6, 182, 212, 0.4);">PII Mask</span></td>
          </tr>
          <tr>
            <td><strong>INTERNAL_API_KEY</strong> (Clé API)</td>
            <td><span class="code-snippet">sf_internal_sec...</span></td>
            <td><span class="code-snippet code-cipher">Vérification en temps constant (Anti-Timing)</span></td>
            <td><span class="code-dim">En mémoire</span></td>
            <td><span class="code-snippet">sf_in****</span></td>
            <td><span class="role-badge" style="background: rgba(16, 185, 129, 0.2); color: var(--accent-green); border: 1px solid rgba(16, 185, 129, 0.4);">timingSafeEqual</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    const maxDataPoints = 12;
    const labels = [];
    const authSuccessData = [];
    const authFailureData = [];
    const unauth401Data = [];
    const forbidden403Data = [];
    const rateLimitData = [];

    for (let i = 0; i < maxDataPoints; i++) {
      labels.push('');
      authSuccessData.push(0);
      authFailureData.push(0);
      unauth401Data.push(0);
      forbidden403Data.push(0);
      rateLimitData.push(0);
    }

    let authChart, securityChart;

    function initCharts() {
      try {
        const authCtx = document.getElementById('authChart').getContext('2d');
        authChart = new Chart(authCtx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Échecs (Bruteforce)',
                data: authFailureData,
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                fill: true,
                tension: 0.3,
                borderWidth: 2.5
              },
              {
                label: 'Succès',
                data: authSuccessData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.3,
                borderWidth: 2.5
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
              x: { grid: { color: '#2b3b64' }, ticks: { color: '#94a3b8' } },
              y: { grid: { color: '#2b3b64' }, ticks: { color: '#94a3b8' }, beginAtZero: true }
            },
            plugins: { legend: { labels: { color: '#f8fafc' } } }
          }
        });

        const secCtx = document.getElementById('securityChart').getContext('2d');
        securityChart = new Chart(secCtx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [
              { label: '401 Unauthorized', data: unauth401Data, backgroundColor: '#3b82f6' },
              { label: '403 Forbidden', data: forbidden403Data, backgroundColor: '#8b5cf6' },
              { label: '429 Rate Limit', data: rateLimitData, backgroundColor: '#f59e0b' }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
              x: { grid: { color: '#2b3b64' }, ticks: { color: '#94a3b8' } },
              y: { grid: { color: '#2b3b64' }, ticks: { color: '#94a3b8' }, beginAtZero: true }
            },
            plugins: { legend: { labels: { color: '#f8fafc' } } }
          }
        });
      } catch (e) {
        console.error('Chart.js error:', e);
      }
    }

    async function fetchMetrics() {
      try {
        const res = await fetch('/api/metrics/summary');
        const data = await res.json();
        
        // Update Stat Cards
        document.getElementById('stat-auth-failure').innerText = data.auth.failure;
        document.getElementById('stat-auth-success').innerText = data.auth.success;
        document.getElementById('stat-users-total').innerText = data.totalRealUsers || (data.realUsers ? data.realUsers.length : 0);
        document.getElementById('stat-security-threats').innerText = data.security.totalThreats;
        document.getElementById('stat-security-detail').innerText = 
          '401: ' + data.security.unauthorized_401 + ' | 403: ' + data.security.forbidden_403 + ' | 429: ' + data.security.rate_limit_exceeded;
        
        const aiStatusEl = document.getElementById('stat-ai-status');
        const aiDescEl = document.getElementById('stat-ai-desc');
        if (data.ai.circuitBreaker === 'CLOSED') {
          aiStatusEl.innerText = 'FERMÉ';
          aiStatusEl.className = 'stat-value val-green';
          aiDescEl.innerText = 'Opérationnel';
        } else {
          aiStatusEl.innerText = 'OUVERT';
          aiStatusEl.className = 'stat-value val-red';
          aiDescEl.innerText = 'Mode Fallback actif';
        }

        // Update Real Users Table
        if (data.realUsers && data.realUsers.length > 0) {
          document.getElementById('users-count-badge').innerText = data.realUsers.length + ' Utilisateurs';
          const tbody = document.getElementById('users-tbody');
          tbody.innerHTML = data.realUsers.map(u => {
            const initial = (u.username || 'U').charAt(0).toUpperCase();
            const roleClass = u.role === 'ADMIN' ? 'role-ADMIN' : 'role-RESPONSABLE_ZONE';
            return '<tr>' +
              '<td><div style="display:flex; align-items:center;"><span class="user-avatar">' + initial + '</span><strong>' + u.username + '</strong></div></td>' +
              '<td><span class="role-badge ' + roleClass + '">' + u.role + '</span></td>' +
              '<td><span class="status-dot"><span class="dot dot-active"></span> Actif</span></td>' +
            '</tr>';
          }).join('');
        } else {
          document.getElementById('users-count-badge').innerText = '0 Utilisateur';
          document.getElementById('users-tbody').innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-secondary); padding:20px;">Aucun utilisateur trouvé en base</td></tr>';
        }

        // Update Activity Feed
        if (data.activities && data.activities.length > 0) {
          const listEl = document.getElementById('activity-list');
          listEl.innerHTML = data.activities.map(a => 
            '<div class="activity-item">' +
              '<div><strong>' + a.timestamp + '</strong> : ' + a.message + '</div>' +
              '<span class="activity-badge badge-' + a.type + '">' + a.type + '</span>' +
            '</div>'
          ).join('');
        }

        // Update Charts
        const timeStr = new Date().toLocaleTimeString();
        labels.shift();
        labels.push(timeStr);

        authSuccessData.shift();
        authSuccessData.push(data.auth.success);

        authFailureData.shift();
        authFailureData.push(data.auth.failure);

        unauth401Data.shift();
        unauth401Data.push(data.security.unauthorized_401);

        forbidden403Data.shift();
        forbidden403Data.push(data.security.forbidden_403);

        rateLimitData.shift();
        rateLimitData.push(data.security.rate_limit_exceeded);

        if (authChart) authChart.update();
        if (securityChart) securityChart.update();
      } catch (err) {
        console.error('Erreur récupération métriques:', err);
      }
    }

    async function triggerSimulation(type) {
      try {
        await fetch('/api/metrics/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type })
        });
        await fetchMetrics();
      } catch (err) {
        console.error(err);
      }
    }

    window.onload = () => {
      initCharts();
      fetchMetrics();
      setInterval(fetchMetrics, 2000);
    };
  </script>
</body>
</html>`);
  }
}
