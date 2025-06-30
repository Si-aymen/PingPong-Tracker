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
        await pool.query(`
            CREATE TABLE IF NOT EXISTS matches (
                id SERIAL PRIMARY KEY,
                player1_id INTEGER NOT NULL,
                player2_id INTEGER NOT NULL,
                player1_score INTEGER NOT NULL,
                player2_score INTEGER NOT NULL,
                winner_id INTEGER NOT NULL,
                match_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
        console.log('PostgreSQL tables created or already exist.');
    } catch (dbErr) {
        console.error('Error creating PostgreSQL tables:', dbErr.message);
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
                m.match_date
            FROM matches m
            JOIN users p1 ON m.player1_id = p1.id
            JOIN users p2 ON m.player2_id = p2.id
            JOIN users w ON m.winner_id = w.id
            ORDER BY m.match_date DESC;
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});


app.post('/api/matches', authenticateToken, async (req, res, next) => {
    try {
        const { player1_id, player2_id, player1_score, player2_score } = req.body;

        if (!player1_id || !player2_id || player1_score === undefined || player2_score === undefined) {
            return res.status(400).json({ error: 'All match details are required.' });
        }

        if (player1_id === player2_id) {
            return res.status(400).json({ error: 'Player 1 and Player 2 cannot be the same.' });
        }

        // Determine winner
        let winner_id;
        if (player1_score > player2_score) {
            winner_id = player1_id;
        } else if (player2_score > player1_score) {
            winner_id = player2_id;
        } else {
            return res.status(400).json({ error: 'Match cannot be a draw. Please ensure a winner.' });
        }

        const result = await pool.query(
            'INSERT INTO matches (player1_id, player2_id, player1_score, player2_score, winner_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [player1_id, player2_id, player1_score, player2_score, winner_id]
        );

        res.status(201).json({
            id: result.rows[0].id,
            player1_id,
            player2_id,
            player1_score,
            player2_score,
            winner_id,
            message: 'Match recorded successfully.'
        });
    } catch (err) {
        console.error("Error inserting match:", err);
        next(err);
    }
});

// User statistics - MODIFIED for PostgreSQL syntax
app.get('/api/users/:id/stats', authenticateToken, async (req, res, next) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT
                COUNT(*) as total_matches,
                SUM(CASE WHEN winner_id = $1 THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN winner_id != $1 THEN 1 ELSE 0 END) as losses
            FROM matches
            WHERE player1_id = $1 OR player2_id = $1;
        `;

        const result = await pool.query(query, [id]);
        const stats = result.rows[0];

        if (!stats) {
            return res.status(404).json({ error: 'No matches found for this user' });
        }

        const winRate = stats.total_matches > 0 ? (stats.wins / stats.total_matches * 100).toFixed(1) : 0;

        res.json({
            total_matches: parseInt(stats.total_matches), // Ensure these are numbers
            wins: parseInt(stats.wins),
            losses: parseInt(stats.losses),
            win_rate: parseFloat(winRate)
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
