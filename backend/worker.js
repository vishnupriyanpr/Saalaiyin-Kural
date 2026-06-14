require('dotenv').config();

const Redis = require('ioredis');
const db = require('./db');

// ─── Redis clients ───────────────────────────────────────────
// A dedicated BLOCKING client for BRPOP (blocking commands monopolise a
// connection) and a separate publisher client for realtime pushes.
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
    console.error('FATAL: REDIS_URL not set. The smart-routing worker requires Redis.');
    process.exit(1);
}

const blocking = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const pub = new Redis(REDIS_URL, { maxRetriesPerRequest: 2 });

blocking.on('error', (e) => console.error('[worker:blocking]', e.message));
pub.on('error', (e) => console.error('[worker:pub]', e.message));

let running = true;

function log(...args) {
    console.log(`[worker ${new Date().toISOString()}]`, ...args);
}

// Realtime push routed through the same Redis 'realtime' channel that
// server.js subscribes to, so notifications reach the websocket cross-process.
async function publishRealtime(userId, payload) {
    try {
        await pub.publish('realtime', JSON.stringify({ userId: String(userId), payload }));
    } catch (e) {
        console.error('[worker] publishRealtime failed:', e.message);
    }
}

async function routeComplaint(complaintId) {
    const complaint = await db('complaints').where({ id: complaintId }).first();
    if (!complaint) {
        log(`complaint ${complaintId} not found, skipping`);
        return;
    }

    // Determine road_type: prefer the complaint's own road_type, else the road row.
    let roadType = complaint.road_type;
    if (!roadType && complaint.road_id != null) {
        const road = await db('roads').where({ id: complaint.road_id }).first();
        if (road) {
            roadType = road.type;
            // Persist it so downstream consumers have it.
            await db('complaints').where({ id: complaint.id }).update({ road_type: roadType });
        }
    }

    if (!roadType) {
        log(`complaint ${complaintId} has no road_type — unrouted, awaiting admin`);
        return;
    }

    // Find an authority whose jurisdiction covers this road_type.
    const authority = await db('users')
        .where('role', 'authority')
        .whereRaw('jurisdiction_road_types @> ?', [JSON.stringify([roadType])])
        .first();

    if (!authority) {
        log(`complaint ${complaintId} (road_type=${roadType}) — no matching authority — unrouted, awaiting admin`);
        return;
    }

    // Assign + notify.
    await db('complaints').where({ id: complaint.id }).update({ assigned_authority_id: authority.id });

    const [notification] = await db('notifications')
        .insert({
            user_id: authority.id,
            complaint_id: complaint.id,
            type: 'complaint_routed',
            title: 'New complaint routed to you',
            message: `New ${roadType} complaint routed to you: "${complaint.title}"`,
            read: false
        })
        .returning('*');

    const mappedNotification = {
        id: String(notification.id),
        title: notification.title,
        message: notification.message ?? notification.body ?? null,
        type: notification.type,
        complaint_id: String(notification.complaint_id),
        read: false,
        created_at: notification.created_at
    };

    await publishRealtime(authority.id, { type: 'NOTIFICATION', notification: mappedNotification });

    log(`complaint ${complaintId} (road_type=${roadType}) routed to authority ${authority.id} (${authority.name})`);
}

async function loop() {
    log('smart-routing worker started — waiting on "complaint_queue"');
    while (running) {
        try {
            // BRPOP with 2s timeout; returns [queueName, value] or null on timeout.
            const result = await blocking.brpop('complaint_queue', 2);
            if (!result) continue;
            const complaintId = result[1];
            log(`dequeued complaint ${complaintId}`);
            try {
                await routeComplaint(complaintId);
            } catch (e) {
                console.error(`[worker] error routing complaint ${complaintId}:`, e.message);
            }
        } catch (e) {
            if (!running) break;
            console.error('[worker] loop error:', e.message);
            // Brief backoff to avoid a hot error loop if redis is flapping.
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
}

// ─── Graceful shutdown ───────────────────────────────────────
async function shutdown() {
    log('SIGINT received, shutting down...');
    running = false;
    try { blocking.disconnect(); } catch (e) {}
    try { pub.disconnect(); } catch (e) {}
    try { await db.destroy(); } catch (e) {}
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

loop().catch((e) => {
    console.error('[worker] fatal:', e);
    process.exit(1);
});
