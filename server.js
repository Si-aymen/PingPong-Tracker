const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const util = require('util'); // Still useful for mkdirAsync, existsAsync
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'your_super_secret_key_for_jwt'; // IMPORTANT: Use an environment variable in production!

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

// SQLite Database Setup
let db;

async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database('./pingpong.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, async (err) => {
            if (err) {
                console.error('Error connecting to database:', err.message);
                reject(err);
            } else {
                console.log('Connected to the SQLite database.');
                try {
                    await dbRun(`CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        surname TEXT NOT NULL,
                        username TEXT UNIQUE NOT NULL,
                        password TEXT NOT NULL,
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
                        match_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (player1_id) REFERENCES users(id),
                        FOREIGN KEY (player2_id) REFERENCES users(id),
                        FOREIGN KEY (winner_id) REFERENCES users(id)
                    )`);
                    console.log('Tables created or already exist.');
                    resolve();
                } catch (dbErr) {
                    console.error('Error creating tables:', dbErr.message);
                    reject(dbErr);
                }
            }
        });
    });
}

// --- Corrected Helper functions for database operations ---

// Promisified db.get
const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                return reject(err);
            }
            resolve(row);
        });
    });
};

// Promisified db.all
const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                return reject(err);
            }
            resolve(rows);
        });
    });
};

// Promisified db.run with lastID and changes
const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) { // Use a regular function here to get 'this' context
            if (err) {
                return reject(err);
            }
            // 'this' refers to the statement object, containing lastID and changes
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

// --- END Corrected Helper functions ---


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

// --- API Endpoints (no changes needed here, as they now correctly use the promisified helpers) ---

// User Registration (Public endpoint)
app.post('/api/register', async (req, res, next) => {
    try {
        const { username, password, name, surname } = req.body;

        if (!username || !password || !name || !surname) {
            return res.status(400).json({ error: 'Username, password, name, and surname are required for registration.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10); // Hash the password

        const result = await dbRun(
            'INSERT INTO users (username, password, name, surname) VALUES (?, ?, ?, ?)',
            [username, hashedPassword, name, surname]
        );

        res.status(201).json({
            id: result.lastID,
            username,
            name,
            surname,
            message: 'User registered successfully.'
        });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
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

        const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);

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
        const users = await dbAll('SELECT id, name, surname, photo FROM users');
        res.json(users);
    } catch (err) {
        next(err);
    }
});

app.get('/api/users/:id', authenticateToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = await dbGet('SELECT id, name, surname, photo FROM users WHERE id = ?', [id]);
        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (err) {
        next(err);
    }
});

app.post('/api/users', authenticateToken, upload.single('photo'), async (req, res, next) => {
    try {
        const { name, surname, username, password } = req.body;
        const photo = req.file ? `/uploads/${req.file.filename}` : null;

        if (!name || !surname || !username || !password) {
            return res.status(400).json({ error: 'Name, surname, username, and password are required' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await dbRun(
            'INSERT INTO users (name, surname, username, password, photo) VALUES (?, ?, ?, ?, ?)',
            [name, surname, username, hashedPassword, photo]
        );

        res.status(201).json({
            id: result.lastID,
            name,
            surname,
            username,
            photo,
            message: 'User created successfully'
        });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'Username already exists.' });
        }
        next(err);
    }
});


app.put('/api/users/:id', authenticateToken, upload.single('photo'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, surname, password } = req.body; // Username cannot be changed this way for uniqueness
        const photo = req.file ? `/uploads/${req.file.filename}` : undefined;

        let userToUpdate = await dbGet('SELECT * FROM users WHERE id = ?', [id]);
        if (!userToUpdate) {
            return res.status(404).json({ error: 'User not found' });
        }

        let updateSql = 'UPDATE users SET name = ?, surname = ?';
        const updateParams = [name || userToUpdate.name, surname || userToUpdate.surname];

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateSql += ', password = ?';
            updateParams.push(hashedPassword);
        }
        if (photo !== undefined) {
            updateSql += ', photo = ?';
            updateParams.push(photo);
        }

        updateSql += ' WHERE id = ?';
        updateParams.push(id);

        await dbRun(updateSql, updateParams);

        res.json({ message: 'User updated successfully' });
    } catch (err) {
        next(err);
    }
});


app.delete('/api/users/:id', authenticateToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = await dbGet('SELECT photo FROM users WHERE id = ?', [id]);

        if (user && user.photo) {
            const photoPath = path.join(__dirname, 'public', user.photo);
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }
        }

        await dbRun('DELETE FROM matches WHERE player1_id = ? OR player2_id = ?', [id, id]);
        await dbRun('DELETE FROM users WHERE id = ?', [id]);
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});


app.get('/api/matches', authenticateToken, async (req, res, next) => {
    try {
        const matches = await dbAll(`
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
                pw.name AS winner_name,
                pw.surname AS winner_surname,
                m.match_date
            FROM matches m
            JOIN users p1 ON m.player1_id = p1.id
            JOIN users p2 ON m.player2_id = p2.id
            JOIN users pw ON m.winner_id = pw.id
            ORDER BY m.match_date DESC
        `);
        res.json(matches);
    } catch (err) {
        next(err);
    }
});

app.post('/api/matches', authenticateToken, async (req, res, next) => {
    try {
        const { player1_id, player2_id, player1_score, player2_score } = req.body;

        if (!player1_id || !player2_id || player1_score === undefined || player2_score === undefined) {
            return res.status(400).json({ error: 'All match fields are required.' });
        }

        let winner_id;
        if (player1_score > player2_score) {
            winner_id = player1_id;
        } else if (player2_score > player1_score) {
            winner_id = player2_id;
        } else {
            return res.status(400).json({ error: 'A match cannot be a tie. There must be a winner.' });
        }

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
app.get('/api/users/:id/stats', authenticateToken, async (req, res, next) => {
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
            total_matches: row.total_matches,
            wins: row.wins,
            losses: row.losses,
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
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database and start server:', err);
});