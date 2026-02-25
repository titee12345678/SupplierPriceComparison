const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initDatabase } = require('./database');

const authRoutes = require('./routes/auth');
const supplierRoutes = require('./routes/supplier');
const procurementRoutes = require('./routes/procurement');
const adminRoutes = require('./routes/admin');
const purchaseRoutes = require('./routes/purchase');

const app = express();
const PORT = process.env.PORT || 3000;

const crypto = require('crypto');

// Middleware
// Trust proxy (needed behind Nginx/Cloudflare in production)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Security headers
try {
    const helmet = require('helmet');
    app.use(helmet({ contentSecurityPolicy: false }));
} catch (e) {
    console.warn('⚠️  helmet not installed. Run: npm install helmet');
}

app.use(cors({
    origin: true, // อนุญาตทุก origin (ทำงานได้ทั้ง localhost และ production)
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
const SESSION_SECRET = process.env.SESSION_SECRET || 'supplier-price-comparison-default-secret-change-in-production';
if (!process.env.SESSION_SECRET) {
    console.warn('⚠️  SESSION_SECRET not set. Using default secret (set SESSION_SECRET env var for production).');
}

// Persistent session store (dual-mode: PostgreSQL or SQLite)
let sessionStore;
if (process.env.DATABASE_URL) {
    const PgSession = require('connect-pg-simple')(session);
    sessionStore = new PgSession({
        conString: process.env.DATABASE_URL,
        tableName: 'session',
        createTableIfMissing: true
    });
} else {
    const SQLiteStore = require('connect-sqlite3')(session);
    sessionStore = new SQLiteStore({
        db: 'sessions.db',
        dir: path.join(__dirname),
        concurrentDB: true
    });
}
app.use(session({
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limiting (Bug 15 fix)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // max 10 login attempts per IP per window
    message: { error: 'พยายามเข้าสู่ระบบมากเกินไป กรุณาลองใหม่ภายหลัง' },
    standardHeaders: true,
    legacyHeaders: false
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200, // 200 API requests per 15 min per IP
    message: { error: 'Request มากเกินไป กรุณาลองใหม่ภายหลัง' }
});

// API Routes
app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/supplier', supplierRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/purchase', purchaseRoutes);

// SPA fallback - serve frontend for non-API routes
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
    } else {
        // Bug 7/16 fix: Return 404 for unknown API routes instead of hanging
        res.status(404).json({ error: 'API endpoint not found' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    // Bug 9 fix: Don't leak internal error details to the client
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
});

// Initialize database and start server
initDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 Server running at http://localhost:${PORT}`);
            console.log(`📊 API available at http://localhost:${PORT}/api`);
            if (process.env.NODE_ENV !== 'production') {
                console.log('\n📝 Default users:');
                console.log('   Admin:    admin_master / Tiger79Moon');
                console.log('   Buyer:    buyer_ops / River48Star');
                console.log('   Supplier: supplier_primary / Stone63Sky');
            }
        });
    })
    .catch(err => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });
