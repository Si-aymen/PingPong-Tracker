// server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const util = require('util');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg'); // Import the PostgreSQL client pool

// Load environment variables from .env file
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'baea99dfab042bd2338c369ae474c6e17ec98ae61b7eec56a3f135e0e85f6760'; // IMPORTANT: Use a strong, unique key in production!
const DATABASE_URL = process.env.DATABASE_URL; // Your PostgreSQL connection string

// Ensure DATABASE_URL is set
if (!DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set. Please set it in your .env file or environment.');
    process.exit(1); // Exit if no database URL is provided
}

// PostgreSQL Pool Setup
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        // Required for Neon and many other cloud PostgreSQL services
        // Set rejectUnauthorized to false if you encounter issues with self-signed certs in development
        // For production, you should ideally have proper certificate validation.
        rejectUnauthorized: false,
    },
});

// Test the database connection
pool.connect()
    .then(client => {
        console.log('Connected to PostgreSQL database!');
        client.release(); // Release the client back to the pool
        initializeDatabaseSchema(); // Initialize schema after successful connection
    })
    .catch(err => {
        console.error('Error connecting to PostgreSQL database:', err.message);
        console.error('Please check your DATABASE_URL and network connectivity.');
        process.exit(1); // Exit if unable to connect to the database
    });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Promisify fs functions for better async handling
const mkdirAsync = util.promisify(fs.mkdir);
const existsAsync = util.promisify(fs.exists);

// Create uploads directory if it doesn't exist
(async () => {
    try {
        const uploadsExists = await existsAsync('uploads');
        if (!uploadsExists) {
            await mkdirAsync('uploads');
            console.log('Created uploads directory.');
        }
    } catch (err) {
        console.error('Error creating uploads directory:', err);
    }
})();

// PostgreSQL Database Schema Initialization
async function initializeDatabaseSchema() {
    try {
        // Create users table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                surname TEXT NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                photo TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Add new columns to matches table if they don't exist (for existing databases)
        // Using DO $$ BEGIN ... END $$; for conditional DDL
        await pool.query(`
            DO $$
            BEGIN
                ALTER TABLE matches ADD COLUMN IF NOT EXISTS player1_team_mate_id INTEGER;
                ALTER TABLE matches ADD COLUMN IF NOT EXISTS player2_team_mate_id INTEGER;
                ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_2v2 BOOLEAN DEFAULT FALSE;

                -- Add foreign keys after columns are ensured to exist
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_player1_team_mate_id_fkey') THEN
                    ALTER TABLE matches ADD CONSTRAINT matches_player1_team_mate_id_fkey FOREIGN KEY (player1_team_mate_id) REFERENCES users(id) ON DELETE CASCADE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_player2_team_mate_id_fkey') THEN
                    ALTER TABLE matches ADD CONSTRAINT matches_player2_team_mate_id_fkey FOREIGN KEY (player2_team_mate_id) REFERENCES users(id) ON DELETE CASCADE;
                END IF;
            END
            $$;
        `);

        // Create matches table if it doesn't exist (includes new columns for fresh installs)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS matches (
                id SERIAL PRIMARY KEY,
                player1_id INTEGER NOT NULL,
                player2_id INTEGER NOT NULL,
                player1_score INTEGER NOT NULL,
                player2_score INTEGER NOT NULL,
                winner_id INTEGER NOT NULL,
                match_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                is_2v2 BOOLEAN DEFAULT FALSE, -- New column
                player1_team_mate_id INTEGER, -- New column
                player2_team_mate_id INTEGER, -- New column
                FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (player1_team_mate_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (player2_team_mate_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
        console.log('PostgreSQL tables created or updated.');
    } catch (dbErr) {
        console.error('Error creating/updating PostgreSQL tables:', dbErr.message);
        // This is a critical error, you might want to exit or handle it differently
    }
}

// Multer configuration for photo uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- Authentication Middleware ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) {
        return res.status(401).json({ error: 'Authentication token required.' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            console.error("JWT verification error:", err);
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }
        req.user = user; // Attach user information to the request
        next();
    });
}

// --- API Endpoints ---

// User Registration (Public endpoint)
app.post('/api/register', async (req, res, next) => {
    try {
        const { username, password, name, surname } = req.body;

        if (!username || !password || !name || !surname) {
            return res.status(400).json({ error: 'Username, password, name, and surname are required for registration.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10); // Hash the password

        const result = await pool.query(
            'INSERT INTO users (username, password, name, surname) VALUES ($1, $2, $3, $4) RETURNING id',
            [username, hashedPassword, name, surname]
        );

        res.status(201).json({
            id: result.rows[0].id, // PostgreSQL returns id in rows
            username,
            name,
            surname,
            message: 'User registered successfully.'
        });
    } catch (err) {
        // PostgreSQL unique constraint violation error code is '23505'
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Username already exists.' });
        }
        next(err);
    }
});

// User Login (Public endpoint)
app.post('/api/login', async (req, res, next) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, username: user.username, name: user.name, surname: user.surname },
            SECRET_KEY,
            { expiresIn: '1h' } // Token expires in 1 hour
        );

        res.json({ message: 'Login successful.', token });
    } catch (err) {
        next(err);
    }
});


// Protected Routes (apply authenticateToken middleware)
app.get('/api/users', authenticateToken, async (req, res, next) => {
    try {
        const result = await pool.query('SELECT id, name, surname, photo FROM users ORDER BY name, surname');
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

app.get('/api/users/:id', authenticateToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT id, name, surname, photo FROM users WHERE id = $1', [id]);
        const user = result.rows[0];
        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (err) {
        next(err);
    }
});

// Add/Update User (now handles photo upload with form-data)
app.post('/api/users', authenticateToken, upload.single('photo'), async (req, res, next) => {
    try {
        const { name, surname, username, password } = req.body;
        const photo = req.file ? `/uploads/${req.file.filename}` : null;

        if (!name || !surname || !username || !password) {
            return res.status(400).json({ error: 'Name, surname, username, and password are required' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            'INSERT INTO users (name, surname, username, password, photo) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, surname, username, hashedPassword, photo]
        );

        res.status(201).json({
            id: result.rows[0].id,
            name,
            surname,
            username,
            photo,
            message: 'User created successfully.'
        });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Username already exists.' });
        }
        next(err);
    }
});

app.put('/api/users/:id', authenticateToken, upload.single('photo'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, surname, password } = req.body; // Username is readOnly, so not expected here for update

        let photo = req.body.photo_url_existing; // This would be passed if photo is unchanged or removed
        if (req.file) {
            photo = `/uploads/${req.file.filename}`; // New photo uploaded
        } else if (req.body.photo_removed === 'true') {
            photo = null; // Photo explicitly removed
        }

        // Fetch existing user to get current photo path for deletion if new photo is uploaded
        const existingUserResult = await pool.query('SELECT photo FROM users WHERE id = $1', [id]);
        const existingPhotoPath = existingUserResult.rows[0] ? existingUserResult.rows[0].photo : null;

        let updateQuery = 'UPDATE users SET name = $1, surname = $2, photo = $3';
        let queryParams = [name, surname, photo];
        let paramCount = 3;

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateQuery += `, password = $${++paramCount}`;
            queryParams.push(hashedPassword);
        }

        updateQuery += ` WHERE id = $${++paramCount} RETURNING id, name, surname, photo`;
        queryParams.push(id);

        const result = await pool.query(updateQuery, queryParams);
        const updatedUser = result.rows[0];

        if (updatedUser) {
            // Delete old photo if a new one was uploaded and an old one existed
            if (req.file && existingPhotoPath && existingPhotoPath.startsWith('/uploads/')) {
                const oldPhotoFullPath = path.join(__dirname, 'public', existingPhotoPath);
                fs.unlink(oldPhotoFullPath, (err) => {
                    if (err) console.error('Error deleting old photo:', err);
                });
            }
            res.json({ message: 'User updated successfully.', user: updatedUser });
        } else {
            res.status(404).json({ error: 'User not found.' });
        }
    } catch (err) {
        next(err);
    }
});


app.delete('/api/users/:id', authenticateToken, async (req, res, next) => {
    try {
        const { id } = req.params;

        // Get photo path before deleting user to delete the file
        const userResult = await pool.query('SELECT photo FROM users WHERE id = $1', [id]);
        const user = userResult.rows[0];

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);

        if (result.rowCount > 0) {
            // If user had a photo, delete the file
            if (user.photo && user.photo.startsWith('/uploads/')) {
                const photoPath = path.join(__dirname, 'public', user.photo);
                fs.unlink(photoPath, (err) => {
                    if (err) console.error('Error deleting user photo file:', err);
                });
            }
            res.json({ message: 'User and associated matches deleted successfully.' });
        } else {
            res.status(404).json({ error: 'User not found.' });
        }
    } catch (err) {
        next(err);
    }
});


app.get('/api/matches', authenticateToken, async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT
                m.id,
                m.player1_id,
                p1.name AS player1_name,
                p1.surname AS player1_surname,
                m.player2_id,
                p2.name AS player2_name,
                p2.surname AS player2_surname,
                m.player1_score,
                m.player2_score,
                m.winner_id,
                w.name AS winner_name,
                w.surname AS winner_surname,
                m.match_date,
                m.is_2v2, -- Include new column
                m.player1_team_mate_id, -- Include new column
                p1tm.name AS player1_team_mate_name, -- Join for teammate name
                p1tm.surname AS player1_team_mate_surname, -- Join for teammate surname
                m.player2_team_mate_id, -- Include new column
                p2tm.name AS player2_team_mate_name, -- Join for teammate name
                p2tm.surname AS player2_team_mate_surname -- Join for teammate surname
            FROM matches m
            JOIN users p1 ON m.player1_id = p1.id
            JOIN users p2 ON m.player2_id = p2.id
            JOIN users w ON m.winner_id = w.id
            LEFT JOIN users p1tm ON m.player1_team_mate_id = p1tm.id -- LEFT JOIN for optional teammates
            LEFT JOIN users p2tm ON m.player2_team_mate_id = p2tm.id -- LEFT JOIN for optional teammates
            ORDER BY m.match_date DESC;
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});


app.post('/api/matches', authenticateToken, async (req, res, next) => {
    try {
        const { 
            player1_id, 
            player2_id, 
            player1_score, 
            player2_score,
            player1_team_mate_id, // New
            player2_team_mate_id, // New
            is_2v2 // New
        } = req.body;

        // Basic validation for essential fields
        if (!player1_id || !player2_id || player1_score === undefined || player2_score === undefined) {
            return res.status(400).json({ error: 'All essential match details are required.' });
        }

        // Validate 2v2 specific fields
        if (is_2v2 && (!player1_team_mate_id || !player2_team_mate_id)) {
            return res.status(400).json({ error: 'For 2v2 matches, both team mates are required.' });
        }
        
        // Frontend validation: Players in the same team shouldn't be the same person
        if (is_2v2 && (player1_id === player1_team_mate_id || player2_id === player2_team_mate_id)) {
            return res.status(400).json({ error: 'A player cannot be their own teammate.' });
        }
        
        // Ensure no player is listed multiple times across teams (in 2v2)
        if (is_2v2) {
            const allPlayerIds = [player1_id, player1_team_mate_id, player2_id, player2_team_mate_id];
            const uniquePlayerIds = new Set(allPlayerIds);
            if (uniquePlayerIds.size !== 4) { // Expect 4 unique players for 2v2
                return res.status(400).json({ error: 'The same player cannot be on multiple teams in a 2v2 match.' });
            }
        } else {
            // For 1v1, ensure player1 and player2 are different
            if (player1_id === player2_id) {
                return res.status(400).json({ error: 'Player 1 and Player 2 cannot be the same in a 1v1 match.' });
            }
        }


        // Determine winner (winner_id will be one of the players from the winning team)
        let winner_id;
        if (player1_score > player2_score) {
            winner_id = player1_id; 
        } else if (player2_score > player1_score) {
            winner_id = player2_id; 
        } else {
            return res.status(400).json({ error: 'Match cannot be a draw. Please ensure a winner.' });
        }

        const result = await pool.query(
            'INSERT INTO matches (player1_id, player2_id, player1_score, player2_score, winner_id, player1_team_mate_id, player2_team_mate_id, is_2v2) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [player1_id, player2_id, player1_score, player2_score, winner_id, is_2v2 ? player1_team_mate_id : null, is_2v2 ? player2_team_mate_id : null, is_2v2]
        );

        res.status(201).json({
            id: result.rows[0].id,
            player1_id,
            player2_id,
            player1_score,
            player2_score,
            winner_id,
            player1_team_mate_id: is_2v2 ? player1_team_mate_id : null,
            player2_team_mate_id: is_2v2 ? player2_team_mate_id : null,
            is_2v2,
            message: 'Match recorded successfully.'
        });
    } catch (err) {
        console.error("Error inserting match:", err);
        next(err);
    }
});

// User statistics - MODIFIED to provide more detailed stats for dashboard
app.get('/api/users/:id/stats', authenticateToken, async (req, res, next) => {
    try {
        const { id } = req.params;

        // Overall stats
        const overallStatsQuery = `
            SELECT
                COUNT(*) as total_matches,
                SUM(CASE WHEN winner_id = $1 THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN (player1_id = $1 OR player1_team_mate_id = $1 OR player2_id = $1 OR player2_team_mate_id = $1) AND winner_id != $1 THEN 1 ELSE 0 END) as losses
            FROM matches
            WHERE player1_id = $1 OR player2_id = $1 OR player1_team_mate_id = $1 OR player2_team_mate_id = $1;
        `;
        const overallStatsResult = await pool.query(overallStatsQuery, [id]);
        const overallStats = overallStatsResult.rows[0];

        const totalMatches = parseInt(overallStats.total_matches);
        const wins = parseInt(overallStats.wins);
        const losses = parseInt(overallStats.losses);
        const winRate = totalMatches > 0 ? (wins / totalMatches * 100).toFixed(1) : 0;

        // Opponent stats (Revised for robustness and clarity using UNION ALL)
        const opponentStatsQuery = `
            WITH UserOpponents AS (
                -- 1v1 matches where current user is player1
                SELECT
                    m.player2_id AS opponent_id,
                    (m.winner_id = $1) AS is_win
                FROM matches m
                WHERE m.player1_id = $1 AND m.is_2v2 = FALSE

                UNION ALL

                -- 1v1 matches where current user is player2
                SELECT
                    m.player1_id AS opponent_id,
                    (m.winner_id = $1) AS is_win
                FROM matches m
                WHERE m.player2_id = $1 AND m.is_2v2 = FALSE

                UNION ALL

                -- 2v2 matches where current user is on team1 (player1 or player1_team_mate)
                -- Opponents are player2 and player2_team_mate
                SELECT
                    m.player2_id AS opponent_id,
                    (m.winner_id = $1) AS is_win
                FROM matches m
                WHERE (m.player1_id = $1 OR m.player1_team_mate_id = $1) AND m.is_2v2 = TRUE

                UNION ALL

                SELECT
                    m.player2_team_mate_id AS opponent_id,
                    (m.winner_id = $1) AS is_win
                FROM matches m
                WHERE (m.player1_id = $1 OR m.player1_team_mate_id = $1) AND m.is_2v2 = TRUE
                AND m.player2_team_mate_id IS NOT NULL -- Ensure teammate exists

                UNION ALL

                -- 2v2 matches where current user is on team2 (player2 or player2_team_mate)
                -- Opponents are player1 and player1_team_mate
                SELECT
                    m.player1_id AS opponent_id,
                    (m.winner_id = $1) AS is_win
                FROM matches m
                WHERE (m.player2_id = $1 OR m.player2_team_mate_id = $1) AND m.is_2v2 = TRUE

                UNION ALL

                SELECT
                    m.player1_team_mate_id AS opponent_id,
                    (m.winner_id = $1) AS is_win
                FROM matches m
                WHERE (m.player2_id = $1 OR m.player2_team_mate_id = $1) AND m.is_2v2 = TRUE
                AND m.player1_team_mate_id IS NOT NULL -- Ensure teammate exists
            )
            SELECT
                uo.opponent_id,
                u.name AS opponent_name,
                u.surname AS opponent_surname,
                COUNT(*) AS total_games_against,
                SUM(CASE WHEN uo.is_win THEN 1 ELSE 0 END) AS wins_against,
                SUM(CASE WHEN NOT uo.is_win THEN 1 ELSE 0 END) AS losses_against
            FROM UserOpponents uo
            JOIN users u ON u.id = uo.opponent_id
            GROUP BY uo.opponent_id, u.name, u.surname;
        `;
        const opponentStatsResult = await pool.query(opponentStatsQuery, [id]);
        const opponentStats = opponentStatsResult.rows.map(row => ({
            opponent_id: parseInt(row.opponent_id),
            opponent_name: row.opponent_name,
            opponent_surname: row.opponent_surname,
            total_games_against: parseInt(row.total_games_against),
            wins_against: parseInt(row.wins_against),
            losses_against: parseInt(row.losses_against)
        }));

        // Teammate stats (Revised for robustness and clarity using UNION ALL)
        const teammateStatsQuery = `
            WITH UserTeammates AS (
                -- User is player1, teammate is player1_team_mate_id
                SELECT
                    m.player1_team_mate_id AS teammate_id
                FROM matches m
                WHERE m.player1_id = $1 AND m.is_2v2 = TRUE AND m.player1_team_mate_id IS NOT NULL

                UNION ALL

                -- User is player1_team_mate_id, teammate is player1_id
                SELECT
                    m.player1_id AS teammate_id
                FROM matches m
                WHERE m.player1_team_mate_id = $1 AND m.is_2v2 = TRUE

                UNION ALL

                -- User is player2, teammate is player2_team_mate_id
                SELECT
                    m.player2_team_mate_id AS teammate_id
                FROM matches m
                WHERE m.player2_id = $1 AND m.is_2v2 = TRUE AND m.player2_team_mate_id IS NOT NULL

                UNION ALL

                -- User is player2_team_mate_id, teammate is player2_id
                SELECT
                    m.player2_id AS teammate_id
                FROM matches m
                WHERE m.player2_team_mate_id = $1 AND m.is_2v2 = TRUE
            )
            SELECT
                ut.teammate_id,
                u.name AS teammate_name,
                u.surname AS teammate_surname,
                COUNT(*) AS matches_together
            FROM UserTeammates ut
            JOIN users u ON u.id = ut.teammate_id
            GROUP BY ut.teammate_id, u.name, u.surname;
        `;
        const teammateStatsResult = await pool.query(teammateStatsQuery, [id]);
        const teammateStats = teammateStatsResult.rows.map(row => ({
            teammate_id: parseInt(row.teammate_id),
            teammate_name: row.teammate_name,
            teammate_surname: row.teammate_surname,
            matches_together: parseInt(row.matches_together)
        }));


        res.json({
            overall_stats: {
                total_matches: totalMatches, 
                wins: wins,
                losses: losses,
                win_rate: parseFloat(winRate)
            },
            opponent_stats: opponentStats,
            teammate_stats: teammateStats
        });
    } catch (err) {
        next(err);
    }
});


// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!', details: err.message });
});

// Start the server after database initialization
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
