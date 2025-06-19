// Configuration de l'API
const API_BASE = window.location.origin + '/api';

// Variables globales
let users = [];
let matches = [];
let currentEditingUser = null;

// Éléments du DOM
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const userModal = document.getElementById('user-modal');
const matchModal = document.getElementById('match-modal');
const loading = document.getElementById('loading');

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
});

// Initialisation
async function initializeApp() {
    showLoading();
    try {
        await loadUsers();
        await loadMatches();
        updateDashboard();
        populatePlayerSelects();
    } catch (error) {
        showToast('Erreur lors du chargement des données', 'error');
        console.error('Erreur d\'initialisation:', error);
    } finally {
        hideLoading();
    }
}

// Configuration des événements
function setupEventListeners() {
    // Navigation par onglets
    tabButtons.forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    // Modals
    document.getElementById('add-user-btn').addEventListener('click', openUserModal);
    document.getElementById('add-match-btn').addEventListener('click', openMatchModal);
    document.getElementById('close-user-modal').addEventListener('click', closeUserModal);
    document.getElementById('close-match-modal').addEventListener('click', closeMatchModal);
    document.getElementById('cancel-user').addEventListener('click', closeUserModal);
    document.getElementById('cancel-match').addEventListener('click', closeMatchModal);

    // Formulaires
    document.getElementById('user-form').addEventListener('submit', handleUserSubmit);
    document.getElementById('match-form').addEventListener('submit', handleMatchSubmit);

    // Prévisualisation de photo
    document.getElementById('user-photo').addEventListener('change', previewPhoto);

    // Fermeture des modals en cliquant à l'extérieur
    window.addEventListener('click', function(event) {
        if (event.target === userModal) closeUserModal();
        if (event.target === matchModal) closeMatchModal();
    });
}

// Navigation par onglets
function switchTab(tabName) {
    // Mise à jour des boutons
    tabButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Mise à jour du contenu
    tabContents.forEach(content => content.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');

    // Actualisation des données si nécessaire
    if (tabName === 'dashboard') {
        updateDashboard();
    }
}

// Gestion des utilisateurs
async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/users`);
        if (!response.ok) throw new Error('Erreur lors du chargement des utilisateurs');
        users = await response.json();
        displayUsers();
    } catch (error) {
        showToast('Erreur lors du chargement des utilisateurs', 'error');
        throw error;
    }
}

function displayUsers() {
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';

    if (users.length === 0) {
        usersList.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: white;">
                <i class="fas fa-users" style="font-size: 3rem; margin-bottom: 20px; opacity: 0.5;"></i>
                <p style="font-size: 1.2rem;">Aucun joueur inscrit pour le moment</p>
                <p style="opacity: 0.7;">Cliquez sur "Ajouter un joueur" pour commencer</p>
            </div>
        `;
        return;
    }

    users.forEach(user => {
        const userCard = createUserCard(user);
        usersList.appendChild(userCard);
    });
}

function createUserCard(user) {
    const card = document.createElement('div');
    card.className = 'user-card';
    
    const avatarContent = user.photo 
        ? `<img src="/uploads/${user.photo}" alt="${user.name} ${user.surname}">`
        : `<i class="fas fa-user"></i>`;

    card.innerHTML = `
        <div class="user-avatar">
            ${avatarContent}
        </div>
        <div class="user-name">${user.name} ${user.surname}</div>
        <div class="user-stats" id="user-stats-${user.id}">
            <div class="user-stat">
                <div class="number">-</div>
                <div class="label">Matchs</div>
            </div>
            <div class="user-stat">
                <div class="number">-</div>
                <div class="label">Victoires</div>
            </div>
            <div class="user-stat">
                <div class="number">-</div>
                <div class="label">% Réussite</div>
            </div>
        </div>
        <div class="user-actions">
            <button class="btn btn-edit" onclick="editUser(${user.id})">
                <i class="fas fa-edit"></i> Modifier
            </button>
        </div>
    `;

    // Charger les statistiques de l'utilisateur
    loadUserStats(user.id);

    return card;
}

async function loadUserStats(userId) {
    try {
        const response = await fetch(`${API_BASE}/users/${userId}/stats`);
        if (!response.ok) return;
        
        const stats = await response.json();
        const statsElement = document.getElementById(`user-stats-${userId}`);
        
        if (statsElement) {
            statsElement.innerHTML = `
                <div class="user-stat">
                    <div class="number">${stats.total_matches}</div>
                    <div class="label">Matchs</div>
                </div>
                <div class="user-stat">
                    <div class="number">${stats.wins}</div>
                    <div class="label">Victoires</div>
                </div>
                <div class="user-stat">
                    <div class="number">${stats.win_rate}%</div>
                    <div class="label">% Réussite</div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Erreur lors du chargement des stats:', error);
    }
}

// Gestion des matchs
async function loadMatches() {
    try {
        const response = await fetch(`${API_BASE}/matches`);
        if (!response.ok) throw new Error('Erreur lors du chargement des matchs');
        matches = await response.json();
        displayMatches();
        displayRecentMatches();
    } catch (error) {
        showToast('Erreur lors du chargement des matchs', 'error');
        throw error;
    }
}

function displayMatches() {
    const matchesList = document.getElementById('matches-list');
    matchesList.innerHTML = '';

    if (matches.length === 0) {
        matchesList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: white;">
                <i class="fas fa-trophy" style="font-size: 3rem; margin-bottom: 20px; opacity: 0.5;"></i>
                <p style="font-size: 1.2rem;">Aucun match enregistré</p>
                <p style="opacity: 0.7;">Cliquez sur "Nouveau match" pour commencer</p>
            </div>
        `;
        return;
    }

    matches.forEach(match => {
        const matchCard = createMatchCard(match);
        matchesList.appendChild(matchCard);
    });
}

function displayRecentMatches() {
    const recentMatchesList = document.getElementById('recent-matches-list');
    const recentMatches = matches.slice(0, 5); // 5 derniers matchs

    if (recentMatches.length === 0) {
        recentMatchesList.innerHTML = `
            <p style="text-align: center; color: rgba(255,255,255,0.7); padding: 20px;">
                Aucun match récent
            </p>
        `;
        return;
    }

    recentMatchesList.innerHTML = '';
    recentMatches.forEach(match => {
        const matchCard = createMatchCard(match, true);
        recentMatchesList.appendChild(matchCard);
    });
}

function createMatchCard(match, isCompact = false) {
    const card = document.createElement('div');
    card.className = 'match-card';
    
    const date = new Date(match.created_at).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const player1Class = match.winner_id === match.player1_id ? 'winner' : '';
    const player2Class = match.winner_id === match.player2_id ? 'winner' : '';

    card.innerHTML = `
        <div class="match-header">
            <div class="match-date">
                <i class="fas fa-calendar"></i> ${date}
            </div>
        </div>
        <div class="match-content">
            <div class="match-player ${player1Class}">
                <i class="fas fa-user"></i>
                <span>${match.player1_name} ${match.player1_surname}</span>
            </div>
            <div class="match-score">
                ${match.player1_score} - ${match.player2_score}
            </div>
            <div class="match-player ${player2Class}">
                <span>${match.player2_name} ${match.player2_surname}</span>
                <i class="fas fa-user"></i>
            </div>
        </div>
    `;

    return card;
}

// Gestion des modals
function openUserModal(userId = null) {
    currentEditingUser = userId;
    const modal = document.getElementById('user-modal');
    const title = document.getElementById('user-modal-title');
    const form = document.getElementById('user-form');
    
    if (userId) {
        const user = users.find(u => u.id === userId);
        if (user) {
            title.innerHTML = '<i class="fas fa-user-edit"></i> Modifier le joueur';
            document.getElementById('user-name').value = user.name;
            document.getElementById('user-surname').value = user.surname;
            
            if (user.photo) {
                const preview = document.getElementById('photo-preview');
                preview.innerHTML = `<img src="/uploads/${user.photo}" alt="Photo actuelle">`;
            }
        }
    } else {
        title.innerHTML = '<i class="fas fa-user-plus"></i> Ajouter un joueur';
        form.reset();
        document.getElementById('photo-preview').innerHTML = '';
    }
    
    modal.classList.add('active');
}

function closeUserModal() {
    const modal = document.getElementById('user-modal');
    modal.classList.remove('active');
    currentEditingUser = null;
    document.getElementById('user-form').reset();
    document.getElementById('photo-preview').innerHTML = '';
}

function openMatchModal() {
    if (users.length < 2) {
        showToast('Il faut au moins 2 joueurs pour créer un match', 'warning');
        return;
    }
    
    const modal = document.getElementById('match-modal');
    document.getElementById('match-form').reset();
    modal.classList.add('active');
}

function closeMatchModal() {
    const modal = document.getElementById('match-modal');
    modal.classList.remove('active');
    document.getElementById('match-form').reset();
}

// Gestion des formulaires
async function handleUserSubmit(event) {
    event.preventDefault();
    showLoading();

    try {
        const formData = new FormData(event.target);
        const url = currentEditingUser 
            ? `${API_BASE}/users/${currentEditingUser}`
            : `${API_BASE}/users`;
        
        const method = currentEditingUser ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la sauvegarde');
        }

        const result = await response.json();
        showToast(result.message || 'Joueur sauvegardé avec succès', 'success');
        
        closeUserModal();
        await loadUsers();
        populatePlayerSelects();
        updateDashboard();
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function handleMatchSubmit(event) {
    event.preventDefault();
    showLoading();

    try {
        const formData = new FormData(event.target);
        const data = {
            player1_id: parseInt(formData.get('player1_id')),
            player2_id: parseInt(formData.get('player2_id')),
            player1_score: parseInt(formData.get('player1_score')),
            player2_score: parseInt(formData.get('player2_score'))
        };

        if (data.player1_id === data.player2_id) {
            throw new Error('Un joueur ne peut pas jouer contre lui-même');
        }

        const response = await fetch(`${API_BASE}/matches`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la sauvegarde');
        }

        const result = await response.json();
        showToast(result.message || 'Match enregistré avec succès', 'success');
        
        closeMatchModal();
        await loadMatches();
        await loadUsers(); // Recharger pour mettre à jour les stats
        updateDashboard();
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Fonctions utilitaires
function previewPhoto(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('photo-preview');
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" alt="Aperçu">`;
        };
        reader.readAsDataURL(file);
    } else {
        preview.innerHTML = '';
    }
}

function populatePlayerSelects() {
    const player1Select = document.getElementById('player1');
    const player2Select = document.getElementById('player2');
    
    const options = users.map(user => 
        `<option value="${user.id}">${user.name} ${user.surname}</option>`
    ).join('');
    
    player1Select.innerHTML = '<option value="">Sélectionner un joueur</option>' + options;
    player2Select.innerHTML = '<option value="">Sélectionner un joueur</option>' + options;
}

function updateDashboard() {
    document.getElementById('total-users').textContent = users.length;
    document.getElementById('total-matches').textContent = matches.length;
}

function editUser(userId) {
    openUserModal(userId);
}

// Fonctions d'interface
function showLoading() {
    document.getElementById('loading').classList.add('active');
}

function hideLoading() {
    document.getElementById('loading').classList.remove('active');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Supprimer le toast après 4 secondes
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// Gestion des erreurs globales
window.addEventListener('error', function(event) {
    console.error('Erreur JavaScript:', event.error);
    showToast('Une erreur inattendue s\'est produite', 'error');
});

// Gestion des erreurs de réseau
window.addEventListener('unhandledrejection', function(event) {
    console.error('Promesse rejetée:', event.reason);
    showToast('Erreur de connexion au serveur', 'error');
});

