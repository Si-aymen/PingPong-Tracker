const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const util = require('util');

const app = express();
const PORT = process.env.PORT || 3000;

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
        }
    } catch (err) {
        console.error('Error creating uploads directory:', err);
    }
})();

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

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
    },
    fileFilter
});

// Database initialization with promise wrapper
const db = new sqlite3.Database('pingpong.db');

// Promisify database methods for better async handling
const dbRun = util.promisify(db.run.bind(db));
const dbAll = util.promisify(db.all.bind(db));
const dbGet = util.promisify(db.get.bind(db));

// Create tables
const initializeDatabase = async () => {
    try {
        await dbRun(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            surname TEXT NOT NULL,
            photo TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        await dbRun(`CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player1_id INTEGER NOT NULL,
            player2_id INTEGER NOT NULL,
            player1_score INTEGER NOT NULL,
            player2_score INTEGER NOT NULL,
            winner_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player1_id) REFERENCES users (id),
            FOREIGN KEY (player2_id) REFERENCES users (id),
            FOREIGN KEY (winner_id) REFERENCES users (id)
        )`);
    } catch (err) {
        console.error('Error initializing database:', err);
    }
};

initializeDatabase();

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Routes for users

// Get all users
app.get('/api/users', async (req, res, next) => {
    try {
        const rows = await dbAll('SELECT * FROM users ORDER BY name, surname');
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// Get user by ID
app.get('/api/users/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const row = await dbGet('SELECT * FROM users WHERE id = ?', [id]);

        if (!row) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(row);
    } catch (err) {
        next(err);
    }
});

// Create new user
app.post('/api/users', upload.single('photo'), async (req, res, next) => {
    try {
        const { name, surname } = req.body;

        if (!name || !surname) {
            return res.status(400).json({ error: 'Name and surname are required' });
        }

        const photo = req.file ? req.file.filename : null;

        const result = await dbRun(
            'INSERT INTO users (name, surname, photo) VALUES (?, ?, ?)',
            [name, surname, photo]
        );

        res.json({
            id: result.lastID,
            name,
            surname,
            photo,
            message: 'User created successfully'
        });
    } catch (err) {
        next(err);
    }
});

// Update user
app.put('/api/users/:id', upload.single('photo'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, surname } = req.body;

        if (!name || !surname) {
            return res.status(400).json({ error: 'Name and surname are required' });
        }

        // Get current user data
        const user = await dbGet('SELECT photo FROM users WHERE id = ?', [id]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const photo = req.file ? req.file.filename : user.photo;

        // Delete old photo if new one is uploaded
        if (req.file && user.photo) {
            const oldPhotoPath = path.join('uploads', user.photo);
            if (fs.existsSync(oldPhotoPath)) {
                fs.unlinkSync(oldPhotoPath);
            }
        }

        const result = await dbRun(
            'UPDATE users SET name = ?, surname = ?, photo = ? WHERE id = ?',
            [name, surname, photo, id]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: parseInt(id),
            name,
            surname,
            photo,
            message: 'User updated successfully'
        });
    } catch (err) {
        next(err);
    }
});

// Routes for matches

// Get all matches with player names
app.get('/api/matches', async (req, res, next) => {
    try {
        const query = `
            SELECT 
                m.*,
                u1.name as player1_name,
                u1.surname as player1_surname,
                u2.name as player2_name,
                u2.surname as player2_surname,
                w.name as winner_name,
                w.surname as winner_surname
            FROM matches m
            JOIN users u1 ON m.player1_id = u1.id
            JOIN users u2 ON m.player2_id = u2.id
            JOIN users w ON m.winner_id = w.id
            ORDER BY m.created_at DESC
        `;

        const rows = await dbAll(query);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// Create new match
app.post('/api/matches', async (req, res, next) => {
    try {
        const { player1_id, player2_id, player1_score, player2_score } = req.body;

        if (!player1_id || !player2_id || player1_score === undefined || player2_score === undefined) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (player1_id === player2_id) {
            return res.status(400).json({ error: 'A player cannot play against themselves' });
        }

        const winner_id = player1_score > player2_score ? player1_id : player2_id;

        const result = await dbRun(
            'INSERT INTO matches (player1_id, player2_id, player1_score, player2_score, winner_id) VALUES (?, ?, ?, ?, ?)',
            [player1_id, player2_id, player1_score, player2_score, winner_id]
        );

        res.json({
            id: result.lastID,
            player1_id,
            player2_id,
            player1_score,
            player2_score,
            winner_id,
            message: 'Match recorded successfully'
        });
    } catch (err) {
        next(err);
    }
});

// User statistics
app.get('/api/users/:id/stats', async (req, res, next) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                COUNT(*) as total_matches,
                SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN winner_id != ? THEN 1 ELSE 0 END) as losses
            FROM matches 
            WHERE player1_id = ? OR player2_id = ?
        `;

        const row = await dbGet(query, [id, id, id, id]);

        if (!row) {
            return res.status(404).json({ error: 'No matches found for this user' });
        }

        const winRate = row.total_matches > 0 ? (row.wins / row.total_matches * 100).toFixed(1) : 0;

        res.json({
            total_matches: row.total_matches || 0,
            wins: row.wins || 0,
            losses: row.losses || 0,
            win_rate: winRate
        });
    } catch (err) {
        next(err);
    }
});

// Start server
app.listen(PORT, 'localhost', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});