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
const easiestOpponentDisplay = document.getElementById('easiest-opponent'); // Ajout
const easiestOpponentRecordDisplay = document.getElementById('easiest-opponent-record'); // Ajout


// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    startPingPongIntroAnimation(); // Start the animation on load
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

    // --- Recent Matches Pagination & Search ---
    const searchInput = document.getElementById('recent-matches-search');
    const prevBtn = document.getElementById('recent-matches-prev');
    const nextBtn = document.getElementById('recent-matches-next');
    if (searchInput && prevBtn && nextBtn) {
        searchInput.addEventListener('input', function() {
            recentMatchesPage = 1;
            renderRecentMatches();
        });
        prevBtn.addEventListener('click', function() {
            if (recentMatchesPage > 1) {
                recentMatchesPage--;
                renderRecentMatches();
            }
        });
        nextBtn.addEventListener('click', function() {
            const totalPages = Math.max(1, Math.ceil(recentMatchesFiltered.length / recentMatchesPerPage));
            if (recentMatchesPage < totalPages) {
                recentMatchesPage++;
                renderRecentMatches();
            }
        });
    }
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
    easiestOpponentDisplay.textContent = 'N/A'; // Ajout
    easiestOpponentRecordDisplay.textContent = ''; // Ajout


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

function displayRecentMatches() {
    const recentMatchesList = document.getElementById('recent-matches-list');
    recentMatchesList.innerHTML = '';
    const recent5Matches = matches.slice(0, 5); // Get the 5 most recent matches
    recent5Matches.forEach(match => {
        const li = document.createElement('li');
        // Construct player team names for display
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
}

// --- Recent Matches Pagination & Search ---
let recentMatchesPage = 1;
const recentMatchesPerPage = 5;
let recentMatchesFiltered = [];

function filterRecentMatches(query) {
    if (!query) return matches;
    const q = query.trim().toLowerCase();
    return matches.filter(match => {
        // Search by player names, scores, or date
        const p1 = getUserNameById(match.player1_id);
        const p2 = getUserNameById(match.player2_id);
        const p1tm = match.player1_team_mate_id ? getUserNameById(match.player1_team_mate_id) : '';
        const p2tm = match.player2_team_mate_id ? getUserNameById(match.player2_team_mate_id) : '';
        const date = match.date ? new Date(match.date).toLocaleDateString('fr-FR') : '';
        return (
            (p1 && p1.toLowerCase().includes(q)) ||
            (p2 && p2.toLowerCase().includes(q)) ||
            (p1tm && p1tm.toLowerCase().includes(q)) ||
            (p2tm && p2tm.toLowerCase().includes(q)) ||
            (match.player1_score+'' || '').includes(q) ||
            (match.player2_score+'' || '').includes(q) ||
            (date && date.includes(q))
        );
    });
}

function renderRecentMatches() {
    const searchInput = document.getElementById('recent-matches-search');
    const pageInfo = document.getElementById('recent-matches-page-info');
    const list = document.getElementById('recent-matches-list');
    const query = searchInput ? searchInput.value : '';
    recentMatchesFiltered = filterRecentMatches(query);
    const total = recentMatchesFiltered.length;
    const totalPages = Math.max(1, Math.ceil(total / recentMatchesPerPage));
    if (recentMatchesPage > totalPages) recentMatchesPage = totalPages;
    if (recentMatchesPage < 1) recentMatchesPage = 1;
    const start = (recentMatchesPage-1)*recentMatchesPerPage;
    const end = start + recentMatchesPerPage;
    const pageMatches = recentMatchesFiltered.slice(start, end);
    list.innerHTML = '';
    pageMatches.forEach(match => {
        list.appendChild(renderRecentMatchItem(match));
    });
    pageInfo.textContent = `${recentMatchesPage} / ${totalPages}`;
    document.getElementById('recent-matches-prev').disabled = recentMatchesPage === 1;
    document.getElementById('recent-matches-next').disabled = recentMatchesPage === totalPages;
}

function renderRecentMatchItem(match) {
    // ...existing code for rendering a match item...
    // For now, reuse displayRecentMatches logic, but as a <li> element
    const li = document.createElement('li');
    const p1 = getUserNameById(match.player1_id);
    const p2 = getUserNameById(match.player2_id);
    const p1tm = match.player1_team_mate_id ? getUserNameById(match.player1_team_mate_id) : null;
    const p2tm = match.player2_team_mate_id ? getUserNameById(match.player2_team_mate_id) : null;
    const date = match.date ? new Date(match.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    const winner = match.winner_id ? getUserNameById(match.winner_id) : '';
    li.innerHTML = `
        <div class="match-info">
            <span>${p1}${p1tm ? ' & ' + p1tm : ''}</span>
            <span class="vs">VS</span>
            <span>${p2}${p2tm ? ' & ' + p2tm : ''}</span>
        </div>
        <div class="match-meta">
            <span><i class="fas fa-trophy" style="color:#ff69b4"></i> ${winner}</span>
            <span><i class="fas fa-star"></i> ${match.player1_score} - ${match.player2_score}</span>
            <span><i class="fas fa-calendar-alt"></i> ${date}</span>
        </div>
    `;
    return li;
}

function getUserNameById(id) {
    const u = users.find(u => u.id === id);
    return u ? `${u.name} ${u.surname}` : '';
}

// --- Hook up paginator and search events ---
document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...
    const searchInput = document.getElementById('recent-matches-search');
    const prevBtn = document.getElementById('recent-matches-prev');
    const nextBtn = document.getElementById('recent-matches-next');
    if (searchInput && prevBtn && nextBtn) {
        searchInput.addEventListener('input', function() {
            recentMatchesPage = 1;
            renderRecentMatches();
        });
        prevBtn.addEventListener('click', function() {
            if (recentMatchesPage > 1) {
                recentMatchesPage--;
                renderRecentMatches();
            }
        });
        nextBtn.addEventListener('click', function() {
            const totalPages = Math.max(1, Math.ceil(recentMatchesFiltered.length / recentMatchesPerPage));
            if (recentMatchesPage < totalPages) {
                recentMatchesPage++;
                renderRecentMatches();
            }
        });
    }
});

// --- Update displayRecentMatches to use paginator ---
function displayRecentMatches() {
    renderRecentMatches();
}

async function handleMatchSubmit(event) {
    event.preventDefault();
    showLoading();

    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());

    const is2v2 = data.match_type === '2v2';

    // Ensure player1_id is the logged-in user's ID
    data.player1_id = loggedInUserId;

    // Convert scores to numbers
    data.player1_score = parseInt(data.player1_score);
    data.player2_score = parseInt(data.player2_score);
    
    // Set 2v2 specific fields
    data.is_2v2 = is2v2;
    data.player1_team_mate_id = is2v2 ? parseInt(data.player1_team_mate_id) : null;
    data.player2_team_mate_id = is2v2 ? parseInt(data.player2_team_mate_id) : null;

    // Remove the temporary 'match_type' field as it's not needed by the backend directly
    delete data.match_type; 
    
    // Frontend validation for 2v2 specific requirements
    if (is2v2) {
        if (!data.player1_team_mate_id || !data.player2_team_mate_id) {
            showToast('Pour un match 2v2, les deux coéquipiers sont requis.', 'error');
            hideLoading();
            return;
        }
        if (data.player1_id === data.player1_team_mate_id) {
            showToast('Le Joueur 1 ne peut pas être son propre coéquipier.', 'error');
            hideLoading();
            return;
        }
        if (data.player2_id === data.player2_team_mate_id) {
            showToast('Le Joueur 2 ne peut pas être son propre coéquipier.', 'error');
            hideLoading();
            return;
        }

        // Check for unique players across all 4 positions
        const allPlayerIds = [data.player1_id, data.player1_team_mate_id, data.player2_id, data.player2_team_mate_id];
        const uniquePlayerIds = new Set(allPlayerIds);
        if (uniquePlayerIds.size !== 4) { // Expect 4 unique players for 2v2
            showToast('Un même joueur ne peut pas être sur plusieurs équipes dans un match 2v2.', 'error');
            hideLoading();
            return;
        }
    } else { // 1v1 validation
        if (data.player1_id === data.player2_id) {
            showToast('Le Joueur 1 et le Joueur 2 ne peuvent pas être la même personne dans un match 1v1.', 'error');
            hideLoading();
            return;
        }
    }


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
        await updateDashboard(); // Update dashboard after new match is recorded
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

    // If switching to dashboard, ensure it's updated
    if (tabId === 'dashboard' && loggedInUserId) {
        updateDashboard();
    }
}

function openUserModal(userId = null) {
    const modalTitle = document.getElementById('user-modal-title');
    const userForm = document.getElementById('user-form');
    userForm.reset();

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
    // Default to 1v1 when opening the modal
    document.querySelector('input[name="match_type"][value="1v1"]').checked = true;
    toggleMatchFormFields(); // Call to set initial visibility based on default 1v1
    populatePlayerSelectsForMatch(); // Populate dropdowns
}

function closeMatchModal() {
    matchModal.classList.remove('active');
}

// NEW: Function to toggle form fields based on match type
function toggleMatchFormFields() {
    const is2v2 = document.querySelector('input[name="match_type"]:checked').value === '2v2';

    if (is2v2) {
        player1MateGroup.style.display = 'block';
        player2MateGroup.style.display = 'block';
        player1TeamMateSelect.setAttribute('required', 'required');
        player2TeamMateSelect.setAttribute('required', 'required');
    } else {
        player1MateGroup.style.display = 'none';
        player2MateGroup.style.display = 'none';
        player1TeamMateSelect.removeAttribute('required');
        player2TeamMateSelect.removeAttribute('required');
        // Clear selections when switching back to 1v1
        player1TeamMateSelect.value = '';
        player2TeamMateSelect.value = '';
    }
    // Re-populate options to ensure correct filtering after toggle
    updateTeamMateOptions(); 
}

// NEW: populatePlayerSelectsForMatch
function populatePlayerSelectsForMatch() {
    // Clear previous options
    player1Select.innerHTML = '';
    player2Select.innerHTML = '';
    player1TeamMateSelect.innerHTML = '<option value="">Sélectionner un coéquipier</option>';
    player2TeamMateSelect.innerHTML = '<option value="">Sélectionner un coéquipier</option>';


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
        player1Select.innerHTML = '<option value="">Erreur: Joueur non trouvé</option>';
        player1Select.disabled = true;
    }

    // Populate Player 2 (opponent) - initially all other users
    const defaultOption = document.createElement('option');
    defaultOption.value = "";
    defaultOption.textContent = "Sélectionner un adversaire";
    player2Select.appendChild(defaultOption);

    const otherUsers = users.filter(user => user.id !== loggedInUserId);
    otherUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.name} ${user.surname}`;
        player2Select.appendChild(option);
    });
    
    // Call updateTeamMateOptions after initial population
    updateTeamMateOptions();
}

// NEW Function to update teammate dropdowns based on current player selections
function updateTeamMateOptions() {
    const selectedPlayer1Id = parseInt(player1Select.value);
    const selectedPlayer2Id = parseInt(player2Select.value);
    
    // Store current selections to try and re-select after update
    const currentP1MateValue = player1TeamMateSelect.value;
    const currentP2MateValue = player2TeamMateSelect.value;

    // Filter available players for team mates: exclude Player 1 and Player 2
    let availableTeamMates = users.filter(user => 
        user.id !== selectedPlayer1Id && 
        user.id !== selectedPlayer2Id
    );

    // Populate player1TeamMateSelect
    player1TeamMateSelect.innerHTML = '<option value="">Sélectionner un coéquipier</option>';
    availableTeamMates.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.name} ${user.surname}`;
        player1TeamMateSelect.appendChild(option);
    });

    // Populate player2TeamMateSelect
    player2TeamMateSelect.innerHTML = '<option value="">Sélectionner un coéquipier</option>';
    availableTeamMates.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.name} ${user.surname}`;
        player2TeamMateSelect.appendChild(option);
    });

    // Attempt to re-select previous values if they are still valid
    if (availableTeamMates.some(u => u.id === parseInt(currentP1MateValue))) {
        player1TeamMateSelect.value = currentP1MateValue;
    } else {
        player1TeamMateSelect.value = '';
    }

    if (availableTeamMates.some(u => u.id === parseInt(currentP2MateValue))) {
        player2TeamMateSelect.value = currentP2MateValue;
    } else {
        player2TeamMateSelect.value = '';
    }
}

// MODIFIED: Update Dashboard Function to include personal stats
async function updateDashboard() {
    document.getElementById('total-users').textContent = users.length;
    document.getElementById('total-matches').textContent = matches.length;

    if (loggedInUserId) {
        showLoading();
        try {
            const response = await authenticatedFetch(`${API_BASE}/users/${loggedInUserId}/stats`);
            const stats = await response.json();

            // Display overall personal stats
            personalTotalMatches.textContent = stats.overall_stats.total_matches;
            personalWins.textContent = stats.overall_stats.wins;
            personalLosses.textContent = stats.overall_stats.losses;
            personalWinRate.textContent = `${stats.overall_stats.win_rate}%`;

            // Calculate and display strongest opponent
            const strongestOpponent = calculateStrongestOpponent(stats.opponent_stats);
            if (strongestOpponent) {
                strongestOpponentDisplay.textContent = `${strongestOpponent.opponent_name} ${strongestOpponent.opponent_surname}`;
                strongestOpponentRecordDisplay.textContent = `(${strongestOpponent.wins_against} V - ${strongestOpponent.losses_against} D)`;
            } else {
                strongestOpponentDisplay.textContent = 'N/A';
                strongestOpponentRecordDisplay.textContent = '';
            }

            // Calculate and display easiest opponent
            const easiestOpponent = calculateEasiestOpponent(stats.opponent_stats);
            if (easiestOpponent) {
                easiestOpponentDisplay.textContent = `${easiestOpponent.opponent_name} ${easiestOpponent.opponent_surname}`;
                easiestOpponentRecordDisplay.textContent = `(${easiestOpponent.wins_against} V - ${easiestOpponent.losses_against} D)`;
            } else {
                easiestOpponentDisplay.textContent = 'N/A';
                easiestOpponentRecordDisplay.textContent = '';
            }

            // Calculate and display best teammate
            const bestTeammate = calculateBestTeammate(stats.teammate_stats);
            if (bestTeammate) {
                bestTeammateDisplay.textContent = `${bestTeammate.teammate_name} ${bestTeammate.teammate_surname}`;
                bestTeammateMatchesDisplay.textContent = `(${bestTeammate.matches_together} matchs ensemble)`;
            } else {
                bestTeammateDisplay.textContent = 'N/A';
                bestTeammateMatchesDisplay.textContent = '';
            }

        } catch (error) {
            console.error('Error loading personal stats:', error);
            showToast('Erreur lors du chargement de vos statistiques personnelles.', 'error');
            // Clear personal stats fields if there's an error
            personalTotalMatches.textContent = '0';
            personalWins.textContent = '0';
            personalLosses.textContent = '0';
            personalWinRate.textContent = '0%';
            strongestOpponentDisplay.textContent = 'N/A';
            strongestOpponentRecordDisplay.textContent = '';
            bestTeammateDisplay.textContent = 'N/A';
            bestTeammateMatchesDisplay.textContent = '';
            easiestOpponentDisplay.textContent = 'N/A'; // Ajout
            easiestOpponentRecordDisplay.textContent = ''; // Ajout
        } finally {
            hideLoading();
        }
    }
}

// NEW: Helper function to find the strongest opponent
function calculateStrongestOpponent(opponentStats) {
    if (!opponentStats || opponentStats.length === 0) {
        return null;
    }

    let strongest = null;
    let highestLossRate = -1; // We want the opponent you lose to most often

    opponentStats.forEach(opponent => {
        if (opponent.total_games_against > 0) {
            const lossRate = opponent.losses_against / opponent.total_games_against;
            if (lossRate > highestLossRate) {
                highestLossRate = lossRate;
                strongest = opponent;
            }
        }
    });
    return strongest;
}

// NEW: Helper function to find the best teammate (most matches played together)
function calculateBestTeammate(teammateStats) {
    if (!teammateStats || teammateStats.length === 0) {
        return null;
    }

    let best = null;
    let maxMatches = -1;

    teammateStats.forEach(teammate => {
        if (teammate.matches_together > maxMatches) {
            maxMatches = teammate.matches_together;
            best = teammate;
        }
    });
    return best;
}

// NEW: Helper function to find the easiest opponent (highest win rate against)
function calculateEasiestOpponent(opponentStats) {
    if (!opponentStats || opponentStats.length === 0) {
        return null;
    }

    let easiest = null;
    let highestWinRate = -1; // On veut l'adversaire contre qui on gagne le plus souvent

    opponentStats.forEach(opponent => {
        if (opponent.total_games_against > 0 && opponent.wins_against > 0) {
            const winRate = opponent.wins_against / opponent.total_games_against;
            if (winRate > highestWinRate) {
                highestWinRate = winRate;
                easiest = opponent;
            }
        }
    });
    return easiest;
}


// --- Utility Functions (Toast, Loading) ---
function showLoading() {
    loading.style.display = 'flex';
}

function hideLoading() {
    loading.style.display = 'none';
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.classList.add('toast', type);
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => {
            toast.remove();
        });
    }, 3000); // Hide after 3 seconds
}

// Function to handle editing a user (called from displayUsers)
function editUser(userId) {
    openUserModal(userId);
}

// --- Ping Pong Intro Animation ---
function startPingPongIntroAnimation() {
    const overlay = document.getElementById('intro-animation');
    const canvas = document.getElementById('pingpong-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Ball and paddle properties
    let ball = { x: w/2, y: h/2, r: 28, dx: 7.2, dy: 3.7 };
    let paddleL = { x: 60, y: h/2-90, w: 28, h: 180, color: '#fff' };
    let paddleR = { x: w-88, y: h/2-90, w: 28, h: 180, color: '#ff69b4' };
    let paddleLDir = 1, paddleRDir = -1;
    let paddleSpeed = 3.2;
    let animFrame;
    let bounceCount = 0;
    let maxBounces = 12;
    let bgGradient = ctx.createLinearGradient(0,0,w,h);
    bgGradient.addColorStop(0, '#191970');
    bgGradient.addColorStop(0.5, '#3f51b5');
    bgGradient.addColorStop(1, '#ff69b4');

    function drawTable() {
        // Table background
        ctx.clearRect(0,0,w,h);
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0,0,w,h);
        ctx.restore();
        // Net
        ctx.setLineDash([16, 16]);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(w/2, 60);
        ctx.lineTo(w/2, h-60);
        ctx.stroke();
        ctx.setLineDash([]);
        // Glow effect
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.arc(w/2, h/2, h/2.2, 0, 2*Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.restore();
    }

    function drawPaddle(p) {
        ctx.save();
        ctx.shadowColor = p.color === '#ff69b4' ? '#ff69b4' : '#191970';
        ctx.shadowBlur = 32;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.restore();
        // Paddle shine
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#fff';
        ctx.fillRect(p.x + p.w/2, p.y + 10, 6, p.h-20);
        ctx.restore();
    }

    function drawBall() {
        ctx.save();
        ctx.shadowColor = '#ff69b4';
        ctx.shadowBlur = 32;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r, 0, 2*Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#ff69b4';
        ctx.stroke();
        ctx.restore();
        // Ball highlight
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.arc(ball.x-8, ball.y-8, ball.r/2, 0, 2*Math.PI);
        ctx.fillStyle = '#ff69b4';
        ctx.fill();
        ctx.restore();
    }

    function animate() {
        drawTable();
        drawPaddle(paddleL);
        drawPaddle(paddleR);
        drawBall();

        // Ball movement
        ball.x += ball.dx;
        ball.y += ball.dy;
        // Bounce off top/bottom
        if (ball.y - ball.r < 0 || ball.y + ball.r > h) ball.dy *= -1;
        // Bounce off left paddle
        if (
            ball.x - ball.r < paddleL.x + paddleL.w &&
            ball.y > paddleL.y &&
            ball.y < paddleL.y + paddleL.h &&
            ball.dx < 0
        ) {
            ball.dx *= -1.08;
            ball.dy += (Math.random()-0.5)*3.2;
            bounceCount++;
        }
        // Bounce off right paddle
        if (
            ball.x + ball.r > paddleR.x &&
            ball.y > paddleR.y &&
            ball.y < paddleR.y + paddleR.h &&
            ball.dx > 0
        ) {
            ball.dx *= -1.08;
            ball.dy += (Math.random()-0.5)*3.2;
            bounceCount++;
        }
        // Bounce off left/right wall
        if (ball.x - ball.r < 0 || ball.x + ball.r > w) ball.dx *= -1;

        // Paddle movement (gentle up and down)
        paddleL.y += paddleLDir * paddleSpeed;
        paddleR.y += paddleRDir * paddleSpeed * 0.9;
        if (paddleL.y < 60 || paddleL.y + paddleL.h > h-60) paddleLDir *= -1;
        if (paddleR.y < 60 || paddleR.y + paddleR.h > h-60) paddleRDir *= -1;

        // End animation after a few bounces
        if (bounceCount < maxBounces) {
            animFrame = requestAnimationFrame(animate);
        } else {
            setTimeout(() => {
                overlay.classList.add('hide');
                setTimeout(() => overlay.style.display = 'none', 700);
            }, 700);
        }
    }
    animate();
}