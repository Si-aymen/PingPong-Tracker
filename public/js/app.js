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

// NEW Match Type DOM elements
const matchTypeRadios = document.querySelectorAll('input[name="match_type"]');
const player1Select = document.getElementById('player1');
const player2Select = document.getElementById('player2');
const player1MateGroup = document.getElementById('player1-mate-group');
const player1TeamMateSelect = document.getElementById('player1-team-mate');
const player2MateGroup = document.getElementById('player2-mate-group');
const player2TeamMateSelect = document.getElementById('player2-team-mate');

// Dashboard personal stats elements
const personalTotalMatches = document.getElementById('personal-total-matches');
const personalWins = document.getElementById('personal-wins');
const personalLosses = document.getElementById('personal-losses');
const personalWinRate = document.getElementById('personal-win-rate');
const strongestOpponentDisplay = document.getElementById('strongest-opponent');
const strongestOpponentRecordDisplay = document.getElementById('strongest-opponent-record');
const bestTeammateDisplay = document.getElementById('best-teammate');
const bestTeammateMatchesDisplay = document.getElementById('best-teammate-matches');


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
            await updateDashboard(); // Call updateDashboard after loading all data
            populatePlayerSelectsForMatch(); // Call this after users are loaded
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

    // NEW: Match type radio button listeners
    matchTypeRadios.forEach(radio => {
        radio.addEventListener('change', toggleMatchFormFields);
    });

    // Add listeners for player selects to update teammate options
    player1Select.addEventListener('change', updateTeamMateOptions);
    player2Select.addEventListener('change', updateTeamMateOptions);
    player1TeamMateSelect.addEventListener('change', updateTeamMateOptions);
    player2TeamMateSelect.addEventListener('change', updateTeamMateOptions);
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
    // Clear displayed data
    document.getElementById('users-list').innerHTML = '';
    document.getElementById('matches-list').innerHTML = '';
    document.getElementById('recent-matches-list').innerHTML = '';
    document.getElementById('total-users').textContent = '0';
    document.getElementById('total-matches').textContent = '0';
    personalTotalMatches.textContent = '0';
    personalWins.textContent = '0';
    personalLosses.textContent = '0';
    personalWinRate.textContent = '0%';
    strongestOpponentDisplay.textContent = 'N/A';
    strongestOpponentRecordDisplay.textContent = '';
    bestTeammateDisplay.textContent = 'N/A';
    bestTeammateMatchesDisplay.textContent = '';


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

    // If editing and no new photo selected, remove the 'photo' field from formData
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
        populatePlayerSelectsForMatch(); // Re-populate selects after user changes
        closeUserModal();
        showToast(`Joueur ${isEditing ? 'mis à jour' : 'créé'} avec succès!`, 'success');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}


async function deleteUser(userId) {
    // Replaced confirm() with a custom modal/toast for better UX in a web app
    showToast('Suppression en cours...', 'info'); // Provide immediate feedback
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
        populatePlayerSelectsForMatch(); // Re-populate selects after user changes
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
        // Construct player team names for display
        const player1TeamDisplay = `${match.player1_name} ${match.player1_surname}` +
            (match.is_2v2 ? ` & ${match.player1_team_mate_name || 'N/A'} ${match.player1_team_mate_surname || ''}` : '');
        const player2TeamDisplay = `${match.player2_name} ${match.player2_surname}` +
            (match.is_2v2 ? ` & ${match.player2_team_mate_name || 'N/A'} ${match.player2_team_mate_surname || ''}` : '');
        const winnerNameDisplay = `${match.winner_name} ${match.winner_surname}`;

        row.innerHTML = `
            <td>${player1TeamDisplay}</td>
            <td>${match.player1_score}</td>
            <td>${match.player2_score}</td>
            <td>${player2TeamDisplay}</td>
            <td>${winnerNameDisplay}</td>
            <td>${new Date(match.match_date).toLocaleDateString()}</td>
        `;
        matchesList.appendChild(row);
    });
}

// --- Pagination for Recent Matches ---
// (variables déjà déclarées plus bas, donc on ne les redéclare pas ici)

function displayRecentMatches() {
    const recentMatchesList = document.getElementById('recent-matches-list');
    recentMatchesList.innerHTML = '';
    const totalMatches = matches.length;
    const totalPages = Math.ceil(totalMatches / recentMatchesPerPage);
    if (recentMatchesCurrentPage > totalPages) recentMatchesCurrentPage = totalPages || 1;
    const startIdx = (recentMatchesCurrentPage - 1) * recentMatchesPerPage;
    const endIdx = startIdx + recentMatchesPerPage;
    const pageMatches = matches.slice(startIdx, endIdx);
    pageMatches.forEach(match => {
        const li = document.createElement('li');
        const player1TeamDisplay = `<strong>${match.player1_name} ${match.player1_surname}</strong>` +
            (match.is_2v2 ? ` & <strong>${match.player1_team_mate_name || 'N/A'} ${match.player1_team_mate_surname || ''}</strong>` : '');
        const player2TeamDisplay = `<strong>${match.player2_name} ${match.player2_surname}</strong>` +
            (match.is_2v2 ? ` & <strong>${match.player2_team_mate_name || 'N/A'} ${match.player2_team_mate_surname || ''}</strong>` : '');
        li.innerHTML = `
            <div class="match-info">
                <span>${player1TeamDisplay} (${match.player1_score})</span>
                <span class="vs">vs</span>
                <span>(${match.player2_score}) ${player2TeamDisplay}</span>
            </div>
            <div class="match-meta">
                <span>Vainqueur: ${match.winner_name} ${match.winner_surname}</span>
                <span>Date: ${new Date(match.match_date).toLocaleDateString()}</span>
            </div>
        `;
        recentMatchesList.appendChild(li);
    });
    // Update pagination info
    document.getElementById('recent-matches-page-info').textContent = `Page ${recentMatchesCurrentPage} / ${totalPages || 1}`;
    document.getElementById('recent-matches-prev').disabled = recentMatchesCurrentPage <= 1;
    document.getElementById('recent-matches-next').disabled = recentMatchesCurrentPage >= totalPages;
}

function setupRecentMatchesPagination() {
    document.getElementById('recent-matches-prev').addEventListener('click', function() {
        if (recentMatchesCurrentPage > 1) {
            recentMatchesCurrentPage--;
            displayRecentMatches();
        }
    });
    document.getElementById('recent-matches-next').addEventListener('click', function() {
        const totalPages = Math.ceil(matches.length / recentMatchesPerPage);
        if (recentMatchesCurrentPage < totalPages) {
            recentMatchesCurrentPage++;
            displayRecentMatches();
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    setupRecentMatchesPagination();
});