// Configuration de l'API
const API_BASE = window.location.origin + '/api';

// Variables globales
let users = [];
let matches = [];
let currentEditingUser = null;
let authToken = null; // Stores the authentication token
let loggedInUserId = null; // NEW: To store the ID of the logged-in user
let loggedInUsername = null; // NEW: To store the username of the logged-in user
let loggedInUserFullName = null; // NEW: To store the full name for display

// Éléments du DOM
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const userModal = document.getElementById('user-modal');
const matchModal = document.getElementById('match-modal');
const loading = document.getElementById('loading');

// Auth DOM elements
const registerModal = document.getElementById('register-modal');
const loginModal = document.getElementById('login-modal');
const appContent = document.getElementById('app-content');
const logoutBtn = document.getElementById('logout-btn');
const showLoginBtn = document.getElementById('show-login-btn');
const showRegisterBtn = document.getElementById('show-register-btn');
const loggedInUserDisplay = document.getElementById('logged-in-user-display'); // NEW: Add a span in index.html for this


// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
});

// Initialisation
async function initializeApp() {
    authToken = localStorage.getItem('authToken');

    if (authToken) {
        showLoading();
        try {
            // Decode token to get user info if token is valid
            const decodedToken = decodeToken(authToken); // NEW: Function to decode token
            if (decodedToken && decodedToken.id) {
                loggedInUserId = decodedToken.id;
                loggedInUsername = decodedToken.username;
                loggedInUserFullName = `${decodedToken.name} ${decodedToken.surname}`;
                if (loggedInUserDisplay) {
                    loggedInUserDisplay.textContent = `Connecté en tant que: ${loggedInUserFullName}`;
                    loggedInUserDisplay.style.display = 'block';
                }
            } else {
                throw new Error("Token decoding failed or user ID not found in token.");
            }

            await loadUsers();
            await loadMatches();
            updateDashboard();
            populatePlayerSelects(); // Call this after users are loaded
            showAppContent();
            switchTab('dashboard');
        } catch (error) {
            console.error('Error during initial app load (token likely expired/invalid):', error);
            showToast('Votre session a expiré ou est invalide. Veuillez vous reconnecter.', 'error');
            logoutUser();
        } finally {
            hideLoading();
        }
    } else {
        showAuthForms();
    }
}

// NEW: Function to decode JWT token (client-side, for display purposes only)
function decodeToken(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Failed to decode token:", e);
        return null;
    }
}


// Configuration des événements
function setupEventListeners() {
    tabButtons.forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    // Modals
    document.getElementById('add-user-btn').addEventListener('click', openUserModal);
    document.getElementById('add-match-btn').addEventListener('click', openMatchModal); // This will trigger the new logic

    document.getElementById('close-user-modal').addEventListener('click', closeUserModal);
    document.getElementById('cancel-user').addEventListener('click', closeUserModal);
    document.getElementById('user-form').addEventListener('submit', handleUserSubmit);

    document.getElementById('close-match-modal').addEventListener('click', closeMatchModal);
    document.getElementById('cancel-match').addEventListener('click', closeMatchModal);
    document.getElementById('match-form').addEventListener('submit', handleMatchSubmit);

    window.addEventListener('click', function(event) {
        if (event.target === userModal) closeUserModal();
        if (event.target === matchModal) closeMatchModal();
        if (event.target === registerModal) closeRegisterModal();
        if (event.target === loginModal) closeLoginModal();
    });

    // Auth Event Listeners
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
    tabButtons.forEach(btn => btn.style.display = 'inline-flex');
    showLoginBtn.style.display = 'none';
    showRegisterBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';
    if (loggedInUserDisplay) {
        loggedInUserDisplay.style.display = 'block'; // Ensure display if user is logged in
    }
}

function showAuthForms() {
    appContent.style.display = 'none';
    tabButtons.forEach(btn => btn.style.display = 'none');
    showLoginBtn.style.display = 'inline-flex';
    showRegisterBtn.style.display = 'inline-flex';
    logoutBtn.style.display = 'none';
    if (loggedInUserDisplay) {
        loggedInUserDisplay.style.display = 'none'; // Hide if user is logged out
    }
    openLoginModal();
}


// --- Authentication Functions ---

function openRegisterModal() {
    closeLoginModal();
    registerModal.classList.add('active');
    document.getElementById('register-form').reset();
}

function closeRegisterModal() {
    registerModal.classList.remove('active');
}

function openLoginModal() {
    closeRegisterModal();
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
        openLoginModal();

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
        localStorage.setItem('authToken', authToken);

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
    loggedInUserId = null;
    loggedInUsername = null;
    loggedInUserFullName = null;
    localStorage.removeItem('authToken');
    showToast('Déconnexion réussie', 'info');
    showAuthForms();
    document.getElementById('users-list').innerHTML = '';
    document.getElementById('matches-list').innerHTML = '';
    document.getElementById('recent-matches-list').innerHTML = '';
    document.getElementById('total-users').textContent = '0';
    document.getElementById('total-matches').textContent = '0';
    if (loggedInUserDisplay) {
        loggedInUserDisplay.textContent = '';
    }
}

// --- Generic Fetch Wrapper for Authenticated Requests ---
async function authenticatedFetch(url, options = {}) {
    if (!authToken) {
        showToast('Vous n\'êtes pas connecté. Veuillez vous connecter.', 'error');
        logoutUser();
        throw new Error('Not authenticated.');
    }

    const headers = {
        'Authorization': `Bearer ${authToken}`,
        ...options.headers
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
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
        throw error;
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

    if (userId && !photoFile.name) {
        formData.delete('photo');
    }

    const isEditing = userId !== '';
    const method = isEditing ? 'PUT' : 'POST';
    const url = isEditing ? `${API_BASE}/users/${userId}` : `${API_BASE}/users`;

    try {
        const response = await authenticatedFetch(url, {
            method: method,
            body: formData
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
        await loadMatches();
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
    const recent5Matches = matches.slice(0, 5);
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

    // Ensure player1_id is the logged-in user's ID
    data.player1_id = loggedInUserId; // This is crucial

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
    // Only allow current user to edit their own profile if they are not an admin
    // For simplicity, we're assuming anyone can add/edit users after login in this version.
    // A proper admin role would be needed for more fine-grained control.
    const modalTitle = document.getElementById('user-modal-title');
    const userForm = document.getElementById('user-form');
    userForm.reset();

    // Specific fields for user creation vs. editing
    const userUsernameField = document.getElementById('user-username');
    const userPasswordField = document.getElementById('user-password');

    if (userId) {
        currentEditingUser = users.find(u => u.id === userId);
        if (currentEditingUser) {
            modalTitle.textContent = 'Modifier le joueur';
            document.getElementById('user-id').value = currentEditingUser.id;
            document.getElementById('user-name').value = currentEditingUser.name;
            document.getElementById('user-surname').value = currentEditingUser.surname;
            userUsernameField.value = currentEditingUser.username;
            userUsernameField.readOnly = true; // Prevent username change
            userPasswordField.removeAttribute('required'); // Password not required on edit
        }
    } else {
        modalTitle.textContent = 'Ajouter un joueur';
        document.getElementById('user-id').value = '';
        currentEditingUser = null;
        userUsernameField.readOnly = false; // Reset readOnly status for new user
        userPasswordField.setAttribute('required', 'required'); // Password required on create
    }
    userModal.classList.add('active');
}

function closeUserModal() {
    userModal.classList.remove('active');
    currentEditingUser = null;
    document.getElementById('user-username').readOnly = false;
    document.getElementById('user-password').setAttribute('required', 'required');
}

// MODIFIED: openMatchModal
function openMatchModal() {
    if (!loggedInUserId) {
        showToast("Veuillez vous connecter pour enregistrer un match.", "error");
        return;
    }

    matchModal.classList.add('active');
    document.getElementById('match-form').reset();
    populatePlayerSelectsForMatch(); // NEW: Call the specific function for match dropdowns
}

function closeMatchModal() {
    matchModal.classList.remove('active');
}

// NEW: populatePlayerSelectsForMatch
function populatePlayerSelectsForMatch() {
    const player1Select = document.getElementById('player1');
    const player2Select = document.getElementById('player2');

    // Clear previous options
    player1Select.innerHTML = '';
    player2Select.innerHTML = '';

    // Set Player 1 (the logged-in user)
    const loggedInUser = users.find(u => u.id === loggedInUserId);
    if (loggedInUser) {
        const player1Option = document.createElement('option');
        player1Option.value = loggedInUser.id;
        player1Option.textContent = `${loggedInUser.name} ${loggedInUser.surname} (Moi)`;
        player1Select.appendChild(player1Option);
        player1Select.value = loggedInUser.id; // Pre-select
        player1Select.disabled = true; // Make it non-changeable
    } else {
        // This should ideally not happen if loggedInUserId is set correctly
        player1Select.innerHTML = '<option value="">Erreur: Joueur non trouvé</option>';
        player1Select.disabled = true;
    }

    // Populate Player 2 (opponent) - exclude the logged-in user
    const otherUsers = users.filter(user => user.id !== loggedInUserId);
    if (otherUsers.length > 0) {
        const defaultOption = document.createElement('option');
        defaultOption.value = "";
        defaultOption.textContent = "Sélectionner un adversaire";
        player2Select.appendChild(defaultOption);

        otherUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.name} ${user.surname}`;
            player2Select.appendChild(option);
        });
        player2Select.disabled = false; // Ensure it's enabled for selection
    } else {
        player2Select.innerHTML = '<option value="">Aucun autre joueur disponible</option>';
        player2Select.disabled = true;
    }
}

// Keep the original populatePlayerSelects for other uses (like user creation/editing if needed for full list)
// Renamed to avoid confusion, but if not used elsewhere, it can be removed.
function populatePlayerSelects() {
    // This function will now only be called for places that need a full list,
    // if you have any (e.g., admin features). For match creation, use populatePlayerSelectsForMatch.
    // If not used, you can remove this function entirely.
    const player1Select = document.getElementById('player1');
    const player2Select = document.getElementById('player2');

    const options = users.map(user =>
        `<option value="${user.id}">${user.name} ${user.surname}</option>`
    ).join('');

    // Ensure the original <select> elements are NOT replaced by this in the match modal logic.
    // This function is now effectively "deprecated" for match modal.
    // player1Select.innerHTML = '<option value="">Sélectionner un joueur</option>' + options;
    // player2Select.innerHTML = '<option value="">Sélectionner un joueur</option>' + options;
}


function updateDashboard() {
    document.getElementById('total-users').textContent = users.length;
    document.getElementById('total-matches').textContent = matches.length;
}

function editUser(userId) {
    openUserModal(userId);
}

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

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

window.addEventListener('error', function(event) {
    console.error('Erreur JavaScript:', event.error);
    showToast('Une erreur inattendue s\'est produite', 'error');
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled Promise Rejection:', event.reason);
    showToast('Une erreur réseau inattendue s\'est produite', 'error');
});