require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { WebSocketServer } = require('ws');
const Redis = require('ioredis');
const db = require('./db');

// ─── Multer — save uploads to ./uploads ─────────────────────
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Config ──────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set. Define it in backend/.env before starting the server.');
    process.exit(1);
}
const PORT = process.env.PORT || 8000;

const app = express();

// ─── CORS — allow Next.js dev server (port 3000) ────────────
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());

// ==========================================================
//  REDIS — publisher, subscriber, queue, session cache
// ==========================================================
const REDIS_URL = process.env.REDIS_URL;

// Request-path clients fail fast if redis is down (offline queue off).
const reqOpts = { maxRetriesPerRequest: 2, enableOfflineQueue: false };
// The subscriber is a long-lived dedicated connection; allow its SUBSCRIBE
// command to queue until the socket is ready.
const subOpts = { maxRetriesPerRequest: null };
const pub        = REDIS_URL ? new Redis(REDIS_URL, reqOpts) : null;
const subscriber = REDIS_URL ? new Redis(REDIS_URL, subOpts) : null;
const queueClient = REDIS_URL ? new Redis(REDIS_URL, reqOpts) : null;
const sessionClient = REDIS_URL ? new Redis(REDIS_URL, reqOpts) : null;

[['publisher', pub], ['subscriber', subscriber], ['queue', queueClient], ['session', sessionClient]]
    .forEach(([label, client]) => {
        if (!client) return;
        client.on('error', (e) => console.error(`[redis:${label}] ${e.message}`));
        client.on('connect', () => console.log(`[redis:${label}] connected`));
    });

// Publish a realtime payload to a specific user (works cross-process via Redis).
// Special case: userId === '*' means "broadcast to every connected socket".
async function publishRealtime(userId, payload) {
    const envelope = JSON.stringify({ userId: String(userId), payload });
    if (pub) {
        try {
            await pub.publish('realtime', envelope);
            return;
        } catch (e) {
            console.error('[publishRealtime] redis publish failed, falling back to local:', e.message);
        }
    }
    // Local fallback so single-process behaviour still works without redis.
    if (String(userId) === '*') broadcastAll(payload);
    else broadcastToUser(userId, payload);
}

// Publish a realtime payload to EVERY connected socket (global data changes:
// dashboards, public transparency page, budgets). Cross-process via Redis.
async function publishRealtimeAll(payload) {
    return publishRealtime('*', payload);
}

// ==========================================================
//  WEBSOCKET — Map<userIdString, Set<ws>>
//
//  WS message `type` values currently emitted to clients:
//    - COMPLAINT_UPDATE    : a complaint's status changed (per-user)
//    - NOTIFICATION        : a new notification for the user (per-user)
//    - ASSIGNMENT          : a worker was assigned to a complaint (per-user)
//    - ROAD_UPDATE         : a road record changed (broadcast to all)
//    - TRANSPARENCY_UPDATE : transparency/budget dashboards should refresh
//                            (broadcast to all — roads & project budgets)
// ==========================================================
const clients = new Map();

function broadcastToUser(userId, payload) {
    const set = clients.get(String(userId));
    if (!set) return;
    const data = JSON.stringify(payload);
    for (const ws of set) {
        if (ws.readyState === ws.OPEN) {
            try { ws.send(data); } catch (e) { /* ignore individual send errors */ }
        }
    }
}

// Send a payload to EVERY open socket across all connected users.
function broadcastAll(payload) {
    const data = JSON.stringify(payload);
    for (const set of clients.values()) {
        for (const ws of set) {
            if (ws.readyState === ws.OPEN) {
                try { ws.send(data); } catch (e) { /* ignore individual send errors */ }
            }
        }
    }
}

// Subscriber wires Redis 'realtime' channel -> local websocket fan-out.
if (subscriber) {
    subscriber.subscribe('realtime', (err) => {
        if (err) console.error('[redis:subscriber] subscribe failed:', err.message);
        else console.log('[redis:subscriber] subscribed to "realtime"');
    });
    subscriber.on('message', (channel, message) => {
        if (channel !== 'realtime') return;
        try {
            const { userId, payload } = JSON.parse(message);
            if (String(userId) === '*') broadcastAll(payload);
            else broadcastToUser(userId, payload);
        } catch (e) {
            console.error('[redis:subscriber] bad message:', e.message);
        }
    });
}

// ==========================================================
//  HELPERS — mappers / stringify ids per contract
// ==========================================================
const str = (v) => (v === null || v === undefined ? null : String(v));
const bool = (v) => v === true || v === 1 || v === '1' || v === 't' || v === 'true';
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : v);

function mapCivilian(u) {
    if (!u) return null;
    return {
        id: str(u.id),
        full_name: u.name,
        phone: u.phone,
        aadhaar_hash: u.aadhaar_hash,
        district: u.district,
        city: u.city,
        pincode: u.pincode,
        points_total: u.points ?? 0,
        points_redeemed: u.points_redeemed ?? 0,
        level: u.level,
        streak_days: u.streak_days ?? 0,
        last_report_date: u.last_report_date,
        created_at: u.created_at,
        badges: arr(u.badges)
    };
}

function mapStaff(u) {
    if (!u) return null;
    return {
        id: str(u.id),
        name: u.name,
        role: u.role,
        district: u.district,
        created_at: u.created_at,
        department: u.department,
        jurisdiction_road_types: arr(u.jurisdiction_road_types)
    };
}

function mapUser(u) {
    if (!u) return null;
    return u.role === 'civilian' ? mapCivilian(u) : mapStaff(u);
}

function mapWorker(w) {
    if (!w) return null;
    return {
        id: str(w.id),
        name: w.name,
        phone: w.phone,
        skill_tags: arr(w.skill_tags),
        district: w.district,
        availability: w.availability,
        rating: w.rating,
        is_civilian_worker: bool(w.is_civilian_worker),
        created_at: w.created_at
    };
}

function mapComplaint(c) {
    if (!c) return null;
    return {
        id: str(c.id),
        civilian_id: str(c.civilian_id),
        title: c.title,
        type: c.type,
        description: c.description,
        photo_url: c.photo_url,
        photo_metadata: c.photo_metadata ?? null,
        lat: c.lat,
        lng: c.lng,
        address: c.address,
        district: c.district,
        severity: c.severity,
        ai_classification: c.ai_classification ?? null,
        status: c.status,
        points_awarded: c.points_awarded ?? 0,
        worker_id: str(c.worker_id),
        budget_estimated: c.budget_estimated,
        budget_actual: c.budget_actual,
        created_at: c.created_at,
        updated_at: c.updated_at,
        road_id: str(c.road_id),
        road_type: c.road_type,
        assigned_authority_id: str(c.assigned_authority_id),
        proof_image_url: c.proof_image_url,
        resolution_notes: c.resolution_notes,
        resolved_at: c.resolved_at
    };
}

function mapReward(r) {
    if (!r) return null;
    return {
        id: str(r.id),
        name: r.name,
        icon: r.icon,
        points_cost: r.points_cost,
        category: r.category,
        stock: r.stock,
        active: bool(r.active)
    };
}

function mapRedemption(r) {
    if (!r) return null;
    return {
        id: str(r.id),
        civilian_id: str(r.civilian_id),
        item_name: r.item_name,
        points_cost: r.points_cost,
        status: r.status,
        redeemed_at: r.redeemed_at
    };
}

function mapProject(p) {
    if (!p) return null;
    return {
        id: str(p.id),
        complaint_ids: arr(p.complaint_ids).map(String),
        title: p.title,
        district: p.district,
        budget_total: p.budget_total,
        budget_spent: p.budget_spent,
        status: p.status,
        worker_ids: arr(p.worker_ids).map(String),
        start_date: p.start_date,
        end_date: p.end_date
    };
}

function mapNotification(n) {
    if (!n) return null;
    return {
        id: str(n.id),
        title: n.title,
        message: n.message ?? n.body ?? null,
        type: n.type,
        complaint_id: str(n.complaint_id),
        read: bool(n.read),
        created_at: n.created_at
    };
}

function mapRoad(r) {
    if (!r) return null;
    return {
        id: str(r.id),
        name: r.name,
        type: r.type,
        jurisdiction_dept: r.jurisdiction_dept,
        contractor_name: r.contractor_name,
        contractor_contact: r.contractor_contact,
        budget_sanctioned: r.budget_sanctioned,
        budget_spent: r.budget_spent,
        last_relayed_date: r.last_relayed_date,
        maintenance_history: arr(r.maintenance_history),
        created_at: r.created_at
    };
}

// ─── Health checks ───────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Saalai Kural Express API is running' });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'express' });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── Auth middleware (with redis session cache) ──────────────
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Invalid token format' });

    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return res.status(403).json({ error: 'Failed to authenticate token' });
    }

    // Redis session cache — never break auth if redis is down.
    try {
        if (sessionClient) {
            const key = `session:${decoded.userId}`;
            const cached = await sessionClient.get(key);
            if (cached) {
                decoded = JSON.parse(cached);
            } else {
                await sessionClient.set(key, JSON.stringify(decoded), 'EX', 3600);
            }
        }
    } catch (e) {
        // fall back to plain jwt verify result
    }

    // Normalise: keep `id` available for handlers; userId is the canonical String.
    req.user = decoded;
    req.user.id = decoded.userId ?? decoded.id;
    next();
};

// ==========================================================
//  AUTHENTICATION ROUTES
// ==========================================================

// Citizen Registration
app.post('/api/auth/citizen/register', async (req, res) => {
    try {
        const { phone, password, fullName, district, city, pincode } = req.body;

        if (!phone || !password || !fullName || !district || !city || !pincode) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const existing = await db('users').where({ phone }).first();
        if (existing) {
            return res.status(400).json({ error: 'Phone number already registered.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [inserted] = await db('users')
            .insert({
                role: 'civilian',
                name: fullName,
                phone,
                password: hashedPassword,
                district,
                city,
                pincode,
                points: 100
            })
            .returning('*');

        const userId = String(inserted.id);
        const token = jwt.sign({ userId, role: 'civilian', phone }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            message: 'Registration successful',
            token,
            user: { id: userId, name: fullName, role: 'civilian', district, points: 100 }
        });
    } catch (err) {
        console.error('Register error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// Citizen Login (phone-based)
app.post('/api/auth/citizen/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        if (!phone || !password) {
            return res.status(400).json({ error: 'Phone and password are required.' });
        }

        const user = await db('users').where({ phone, role: 'civilian' }).first();
        if (!user) return res.status(404).json({ error: 'User not found. Please register first.' });

        const isMatch = await bcrypt.compare(password, user.password || '');
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' });

        const userId = String(user.id);
        const token = jwt.sign({ userId, role: user.role, phone: user.phone }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: userId,
                name: user.name,
                role: user.role,
                district: user.district,
                points: user.points
            }
        });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin / Authority Login (email-based — authenticates BOTH admin and authority)
app.post('/api/auth/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const user = await db('users')
            .where({ email })
            .whereIn('role', ['admin', 'authority'])
            .first();
        if (!user) return res.status(404).json({ error: 'Account not found.' });

        const isMatch = await bcrypt.compare(password, user.password || '');
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' });

        const userId = String(user.id);
        const token = jwt.sign({ userId, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '1d' });

        res.json({
            message: 'Login successful',
            token,
            user: { id: userId, name: user.name, role: user.role, district: user.district }
        });
    } catch (err) {
        console.error('Admin login error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get current user profile
app.get('/api/users/me', verifyToken, async (req, res) => {
    try {
        const user = await db('users').where({ id: req.user.id }).first();
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user: mapUser(user) });
    } catch (err) {
        console.error('users/me error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// List users (optional ?role=)
app.get('/api/users', verifyToken, async (req, res) => {
    try {
        const q = db('users');
        if (req.query.role) q.where({ role: req.query.role });
        const rows = await q.orderBy('created_at', 'desc');
        res.json({ users: rows.map(mapUser) });
    } catch (err) {
        console.error('users list error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get a single user by id
app.get('/api/users/:id', verifyToken, async (req, res) => {
    try {
        const user = await db('users').where({ id: req.params.id }).first();
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user: mapUser(user) });
    } catch (err) {
        console.error('user get error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Update a user by id (self OR admin) — used for point awards, profile edits, streaks.
// Maps frontend field names to the `users` table columns; only provided fields are updated.
app.patch('/api/users/:id', verifyToken, async (req, res) => {
    try {
        // Authorization: the user may edit their own record, or an admin may edit anyone.
        if (String(req.user.id) !== String(req.params.id) && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const b = req.body || {};
        const patch = {};

        // points: accept both `points_total` and `points` (frontend uses points_total).
        if (b.points_total !== undefined) patch.points = b.points_total;
        if (b.points !== undefined) patch.points = b.points;

        if (b.points_redeemed !== undefined) patch.points_redeemed = b.points_redeemed;
        if (b.level !== undefined) patch.level = b.level;
        if (b.streak_days !== undefined) patch.streak_days = b.streak_days;
        if (b.last_report_date !== undefined) patch.last_report_date = b.last_report_date;
        if (b.badges !== undefined) patch.badges = arr(b.badges);

        // name: accept both `full_name` and `name`.
        if (b.full_name !== undefined) patch.name = b.full_name;
        if (b.name !== undefined) patch.name = b.name;

        if (b.district !== undefined) patch.district = b.district;
        if (b.city !== undefined) patch.city = b.city;
        if (b.pincode !== undefined) patch.pincode = b.pincode;

        if (Object.keys(patch).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const [row] = await db('users').where({ id: req.params.id }).update(patch).returning('*');
        if (!row) return res.status(404).json({ error: 'User not found' });

        res.json({ user: mapUser(row) });
    } catch (err) {
        console.error('user patch error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================================
//  COMPLAINTS ROUTES
// ==========================================================

app.get('/api/complaints', async (req, res) => {
    try {
        const rows = await db('complaints').orderBy('created_at', 'desc');
        res.json({ complaints: rows.map(mapComplaint) });
    } catch (err) {
        console.error('complaints list error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/complaints', verifyToken, async (req, res) => {
    try {
        const { title, type, description, photo_url, photo_metadata, lat, lng, address, district, severity, ai_classification, road_id } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });

        // If a road is given, derive road_type from it.
        let roadType = null;
        if (road_id) {
            const road = await db('roads').where({ id: road_id }).first();
            if (road) roadType = road.type;
        }

        const [inserted] = await db('complaints')
            .insert({
                civilian_id: req.user.id,
                title,
                type: type || 'general',
                description: description || '',
                photo_url: photo_url || '',
                photo_metadata: photo_metadata ?? null,
                lat: lat ?? null,
                lng: lng ?? null,
                address: address || '',
                district: district || '',
                severity: severity || 'medium',
                ai_classification: ai_classification ?? null,
                status: 'pending',
                points_awarded: 10,
                road_id: road_id ?? null,
                road_type: roadType,
                assigned_authority_id: null
            })
            .returning('*');

        // Award points to the reporter.
        await db('users').where({ id: req.user.id }).increment('points', 10);

        // Decoupled smart routing — push id onto the redis queue and return immediately.
        if (queueClient) {
            try {
                await queueClient.lpush('complaint_queue', String(inserted.id));
            } catch (e) {
                console.error('[complaints] failed to enqueue for routing:', e.message);
            }
        }

        res.status(201).json({ message: 'Complaint created', complaint: mapComplaint(inserted) });
    } catch (err) {
        console.error('Create complaint error:', err.message);
        res.status(500).json({ error: 'Failed to create complaint' });
    }
});

app.get('/api/complaints/nearby', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        const radius = parseFloat(req.query.radius) || 5; // km
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return res.status(400).json({ error: 'lat and lng query params are required' });
        }

        // Haversine distance in km (no external package).
        function haversine(la1, lo1, la2, lo2) {
            const R = 6371;
            const toRad = (d) => (d * Math.PI) / 180;
            const dLat = toRad(la2 - la1);
            const dLon = toRad(lo2 - lo1);
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLon / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        const rows = await db('complaints').whereNotNull('lat').whereNotNull('lng');
        const near = rows
            .filter((c) => haversine(lat, lng, c.lat, c.lng) <= radius)
            .map((c) => ({
                id: str(c.id),
                lat: c.lat,
                lng: c.lng,
                status: c.status,
                severity: c.severity,
                road_type: c.road_type,
                created_at: c.created_at
            }));

        res.json({ complaints: near });
    } catch (err) {
        console.error('nearby error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/complaints/:id', async (req, res) => {
    try {
        const row = await db('complaints').where({ id: req.params.id }).first();
        if (!row) return res.status(404).json({ error: 'Complaint not found' });
        res.json({ complaint: mapComplaint(row) });
    } catch (err) {
        console.error('complaint get error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.patch('/api/complaints/:id', verifyToken, async (req, res) => {
    try {
        const { status, worker_id, budget_estimated, budget_actual } = req.body;
        const patch = {};
        if (status) patch.status = status;
        if (worker_id) patch.worker_id = worker_id;
        if (budget_estimated !== undefined) patch.budget_estimated = budget_estimated;
        if (budget_actual !== undefined) patch.budget_actual = budget_actual;

        if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No fields to update' });
        patch.updated_at = db.fn.now();

        const [row] = await db('complaints').where({ id: req.params.id }).update(patch).returning('*');
        if (!row) return res.status(404).json({ error: 'Complaint not found' });

        if (status && row.civilian_id) {
            await publishRealtime(row.civilian_id, { type: 'COMPLAINT_UPDATE', complaintId: str(row.id), status: row.status });
        }

        res.json({ message: 'Complaint updated', complaint: mapComplaint(row) });
    } catch (err) {
        console.error('complaint patch error:', err.message);
        res.status(500).json({ error: 'Failed to update complaint' });
    }
});

// Complaint timeline
app.get('/api/complaints/:id/timeline', async (req, res) => {
    try {
        const c = await db('complaints').where({ id: req.params.id }).first();
        if (!c) return res.status(404).json({ error: 'Complaint not found' });

        const notes = await db('notifications')
            .where({ complaint_id: req.params.id })
            .orderBy('created_at', 'asc');

        const steps = [];
        steps.push({ step: 'Reported', status: 'pending', timestamp: c.created_at, notes: c.title });

        for (const n of notes) {
            steps.push({
                step: n.type || 'update',
                status: c.status,
                timestamp: n.created_at,
                notes: n.message || n.body || n.title || ''
            });
        }

        if (c.updated_at && c.updated_at !== c.created_at) {
            steps.push({ step: 'Updated', status: c.status, timestamp: c.updated_at, notes: '' });
        }
        if (c.resolved_at) {
            steps.push({ step: 'Resolved', status: 'resolved', timestamp: c.resolved_at, notes: c.resolution_notes || '' });
        }

        steps.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        res.json({ timeline: steps });
    } catch (err) {
        console.error('timeline error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Resolve a complaint (AUTHORITY only) — optional proof_image
app.post('/api/complaints/:id/resolve', verifyToken, upload.single('proof_image'), async (req, res) => {
    try {
        if (req.user.role !== 'authority') {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(403).json({ error: 'Only authorities can resolve complaints' });
        }

        const { resolution_notes } = req.body;
        const proofUrl = req.file ? `/uploads/${req.file.filename}` : null;

        const patch = {
            status: 'resolved',
            resolved_at: db.fn.now(),
            resolution_notes: resolution_notes || null,
            updated_at: db.fn.now()
        };
        if (proofUrl) patch.proof_image_url = proofUrl;

        const [row] = await db('complaints').where({ id: req.params.id }).update(patch).returning('*');
        if (!row) return res.status(404).json({ error: 'Complaint not found' });

        let notification = null;
        if (row.civilian_id) {
            const [n] = await db('notifications')
                .insert({
                    user_id: row.civilian_id,
                    complaint_id: row.id,
                    type: 'complaint_resolved',
                    title: 'Complaint resolved',
                    message: `Your complaint "${row.title}" has been resolved.`,
                    read: false
                })
                .returning('*');
            notification = mapNotification(n);

            await publishRealtime(row.civilian_id, { type: 'COMPLAINT_UPDATE', complaintId: str(row.id), status: 'resolved' });
            await publishRealtime(row.civilian_id, { type: 'NOTIFICATION', notification });
        }

        res.json({ message: 'Complaint resolved', complaint: mapComplaint(row) });
    } catch (err) {
        console.error('resolve error:', err.message);
        res.status(500).json({ error: 'Failed to resolve complaint' });
    }
});

// Assign a complaint to a worker (ADMIN only)
app.post('/api/complaints/:id/assign', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can assign complaints' });

        const { worker_id } = req.body;
        if (!worker_id) return res.status(400).json({ error: 'worker_id is required' });

        const worker = await db('workers').where({ id: worker_id }).first();
        if (!worker) return res.status(404).json({ error: 'Worker not found' });

        const [row] = await db('complaints')
            .where({ id: req.params.id })
            .update({ worker_id, status: 'assigned', updated_at: db.fn.now() })
            .returning('*');
        if (!row) return res.status(404).json({ error: 'Complaint not found' });

        // Notify the worker (only if mapped to a user account by matching phone).
        let workerUser = null;
        if (worker.phone) {
            workerUser = await db('users').where({ phone: worker.phone, role: 'worker' }).first();
        }
        if (workerUser) {
            const [wn] = await db('notifications')
                .insert({
                    user_id: workerUser.id,
                    complaint_id: row.id,
                    type: 'assignment',
                    title: 'New assignment',
                    message: `You have been assigned to "${row.title}".`,
                    read: false
                })
                .returning('*');
            await publishRealtime(workerUser.id, { type: 'ASSIGNMENT', complaint: mapComplaint(row), worker: mapWorker(worker) });
            await publishRealtime(workerUser.id, { type: 'NOTIFICATION', notification: mapNotification(wn) });
        }

        // Notify the civilian.
        if (row.civilian_id) {
            const [cn] = await db('notifications')
                .insert({
                    user_id: row.civilian_id,
                    complaint_id: row.id,
                    type: 'complaint_assigned',
                    title: 'Complaint assigned',
                    message: `Your complaint "${row.title}" has been assigned to a worker.`,
                    read: false
                })
                .returning('*');
            await publishRealtime(row.civilian_id, { type: 'COMPLAINT_UPDATE', complaintId: str(row.id), status: 'assigned' });
            await publishRealtime(row.civilian_id, { type: 'NOTIFICATION', notification: mapNotification(cn) });
        }

        res.json({ message: 'Complaint assigned', complaint: mapComplaint(row), worker: mapWorker(worker) });
    } catch (err) {
        console.error('assign error:', err.message);
        res.status(500).json({ error: 'Failed to assign complaint' });
    }
});

// Feedback on a resolved complaint (CIVILIAN, own complaint only)
app.post('/api/complaints/:id/feedback', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'civilian') return res.status(403).json({ error: 'Only civilians can leave feedback' });

        const { rating, comment } = req.body;
        const c = await db('complaints').where({ id: req.params.id }).first();
        if (!c) return res.status(404).json({ error: 'Complaint not found' });
        if (String(c.civilian_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'You can only review your own complaints' });
        }
        if (c.status !== 'resolved') {
            return res.status(400).json({ error: 'Complaint must be resolved before feedback' });
        }

        const [row] = await db('feedback')
            .insert({
                complaint_id: c.id,
                citizen_id: req.user.id,
                rating: rating ?? null,
                comment: comment || null
            })
            .returning('*');

        res.status(201).json({
            message: 'Feedback submitted',
            feedback: {
                id: str(row.id),
                complaint_id: str(row.complaint_id),
                citizen_id: str(row.citizen_id),
                rating: row.rating,
                comment: row.comment,
                created_at: row.created_at
            }
        });
    } catch (err) {
        console.error('feedback error:', err.message);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

// ==========================================================
//  WORKERS ROUTES
// ==========================================================

app.get('/api/workers', async (req, res) => {
    try {
        const rows = await db('workers').orderBy('created_at', 'desc');
        res.json({ workers: rows.map(mapWorker) });
    } catch (err) {
        console.error('workers list error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/workers', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can add workers' });

        const { name, phone, skill_tags, district, availability, is_civilian_worker } = req.body;
        if (!name) return res.status(400).json({ error: 'Worker name is required' });

        const [row] = await db('workers')
            .insert({
                name,
                phone: phone || '',
                skill_tags: arr(skill_tags),
                district: district || '',
                availability: availability || 'available',
                is_civilian_worker: !!is_civilian_worker
            })
            .returning('*');

        res.status(201).json({ message: 'Worker added', worker: mapWorker(row) });
    } catch (err) {
        console.error('worker add error:', err.message);
        res.status(500).json({ error: 'Failed to add worker' });
    }
});

app.patch('/api/workers/:id', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can update workers' });

        const { availability, rating, skill_tags } = req.body;
        const patch = {};
        if (availability) patch.availability = availability;
        if (rating !== undefined) patch.rating = rating;
        if (skill_tags) patch.skill_tags = arr(skill_tags);

        if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No fields to update' });

        const [row] = await db('workers').where({ id: req.params.id }).update(patch).returning('*');
        if (!row) return res.status(404).json({ error: 'Worker not found' });
        res.json({ message: 'Worker updated', worker: mapWorker(row) });
    } catch (err) {
        console.error('worker patch error:', err.message);
        res.status(500).json({ error: 'Failed to update worker' });
    }
});

// ==========================================================
//  ROADS ROUTES
// ==========================================================

app.get('/api/roads', async (req, res) => {
    try {
        const rows = await db('roads').orderBy('created_at', 'desc');
        res.json({ roads: rows.map(mapRoad) });
    } catch (err) {
        console.error('roads list error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/roads/:id', async (req, res) => {
    try {
        const row = await db('roads').where({ id: req.params.id }).first();
        if (!row) return res.status(404).json({ error: 'Road not found' });
        res.json({ road: mapRoad(row) });
    } catch (err) {
        console.error('road get error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Allowed road fields for edits / ingestion (never fabricate — only persist what's posted).
const ROAD_FIELDS = [
    'name', 'type', 'jurisdiction_dept', 'contractor_name', 'contractor_contact',
    'budget_sanctioned', 'budget_spent', 'last_relayed_date', 'maintenance_history'
];

// Build a patch object containing only the provided allowed fields.
function pickRoadFields(body) {
    const patch = {};
    for (const f of ROAD_FIELDS) {
        if (body[f] !== undefined) {
            patch[f] = f === 'maintenance_history' ? arr(body[f]) : body[f];
        }
    }
    return patch;
}

// Update a road (ADMIN or AUTHORITY) — broadcasts ROAD_UPDATE + TRANSPARENCY_UPDATE.
app.patch('/api/roads/:id', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'authority') {
            return res.status(403).json({ error: 'Only admins or authorities can update roads' });
        }

        const patch = pickRoadFields(req.body);
        if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No fields to update' });

        const [row] = await db('roads').where({ id: req.params.id }).update(patch).returning('*');
        if (!row) return res.status(404).json({ error: 'Road not found' });

        const road = mapRoad(row);
        await publishRealtimeAll({ type: 'ROAD_UPDATE', road });
        await publishRealtimeAll({ type: 'TRANSPARENCY_UPDATE' });

        res.json({ message: 'Road updated', road });
    } catch (err) {
        console.error('road patch error:', err.message);
        res.status(500).json({ error: 'Failed to update road' });
    }
});

// Scheduled ingestion (n8n) — UPSERT roads by unique `name`.
// Auth: valid admin JWT OR x-ingest-token header matching process.env.INGEST_TOKEN.
app.post('/api/roads/ingest', async (req, res) => {
    try {
        // ── Authorise: ingest token OR admin JWT ──
        let authorised = false;

        const ingestToken = req.headers['x-ingest-token'];
        if (ingestToken && process.env.INGEST_TOKEN && ingestToken === process.env.INGEST_TOKEN) {
            authorised = true;
        }

        if (!authorised) {
            const authHeader = req.headers.authorization;
            const token = authHeader ? authHeader.split(' ')[1] : null;
            if (token) {
                try {
                    const decoded = jwt.verify(token, JWT_SECRET);
                    if (decoded.role === 'admin') authorised = true;
                } catch (e) { /* invalid token — leave unauthorised */ }
            }
        }

        if (!authorised) return res.status(401).json({ error: 'Unauthorized' });

        const { roads } = req.body;
        if (!Array.isArray(roads) || roads.length === 0) {
            return res.status(400).json({ error: 'roads must be a non-empty array' });
        }

        let inserted = 0;
        let updated = 0;

        for (const r of roads) {
            if (!r || r.name === undefined || r.name === null || String(r.name).trim() === '') {
                continue; // skip rows without a unique key — never fabricate a name
            }

            const fields = pickRoadFields(r);
            const existing = await db('roads').where({ name: r.name }).first();

            if (existing) {
                // Only update the provided fields (never overwrite with fabricated values).
                const updatePatch = { ...fields };
                delete updatePatch.name; // name is the matching key; leave as-is
                if (Object.keys(updatePatch).length > 0) {
                    await db('roads').where({ id: existing.id }).update(updatePatch);
                }
                updated += 1;
            } else {
                await db('roads').insert(fields);
                inserted += 1;
            }
        }

        const upserted = inserted + updated;

        await publishRealtimeAll({ type: 'TRANSPARENCY_UPDATE' });

        res.json({ upserted, inserted, updated });
    } catch (err) {
        console.error('road ingest error:', err.message);
        res.status(500).json({ error: 'Failed to ingest roads' });
    }
});

// ==========================================================
//  PROJECTS ROUTES
// ==========================================================

app.get('/api/projects', async (req, res) => {
    try {
        const rows = await db('projects').orderBy('created_at', 'desc');
        res.json({ projects: rows.map(mapProject) });
    } catch (err) {
        console.error('projects list error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/projects', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can create projects' });

        const { title, complaint_ids, district, budget_total, worker_ids, start_date, end_date } = req.body;
        if (!title) return res.status(400).json({ error: 'Project title is required' });

        const [row] = await db('projects')
            .insert({
                title,
                complaint_ids: arr(complaint_ids),
                district: district || '',
                budget_total: budget_total || 0,
                worker_ids: arr(worker_ids),
                start_date: start_date || null,
                end_date: end_date || null
            })
            .returning('*');

        res.status(201).json({ message: 'Project created', project: mapProject(row) });
    } catch (err) {
        console.error('project add error:', err.message);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

app.patch('/api/projects/:id', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can update projects' });

        const { status, budget_spent, worker_ids, end_date } = req.body;
        const patch = {};
        if (status) patch.status = status;
        if (budget_spent !== undefined) patch.budget_spent = budget_spent;
        if (worker_ids) patch.worker_ids = arr(worker_ids);
        if (end_date) patch.end_date = end_date;

        if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No fields to update' });

        const [row] = await db('projects').where({ id: req.params.id }).update(patch).returning('*');
        if (!row) return res.status(404).json({ error: 'Project not found' });

        // Budgets feed the transparency / budget dashboards.
        await publishRealtimeAll({ type: 'TRANSPARENCY_UPDATE' });

        res.json({ message: 'Project updated', project: mapProject(row) });
    } catch (err) {
        console.error('project patch error:', err.message);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// ==========================================================
//  REWARDS ROUTES
// ==========================================================

app.get('/api/rewards', async (req, res) => {
    try {
        const rows = await db('reward_items').where({ active: true });
        res.json({ rewards: rows.map(mapReward) });
    } catch (err) {
        console.error('rewards list error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/rewards', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can add rewards' });

        const { name, icon, points_cost, category, stock } = req.body;
        if (!name || !points_cost) return res.status(400).json({ error: 'Name and points_cost are required' });

        const [row] = await db('reward_items')
            .insert({
                name,
                icon: icon || '🎁',
                points_cost,
                category: category || 'general',
                stock: stock || 10
            })
            .returning('*');

        res.status(201).json({ message: 'Reward added', reward: mapReward(row) });
    } catch (err) {
        console.error('reward add error:', err.message);
        res.status(500).json({ error: 'Failed to add reward' });
    }
});

app.patch('/api/rewards/:id', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can update rewards' });

        const { stock, active, points_cost } = req.body;
        const patch = {};
        if (stock !== undefined) patch.stock = stock;
        if (active !== undefined) patch.active = !!active;
        if (points_cost !== undefined) patch.points_cost = points_cost;

        if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No fields to update' });

        const [row] = await db('reward_items').where({ id: req.params.id }).update(patch).returning('*');
        if (!row) return res.status(404).json({ error: 'Reward not found' });
        res.json({ message: 'Reward updated', reward: mapReward(row) });
    } catch (err) {
        console.error('reward patch error:', err.message);
        res.status(500).json({ error: 'Failed to update reward' });
    }
});

// ==========================================================
//  REDEMPTIONS ROUTES
// ==========================================================

app.get('/api/redemptions', verifyToken, async (req, res) => {
    try {
        const q = db('reward_redemptions').orderBy('redeemed_at', 'desc');
        if (req.user.role !== 'admin') q.where({ civilian_id: req.user.id });
        const rows = await q;
        res.json({ redemptions: rows.map(mapRedemption) });
    } catch (err) {
        console.error('redemptions list error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/redemptions', verifyToken, async (req, res) => {
    try {
        const { item_name, points_cost } = req.body;
        if (!item_name || !points_cost) return res.status(400).json({ error: 'item_name and points_cost are required' });

        const user = await db('users').where({ id: req.user.id }).first();
        if (!user) return res.status(500).json({ error: 'Database error' });
        if ((user.points ?? 0) < points_cost) return res.status(400).json({ error: 'Not enough points' });

        const [row] = await db('reward_redemptions')
            .insert({ civilian_id: req.user.id, item_name, points_cost, status: 'pending' })
            .returning('*');

        await db('users').where({ id: req.user.id })
            .decrement('points', points_cost)
            .increment('points_redeemed', points_cost);

        res.status(201).json({ message: 'Redemption submitted', redemption: mapRedemption(row) });
    } catch (err) {
        console.error('redeem error:', err.message);
        res.status(500).json({ error: 'Failed to redeem' });
    }
});

app.patch('/api/redemptions/:id', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can update redemption status' });

        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status is required' });

        const [row] = await db('reward_redemptions').where({ id: req.params.id }).update({ status }).returning('*');
        if (!row) return res.status(404).json({ error: 'Redemption not found' });
        res.json({ message: 'Redemption updated', redemption: mapRedemption(row) });
    } catch (err) {
        console.error('redemption patch error:', err.message);
        res.status(500).json({ error: 'Failed to update redemption' });
    }
});

// ==========================================================
//  STATS ROUTE — camelCase Stats shape
// ==========================================================

// Public: aggregate, non-PII counts used by the marketing landing (tokenless) and
// the admin dashboard (with token). Mirrors the already-public transparency endpoint.
app.get('/api/stats', async (req, res) => {
    try {
        const [
            totalComplaintsRow,
            resolvedRow,
            inProgressRow,
            pendingRow,
            totalCitizensRow,
            activeWorkersRow,
            districtsRow,
            savingsRow,
            complaintBudgetRow,
            projectBudgetRow
        ] = await Promise.all([
            db('complaints').count('* as c').first(),
            db('complaints').where({ status: 'resolved' }).count('* as c').first(),
            db('complaints').where({ status: 'in_progress' }).count('* as c').first(),
            db('complaints').where({ status: 'pending' }).count('* as c').first(),
            db('users').where({ role: 'civilian' }).count('* as c').first(),
            db('workers').where({ availability: 'available' }).count('* as c').first(),
            db('complaints').countDistinct('district as c').first(),
            db('complaints').where({ status: 'resolved' })
                .select(db.raw('COALESCE(SUM(COALESCE(budget_estimated,0) - COALESCE(budget_actual,0)),0) as savings')).first(),
            db('complaints').select(db.raw('COALESCE(SUM(COALESCE(budget_actual,0)),0) as spent, COALESCE(SUM(COALESCE(budget_estimated,0)),0) as est')).first(),
            db('projects').select(db.raw('COALESCE(SUM(COALESCE(budget_total,0)),0) as total, COALESCE(SUM(COALESCE(budget_spent,0)),0) as spent')).first()
        ]);

        const num = (v) => Number(v) || 0;

        const totalComplaints = num(totalComplaintsRow.c);
        const resolvedComplaints = num(resolvedRow.c);
        const inProgressComplaints = num(inProgressRow.c);
        const pendingComplaints = num(pendingRow.c);
        const totalCitizens = num(totalCitizensRow.c);
        const activeWorkers = num(activeWorkersRow.c);
        const districts = num(districtsRow.c);
        const totalSavings = num(savingsRow.savings);

        const totalBudget = num(projectBudgetRow.total) + num(complaintBudgetRow.est);
        const spentBudget = num(projectBudgetRow.spent) + num(complaintBudgetRow.spent);
        const budgetSavedPercent = totalBudget > 0 ? Math.round((totalSavings / totalBudget) * 100) : 0;

        res.json({
            stats: {
                totalComplaints,
                resolvedComplaints,
                inProgressComplaints,
                pendingComplaints,
                totalCitizens,
                activeWorkers,
                totalBudget,
                spentBudget,
                totalSavings,
                districts,
                reportsFixed: resolvedComplaints,
                budgetSavedPercent
            }
        });
    } catch (err) {
        console.error('stats error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================================
//  TRANSPARENCY DASHBOARD (PUBLIC, no auth)
// ==========================================================

app.get('/api/dashboard/transparency', async (req, res) => {
    try {
        const [roads, complaints] = await Promise.all([
            db('roads').orderBy('created_at', 'desc'),
            db('complaints')
        ]);

        const budgetSanctionedTotal = roads.reduce((s, r) => s + Number(r.budget_sanctioned || 0), 0);
        const budgetSpentTotal = roads.reduce((s, r) => s + Number(r.budget_spent || 0), 0);

        const complaintsByStatus = { pending: 0, in_progress: 0, resolved: 0, rejected: 0 };
        const byRoad = {};
        let resolvedCount = 0;
        let resolutionDaysSum = 0;
        let resolutionDaysCount = 0;

        for (const c of complaints) {
            if (complaintsByStatus[c.status] !== undefined) complaintsByStatus[c.status] += 1;
            if (c.road_id != null) byRoad[c.road_id] = (byRoad[c.road_id] || 0) + 1;
            if (c.status === 'resolved') {
                resolvedCount += 1;
                if (c.resolved_at && c.created_at) {
                    const days = (new Date(c.resolved_at) - new Date(c.created_at)) / (1000 * 60 * 60 * 24);
                    if (days >= 0) { resolutionDaysSum += days; resolutionDaysCount += 1; }
                }
            }
        }

        const roadName = {};
        roads.forEach((r) => { roadName[r.id] = r.name; });
        const topRoadsByComplaints = Object.entries(byRoad)
            .map(([road_id, count]) => ({ road_id: str(road_id), name: roadName[road_id] || null, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const total = complaints.length;
        const resolutionRate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;
        const avgResolutionDays = resolutionDaysCount > 0
            ? Math.round((resolutionDaysSum / resolutionDaysCount) * 10) / 10
            : 0;

        res.json({
            totalRoads: roads.length,
            budgetSanctionedTotal,
            budgetSpentTotal,
            complaintsByStatus,
            topRoadsByComplaints,
            resolutionRate,
            avgResolutionDays,
            roads: roads.map(mapRoad)
        });
    } catch (err) {
        console.error('transparency error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================================
//  NOTIFICATIONS ROUTES
// ==========================================================

app.get('/api/notifications', verifyToken, async (req, res) => {
    try {
        const myId = req.user.id;
        const myRole = req.user.role;
        const rows = await db('notifications')
            .where(function () {
                this.where('user_id', myId)
                    .orWhere('target_id', myId)
                    .orWhere('target_role', myRole)
                    .orWhere('target_role', 'all');
            })
            .orderBy([{ column: 'read', order: 'asc' }, { column: 'created_at', order: 'desc' }]);

        res.json({ notifications: rows.map(mapNotification) });
    } catch (err) {
        console.error('notifications list error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/notifications', verifyToken, async (req, res) => {
    try {
        const { user_id, complaint_id, type, message, target_role, target_id, title, body } = req.body;

        const insert = {
            user_id: user_id ?? null,
            complaint_id: complaint_id ?? null,
            type: type || 'general',
            message: message ?? body ?? null,
            body: body ?? message ?? null,
            title: title ?? null,
            target_role: target_role || (user_id ? null : 'all'),
            target_id: target_id ?? null,
            read: false
        };

        const [row] = await db('notifications').insert(insert).returning('*');

        // Push to the recipient in realtime when addressed to a specific user.
        const recipient = row.user_id ?? row.target_id;
        if (recipient) {
            await publishRealtime(recipient, { type: 'NOTIFICATION', notification: mapNotification(row) });
        }

        res.status(201).json({ message: 'Notification created', notification: mapNotification(row) });
    } catch (err) {
        console.error('notification create error:', err.message);
        res.status(500).json({ error: 'Failed to create notification' });
    }
});

app.patch('/api/notifications/:id/read', verifyToken, async (req, res) => {
    try {
        const [row] = await db('notifications').where({ id: req.params.id }).update({ read: true }).returning('*');
        if (!row) return res.status(404).json({ error: 'Notification not found' });
        res.json({ message: 'Notification marked read', notification: mapNotification(row) });
    } catch (err) {
        console.error('notification read error:', err.message);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

app.patch('/api/notifications/read-all', verifyToken, async (req, res) => {
    try {
        const myId = req.user.id;
        const myRole = req.user.role;
        const count = await db('notifications')
            .where(function () {
                this.where('user_id', myId)
                    .orWhere('target_id', myId)
                    .orWhere('target_role', myRole)
                    .orWhere('target_role', 'all');
            })
            .update({ read: true });
        res.json({ message: 'All notifications marked read', updated: count });
    } catch (err) {
        console.error('notification read-all error:', err.message);
        res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
});

// ==========================================================
//  MULTIPLIER EVENTS
// ==========================================================

app.get('/api/multipliers', verifyToken, async (req, res) => {
    try {
        const rows = await db('multiplier_events').orderBy('created_at', 'desc');
        res.json({
            multipliers: rows.map((m) => ({
                district: m.district,
                multiplier: m.multiplier,
                startDate: m.start_date,
                endDate: m.end_date
            }))
        });
    } catch (err) {
        console.error('multipliers list error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/multipliers', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can create multipliers' });

        const { district, multiplier, startDate, endDate } = req.body;
        if (!district || multiplier === undefined) {
            return res.status(400).json({ error: 'district and multiplier are required' });
        }

        const [row] = await db('multiplier_events')
            .insert({ district, multiplier, start_date: startDate || null, end_date: endDate || null })
            .returning('*');

        res.status(201).json({
            message: 'Multiplier created',
            multiplier: { district: row.district, multiplier: row.multiplier, startDate: row.start_date, endDate: row.end_date }
        });
    } catch (err) {
        console.error('multiplier create error:', err.message);
        res.status(500).json({ error: 'Failed to create multiplier' });
    }
});

// ==========================================================
//  CHATBOT — per-user sessions (n8n proxy + Postgres + Redis)
// ==========================================================
//  Each conversation is tied to the logged-in user. Messages are persisted in
//  Postgres (chat_messages) and the recent window is cached in Redis
//  (key chat:<session_id>). Default session per user is `user-<id>`.

const CHAT_CACHE_TTL = 60 * 60 * 24; // 24h
const CHAT_CACHE_MAX = 50;           // keep the last N turns in the Redis cache

async function cacheChatTurn(sessionId, role, content) {
    if (!sessionClient) return;
    try {
        const key = `chat:${sessionId}`;
        await sessionClient.rpush(key, JSON.stringify({ role, content, ts: Date.now() }));
        await sessionClient.ltrim(key, -CHAT_CACHE_MAX, -1);
        await sessionClient.expire(key, CHAT_CACHE_TTL);
    } catch (e) {
        console.error('chat cache error:', e.message);
    }
}

// Detect the language of a chat message from its script so the bot can reply in
// the SAME language the user wrote in (fixes the "always answers in Tamil" bug).
// Latin script -> English; otherwise match the Indic Unicode block.
function detectChatLanguage(text) {
    const s = String(text || '');
    if (/[஀-௿]/.test(s)) return 'ta';   // Tamil
    if (/[ऀ-ॿ]/.test(s)) return 'hi';   // Devanagari (Hindi)
    if (/[ఀ-౿]/.test(s)) return 'te';   // Telugu
    return 'en';                                   // default: English / Latin
}

app.post('/chatbot', verifyToken, async (req, res) => {
    const userId = req.user.id;
    const message = (req.body && req.body.message) ? String(req.body.message).trim() : '';
    const sessionId = (req.body && req.body.session_id)
        ? String(req.body.session_id)
        : `user-${userId}`;

    if (!message) {
        return res.status(400).json({ success: false, error: 'Message is required' });
    }
    if (!process.env.N8N_WEBHOOK_URL) {
        return res.status(503).json({ success: false, reply: 'Chatbot is not configured.' });
    }

    // 1) persist the user's message (Postgres + Redis)
    try { await db('chat_messages').insert({ user_id: userId, session_id: sessionId, role: 'user', content: message }); }
    catch (e) { console.error('chat persist (user):', e.message); }
    await cacheChatTurn(sessionId, 'user', message);

    // 2) call the n8n webhook — forward the reply language so the bot answers in
    // the user's language. An explicit valid override wins; otherwise auto-detect.
    const reqLang = req.body && req.body.language;
    const language = ['en', 'ta', 'hi', 'te'].includes(reqLang) ? reqLang : detectChatLanguage(message);
    let reply = '', category = null, followUps = [];
    try {
        const response = await fetch(process.env.N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, session_id: sessionId, user_id: String(userId), language })
        });
        if (!response.ok) throw new Error(`n8n webhook responded with status ${response.status}`);
        const data = await response.json().catch(() => ({}));
        reply = data.reply || '';
        category = data.category || null;
        followUps = Array.isArray(data.follow_up_options) ? data.follow_up_options : [];
        if (!reply) throw new Error('empty reply from chatbot');
    } catch (err) {
        console.error('Chatbot Proxy Error:', err.message);
        return res.status(502).json({
            success: false,
            reply: 'Sorry, the chatbot service is currently unavailable. Please try again later.'
        });
    }

    // 3) persist the assistant reply (Postgres + Redis)
    try { await db('chat_messages').insert({ user_id: userId, session_id: sessionId, role: 'assistant', content: reply, category }); }
    catch (e) { console.error('chat persist (bot):', e.message); }
    await cacheChatTurn(sessionId, 'assistant', reply);

    res.json({ success: true, reply, category, follow_up_options: followUps, session_id: sessionId });
});

// Conversation history for the logged-in user (Redis cache first, Postgres fallback).
app.get('/api/chat/history', verifyToken, async (req, res) => {
    const userId = req.user.id;
    const sessionId = req.query.session_id ? String(req.query.session_id) : `user-${userId}`;
    try {
        if (sessionClient) {
            try {
                const cached = await sessionClient.lrange(`chat:${sessionId}`, 0, -1);
                if (cached && cached.length) {
                    const messages = cached
                        .map((s) => { try { return JSON.parse(s); } catch { return null; } })
                        .filter(Boolean)
                        .map((m) => ({ role: m.role, content: m.content }));
                    return res.json({ session_id: sessionId, messages });
                }
            } catch (e) { /* fall through to Postgres */ }
        }
        const rows = await db('chat_messages')
            .where({ user_id: userId, session_id: sessionId })
            .orderBy('created_at', 'asc')
            .limit(200);
        res.json({ session_id: sessionId, messages: rows.map((r) => ({ role: r.role, content: r.content })) });
    } catch (err) {
        console.error('chat history error:', err.message);
        res.status(500).json({ error: 'Failed to load chat history' });
    }
});

// List the logged-in user's past chat sessions (for the "previous chats" menu).
// Each entry is titled by its first user message and ordered most-recent first.
app.get('/api/chat/sessions', verifyToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const aggs = await db('chat_messages')
            .where({ user_id: userId })
            .groupBy('session_id')
            .select('session_id')
            .count('* as message_count')
            .min('created_at as started_at')
            .max('created_at as last_at');

        // First user message per session = a human-friendly title.
        const titleRows = await db('chat_messages')
            .where({ user_id: userId, role: 'user' })
            .orderBy('created_at', 'asc')
            .select('session_id', 'content');
        const titleMap = {};
        for (const r of titleRows) {
            if (!(r.session_id in titleMap)) titleMap[r.session_id] = r.content;
        }

        const sessions = aggs
            .map((a) => ({
                session_id: a.session_id,
                title: (titleMap[a.session_id] || 'New conversation').slice(0, 80),
                message_count: Number(a.message_count),
                started_at: a.started_at,
                last_at: a.last_at,
            }))
            .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());

        res.json({ sessions });
    } catch (err) {
        console.error('chat sessions error:', err.message);
        res.status(500).json({ error: 'Failed to load chat sessions' });
    }
});

// Clear / delete one chat session (Postgres rows + Redis cache). Scoped to the
// caller's user_id so a user can only ever clear their own conversations.
app.delete('/api/chat/session', verifyToken, async (req, res) => {
    const userId = req.user.id;
    const sessionId = req.query.session_id ? String(req.query.session_id) : `user-${userId}`;
    try {
        const deleted = await db('chat_messages').where({ user_id: userId, session_id: sessionId }).del();
        if (sessionClient) {
            try { await sessionClient.del(`chat:${sessionId}`); } catch (e) { /* cache best-effort */ }
        }
        res.json({ success: true, session_id: sessionId, deleted });
    } catch (err) {
        console.error('chat clear error:', err.message);
        res.status(500).json({ error: 'Failed to clear chat' });
    }
});

// ==========================================================
//  ML ANALYZE ROUTE — forwards photo to ml_server.py
// ==========================================================

app.post('/api/analyze', verifyToken, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const ML_SERVER_URL = process.env.ML_SERVER_URL;
    if (!ML_SERVER_URL) {
        fs.unlink(req.file.path, () => {});
        return res.status(503).json({ success: false, error: 'ML server unavailable' });
    }

    const filePath = req.file.path;

    try {
        const boundary = `----FormBoundary${Date.now()}`;
        const fileBuffer = fs.readFileSync(filePath);
        const ext = path.extname(req.file.originalname) || '.jpg';
        const mimeType = req.file.mimetype || 'image/jpeg';

        const prefix = Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="upload${ext}"\r\nContent-Type: ${mimeType}\r\n\r\n`
        );
        const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
        const body   = Buffer.concat([prefix, fileBuffer, suffix]);

        const mlRes = await fetch(`${ML_SERVER_URL}/analyze`, {
            method:  'POST',
            headers: {
                'Content-Type':   `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length
            },
            body
        });

        if (!mlRes.ok) {
            const txt = await mlRes.text();
            throw new Error(`ML server error ${mlRes.status}: ${txt}`);
        }

        const result = await mlRes.json();
        // KEEP the uploaded file on success so it is served by /uploads/<filename>
        // and the complaint can persist/display it as evidence.
        result.photo_url = `/uploads/${req.file.filename}`;
        result.filename  = req.file.filename;

        res.json(result);
    } catch (err) {
        console.error('[/api/analyze] Error:', err.message);
        // Only delete the upload when the ML call FAILS — a successful analysis must persist.
        fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) console.error('[/api/analyze] Failed to delete upload:', unlinkErr.message);
        });
        res.status(503).json({ success: false, error: 'ML server unavailable' });
    }
});

// Serve uploaded files statically
app.use('/uploads', express.static(uploadDir));

// ==========================================================
//  START HTTP + WEBSOCKET SERVER
// ==========================================================

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
    // Authenticate via ?token=JWT
    let userId;
    try {
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token');
        if (!token) { ws.close(1008, 'No token'); return; }
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = String(decoded.userId ?? decoded.id);
    } catch (err) {
        ws.close(1008, 'Invalid token');
        return;
    }

    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);

    ws.send(JSON.stringify({ type: 'CONNECTED', userId }));

    ws.on('close', () => {
        const set = clients.get(userId);
        if (set) {
            set.delete(ws);
            if (set.size === 0) clients.delete(userId);
        }
    });
    ws.on('error', () => {
        const set = clients.get(userId);
        if (set) {
            set.delete(ws);
            if (set.size === 0) clients.delete(userId);
        }
    });
});

httpServer.listen(PORT, () => {
    console.log(`\n  ✅ Saalai Kural server (HTTP + WebSocket) on http://localhost:${PORT}`);
    console.log(`  📡 CORS enabled for: http://localhost:3000`);
    console.log(`  🔐 JWT auth active`);
    console.log(`  🔌 WebSocket on ws://localhost:${PORT}?token=<JWT>`);
    console.log(`  📨 Redis realtime channel: "realtime", queue: "complaint_queue"\n`);
    console.log(`  Waiting for requests...\n`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    try { wss.close(); } catch (e) {}
    try { if (pub) pub.disconnect(); } catch (e) {}
    try { if (subscriber) subscriber.disconnect(); } catch (e) {}
    try { if (queueClient) queueClient.disconnect(); } catch (e) {}
    try { if (sessionClient) sessionClient.disconnect(); } catch (e) {}
    httpServer.close(() => {
        db.destroy().finally(() => process.exit(0));
    });
    // Failsafe
    setTimeout(() => process.exit(0), 3000);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});
