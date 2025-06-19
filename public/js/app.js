// Configuration de l'API
const API_BASE = window.location.origin + '/api';

// Variables globales
let users = [];
let matches = [];
let currentEditingUser = null;
let authToken = null; // Stores the authentication token

// Éléments du DOM
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const userModal = document.getElementById('user-modal');
const matchModal = document.getElementById('match-modal');
const loading = document.getElementById('loading');

// New Auth DOM elements
const registerModal = document.getElementById('register-modal');
const loginModal = document.getElementById('login-modal');
const appContent = document.getElementById('app-content'); // The div containing all main app content
const logoutBtn = document.getElementById('logout-btn');
const showLoginBtn = document.getElementById('show-login-btn');
const showRegisterBtn = document.getElementById('show-register-btn');


// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
});

// Initialisation
async function initializeApp() {
    authToken = localStorage.getItem('authToken'); // Try to get token from local storage

    if (authToken) {
        // If token exists, try to load app content
        showLoading();
        try {
            // Attempt to fetch some protected data to validate token
            await loadUsers(); // This will fail if token is invalid/expired
            await loadMatches();
            updateDashboard();
            populatePlayerSelects();
            showAppContent(); // Show app if data loaded successfully
            switchTab('dashboard'); // Default to dashboard
        } catch (error) {
            // If any error during initial data load (e.g., 401/403 from API), assume token is bad
            console.error('Error during initial app load (token likely expired/invalid):', error);
            showToast('Votre session a expiré ou est invalide. Veuillez vous reconnecter.', 'error');
            logoutUser(); // Force logout
        } finally {
            hideLoading();
        }
    } else {
        // No token, show authentication forms
        showAuthForms();
    }
}

// Configuration des événements
function setupEventListeners() {
    // Navigation by tabs
    tabButtons.forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    // Modals
    document.getElementById('add-user-btn').addEventListener('click', openUserModal);
    document.getElementById('add-match-btn').addEventListener('click', openMatchModal);

    document.getElementById('close-user-modal').addEventListener('click', closeUserModal);
    document.getElementById('cancel-user').addEventListener('click', closeUserModal);
    document.getElementById('user-form').addEventListener('submit', handleUserSubmit);

    document.getElementById('close-match-modal').addEventListener('click', closeMatchModal);
    document.getElementById('cancel-match').addEventListener('click', closeMatchModal);
    document.getElementById('match-form').addEventListener('submit', handleMatchSubmit);

    // Click outside modal to close
    window.addEventListener('click', function(event) {
        if (event.target === userModal) closeUserModal();
        if (event.target === matchModal) closeMatchModal();
        // New auth modals
        if (event.target === registerModal) closeRegisterModal();
        if (event.target === loginModal) closeLoginModal();
    });

    // New Auth Event Listeners
    document.getElementById('show-login-btn').addEventListener('click', openLoginModal);
    document.getElementById('show-register-btn').addEventListener('click', openRegisterModal);
    document.getElementById('logout-btn').addEventListener('click', logoutUser);

    document.getElementById('close-register-modal').addEventListener('click', closeRegisterModal);
    document.getElementById('cancel-register').addEventListener('click', closeRegisterModal);
    document.getElementById('register-form').addEventListener('submit', handleRegister);

    document.getElementById('close-login-modal').addEventListener('click', closeLoginModal);
    document.getElementById('cancel-login').addEventListener('click', closeLoginModal);
    document.getElementById('login-form').addEventListener('submit', handleLogin);
}

// --- UI Display Functions ---
function showAppContent() {
    appContent.style.display = 'block';
    tabButtons.forEach(btn => btn.style.display = 'inline-flex'); // Show tabs
    showLoginBtn.style.display = 'none';
    showRegisterBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';
}

function showAuthForms() {
    appContent.style.display = 'none';
    tabButtons.forEach(btn => btn.style.display = 'none'); // Hide tabs
    showLoginBtn.style.display = 'inline-flex';
    showRegisterBtn.style.display = 'inline-flex';
    logoutBtn.style.display = 'none';
    openLoginModal(); // Default to login when not authenticated
}


// --- Authentication Functions ---

function openRegisterModal() {
    closeLoginModal(); // Ensure only one auth modal is open
    registerModal.classList.add('active');
    document.getElementById('register-form').reset();
}

function closeRegisterModal() {
    registerModal.classList.remove('active');
}

function openLoginModal() {
    closeRegisterModal(); // Ensure only one auth modal is open
    loginModal.classList.add('active');
    document.getElementById('login-form').reset();
}

function closeLoginModal() {
    loginModal.classList.remove('active');
}

async function handleRegister(event) {
    event.preventDefault();
    showLoading();

    try {
        const formData = new FormData(event.target);
        const data = Object.fromEntries(formData.entries());

        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de l\'inscription');
        }

        const result = await response.json();
        showToast(result.message, 'success');
        closeRegisterModal();
        openLoginModal(); // Redirect to login after successful registration

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function handleLogin(event) {
    event.preventDefault();
    showLoading();

    try {
        const formData = new FormData(event.target);
        const data = Object.fromEntries(formData.entries());

        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la connexion');
        }

        const result = await response.json();
        authToken = result.token;
        localStorage.setItem('authToken', authToken); // Store token

        showToast(result.message, 'success');
        closeLoginModal();
        initializeApp(); // Re-initialize app to show content and load data

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

function logoutUser() {
    authToken = null;
    localStorage.removeItem('authToken'); // Clear token from storage
    showToast('Déconnexion réussie', 'info');
    showAuthForms(); // Go back to login/register screen
    // Clear existing data from UI if necessary
    document.getElementById('users-list').innerHTML = '';
    document.getElementById('matches-list').innerHTML = '';
    document.getElementById('recent-matches-list').innerHTML = '';
    document.getElementById('total-users').textContent = '0';
    document.getElementById('total-matches').textContent = '0';
}

// --- Generic Fetch Wrapper for Authenticated Requests ---
// This function will automatically add the Authorization header
async function authenticatedFetch(url, options = {}) {
    if (!authToken) {
        // If no token, or token removed by logout, force re-authentication
        showToast('Vous n\'êtes pas connecté. Veuillez vous connecter.', 'error');
        logoutUser();
        throw new Error('Not authenticated.');
    }

    const headers = {
        'Authorization': `Bearer ${authToken}`,
        ...options.headers // Merge with any custom headers passed in
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            // Token expired or invalid
            showToast('Votre session a expiré ou est invalide. Veuillez vous reconnecter.', 'error');
            logoutUser();
        }
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return response;
}


// --- Original API Calls, Modified to use authenticatedFetch ---

async function loadUsers() {
    try {
        const response = await authenticatedFetch(`${API_BASE}/users`);
        users = await response.json();
        displayUsers();
    } catch (error) {
        console.error('Erreur lors du chargement des utilisateurs:', error);
        throw error; // Re-throw to be caught by initializeApp or calling function
    }
}

function displayUsers() {
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';
    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><img src="${user.photo ? user.photo : 'uploads/default-avatar.png'}" alt="${user.name}" class="profile-photo"></td>
            <td>${user.name}</td>
            <td>${user.surname}</td>
            <td>
                <button class="btn btn-sm btn-info" onclick="editUser(${user.id})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})"><i class="fas fa-trash"></i></button>
            </td>
        `;
        usersList.appendChild(row);
    });
}

async function handleUserSubmit(event) {
    event.preventDefault();
    showLoading();

    const userId = document.getElementById('user-id').value;
    const formData = new FormData(event.target);
    const photoFile = formData.get('photo');

    // If no new photo is selected and it's an edit, remove 'photo' from formData
    if (userId && !photoFile.name) {
        formData.delete('photo');
    }

    const isEditing = userId !== '';
    const method = isEditing ? 'PUT' : 'POST';
    const url = isEditing ? `${API_BASE}/users/${userId}` : `${API_BASE}/users`;

    try {
        const response = await authenticatedFetch(url, {
            method: method,
            body: formData // FormData automatically sets Content-Type to multipart/form-data
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Erreur lors de ${isEditing ? 'la mise à jour' : 'la création'} du joueur`);
        }

        await loadUsers();
        populatePlayerSelects();
        closeUserModal();
        showToast(`Joueur ${isEditing ? 'mis à jour' : 'créé'} avec succès!`, 'success');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}


async function deleteUser(userId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce joueur et tous ses matchs associés ?')) {
        return;
    }
    showLoading();
    try {
        const response = await authenticatedFetch(`${API_BASE}/users/${userId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la suppression du joueur');
        }

        await loadUsers();
        await loadMatches(); // Matches might be affected
        updateDashboard();
        populatePlayerSelects();
        showToast('Joueur supprimé avec succès!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function loadMatches() {
    try {
        const response = await authenticatedFetch(`${API_BASE}/matches`);
        matches = await response.json();
        displayMatches();
        displayRecentMatches();
    } catch (error) {
        console.error('Erreur lors du chargement des matchs:', error);
        throw error;
    }
}

function displayMatches() {
    const matchesList = document.getElementById('matches-list');
    matchesList.innerHTML = '';
    matches.forEach(match => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${match.player1_name} ${match.player1_surname}</td>
            <td>${match.player1_score}</td>
            <td>${match.player2_score}</td>
            <td>${match.player2_name} ${match.player2_surname}</td>
            <td>${match.winner_name} ${match.winner_surname}</td>
            <td>${new Date(match.match_date).toLocaleDateString()}</td>
        `;
        matchesList.appendChild(row);
    });
}

function displayRecentMatches() {
    const recentMatchesList = document.getElementById('recent-matches-list');
    recentMatchesList.innerHTML = '';
    const recent5Matches = matches.slice(0, 5); // Get the 5 most recent matches
    recent5Matches.forEach(match => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="match-info">
                <span><strong>${match.player1_name} ${match.player1_surname}</strong> (${match.player1_score})</span>
                <span class="vs">vs</span>
                <span>(${match.player2_score}) <strong>${match.player2_name} ${match.player2_surname}</strong></span>
            </div>
            <div class="match-meta">
                <span>Vainqueur: ${match.winner_name} ${match.winner_surname}</span>
                <span>Date: ${new Date(match.match_date).toLocaleDateString()}</span>
            </div>
        `;
        recentMatchesList.appendChild(li);
    });
}

async function handleMatchSubmit(event) {
    event.preventDefault();
    showLoading();

    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());

    // Convert scores to numbers
    data.player1_score = parseInt(data.player1_score);
    data.player2_score = parseInt(data.player2_score);

    try {
        const response = await authenticatedFetch(`${API_BASE}/matches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de l\'enregistrement du match');
        }

        await loadMatches();
        updateDashboard();
        closeMatchModal();
        showToast('Match enregistré avec succès!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}


function switchTab(tabId) {
    tabContents.forEach(content => {
        content.classList.remove('active');
    });
    tabButtons.forEach(button => {
        button.classList.remove('active');
    });
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
}

function openUserModal(userId = null) {
    const modalTitle = document.getElementById('user-modal-title');
    const userForm = document.getElementById('user-form');
    userForm.reset(); // Clear form

    if (userId) {
        currentEditingUser = users.find(u => u.id === userId);
        if (currentEditingUser) {
            modalTitle.textContent = 'Modifier le joueur';
            document.getElementById('user-id').value = currentEditingUser.id;
            document.getElementById('user-name').value = currentEditingUser.name;
            document.getElementById('user-surname').value = currentEditingUser.surname;
            document.getElementById('user-username').value = currentEditingUser.username;
            document.getElementById('user-username').readOnly = true; // Prevent username change
            document.getElementById('user-password').removeAttribute('required'); // Password not required on edit
        }
    } else {
        modalTitle.textContent = 'Ajouter un joueur';
        document.getElementById('user-id').value = '';
        currentEditingUser = null;
        document.getElementById('user-username').readOnly = false;
        document.getElementById('user-password').setAttribute('required', 'required'); // Password required on create
    }
    userModal.classList.add('active');
}

function closeUserModal() {
    userModal.classList.remove('active');
    currentEditingUser = null;
    document.getElementById('user-username').readOnly = false; // Reset readOnly status
    document.getElementById('user-password').setAttribute('required', 'required'); // Reset required status
}

function openMatchModal() {
    matchModal.classList.add('active');
    document.getElementById('match-form').reset();
    populatePlayerSelects();
}

function closeMatchModal() {
    matchModal.classList.remove('active');
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
    console.error('Unhandled Promise Rejection:', event.reason);
    showToast('Une erreur réseau inattendue s\'est produite', 'error');
});

// Call setupEventListeners explicitly to ensure they are bound after DOM is ready
// This is already done by `document.addEventListener('DOMContentLoaded', function() { setupEventListeners(); });`
// but just confirming the intent.