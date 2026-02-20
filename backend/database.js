const path = require('path');
const bcrypt = require('bcrypt');

// Detect mode: PostgreSQL (DATABASE_URL) or SQLite
const DATABASE_URL = process.env.DATABASE_URL;
const isPG = !!DATABASE_URL;

let db, pool;

if (isPG) {
    // PostgreSQL mode
    const { Pool } = require('pg');
    pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    console.log('📦 Using PostgreSQL database');
} else {
    // SQLite mode (local development)
    const sqlite3 = require('sqlite3').verbose();
    const DB_PATH = path.join(__dirname, 'database.db');
    db = new sqlite3.Database(DB_PATH);
    db.run('PRAGMA foreign_keys = ON');
    console.log('📦 Using SQLite database');
}

// Export flag for route files to use SQL dialect helpers
module.exports.isPG = isPG;

// ===== Query helpers =====

// Convert ? placeholders to $1, $2, ... for PostgreSQL
function convertPlaceholders(sql) {
    if (!isPG) return sql;
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
}

// PostgreSQL doesn't accept '' for DATE/INTEGER columns — convert to null
// Also cast numeric string params for LIMIT/OFFSET to integers
function sanitizeParams(params) {
    if (!isPG) return params;
    return params.map(p => (p === '' ? null : p));
}

// Run INSERT/UPDATE/DELETE query
const runQuery = (sql, params = []) => {
    const convertedSQL = convertPlaceholders(sql);
    const safeParams = sanitizeParams(params);
    if (isPG) {
        // For INSERT, add RETURNING id to get lastID
        const isInsert = /^\s*INSERT/i.test(convertedSQL);
        const finalSQL = isInsert && !/RETURNING/i.test(convertedSQL)
            ? convertedSQL + ' RETURNING id'
            : convertedSQL;
        return pool.query(finalSQL, safeParams).then(result => ({
            lastID: result.rows && result.rows[0] ? result.rows[0].id : null,
            changes: result.rowCount
        })).catch(err => {
            console.error('PG runQuery error:', err.message, '\nSQL:', finalSQL.substring(0, 200));
            throw err;
        });
    }
    return new Promise((resolve, reject) => {
        db.run(convertedSQL, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

// Get one row
const getOne = (sql, params = []) => {
    const convertedSQL = convertPlaceholders(sql);
    const safeParams = sanitizeParams(params);
    if (isPG) {
        return pool.query(convertedSQL, safeParams).then(result => result.rows[0] || null);
    }
    return new Promise((resolve, reject) => {
        db.get(convertedSQL, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

// Get all rows
const getAll = (sql, params = []) => {
    const convertedSQL = convertPlaceholders(sql);
    const safeParams = sanitizeParams(params);
    if (isPG) {
        return pool.query(convertedSQL, safeParams).then(result => result.rows);
    }
    return new Promise((resolve, reject) => {
        db.all(convertedSQL, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

// ===== SQL Dialect Helpers =====
// Route files use these to write cross-compatible SQL
const SQL = {
    // strftime('%Y-%m', col) → to_char(col::date, 'YYYY-MM')
    yearMonth: (col) => isPG
        ? `to_char(${col}::date, 'YYYY-MM')`
        : `strftime('%Y-%m', ${col})`,

    // date('now', '-12 months') → CURRENT_DATE - INTERVAL '12 months'
    dateAgo: (n, unit) => isPG
        ? `CURRENT_DATE - INTERVAL '${n} ${unit}'`
        : `date('now', '-${n} ${unit}')`,

    // AUTOINCREMENT → SERIAL (handled in CREATE TABLE)
    autoId: () => isPG
        ? 'SERIAL PRIMARY KEY'
        : 'INTEGER PRIMARY KEY AUTOINCREMENT',

    // LIMIT ? OFFSET ? — same syntax in both, but PG needs ::int cast sometimes
    // Actually both support LIMIT/OFFSET with ? params, so no conversion needed
};

module.exports.SQL = SQL;

// ===== Create Tables =====
const initDatabase = async () => {
    if (isPG) {
        // Create ROUND overload for double precision (SQLite compatibility)
        await pool.query(`
            CREATE OR REPLACE FUNCTION round(double precision, integer)
            RETURNS numeric AS $$ SELECT round($1::numeric, $2); $$ LANGUAGE SQL IMMUTABLE;
        `);

        // PostgreSQL: create tables
        await pool.query(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id SERIAL PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                address TEXT,
                contact_person TEXT,
                tel TEXT,
                email TEXT,
                tax_id TEXT,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                email TEXT,
                role TEXT NOT NULL CHECK(role IN ('admin', 'buyer', 'supplier')),
                supplier_id INTEGER REFERENCES suppliers(id),
                status TEXT DEFAULT 'active',
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS product_groups (
                id SERIAL PRIMARY KEY,
                master_code TEXT UNIQUE NOT NULL,
                master_name TEXT NOT NULL,
                category_id INTEGER REFERENCES categories(id),
                unit TEXT,
                image_path TEXT,
                specification TEXT,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by INTEGER REFERENCES users(id)
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
                product_code TEXT NOT NULL,
                product_name TEXT NOT NULL,
                price REAL,
                unit TEXT,
                effective_date DATE,
                remark TEXT,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(supplier_id, product_code)
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS product_mapping (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id),
                product_group_id INTEGER NOT NULL REFERENCES product_groups(id),
                mapped_by INTEGER REFERENCES users(id),
                mapped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(product_id)
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS price_history (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id),
                price REAL NOT NULL,
                effective_date DATE NOT NULL,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                source TEXT DEFAULT 'manual'
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS import_logs (
                id SERIAL PRIMARY KEY,
                supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                filename TEXT,
                total_rows INTEGER,
                success_rows INTEGER,
                error_rows INTEGER,
                imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS purchase_history (
                id SERIAL PRIMARY KEY,
                product_group_id INTEGER REFERENCES product_groups(id),
                supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
                product_id INTEGER REFERENCES products(id),
                quantity REAL,
                unit_price REAL,
                total_price REAL,
                purchase_date DATE,
                po_number TEXT,
                remark TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                supplier_code TEXT,
                pf_number TEXT,
                delivery_date DATE,
                product_code TEXT,
                product_name TEXT,
                unit TEXT
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS system_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                action TEXT NOT NULL,
                entity_type TEXT,
                entity_id INTEGER,
                details TEXT,
                ip_address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert default data
        await insertDefaultData();

    } else {
        // SQLite: original code
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run(`CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, address TEXT, contact_person TEXT, tel TEXT, email TEXT, tax_id TEXT, status TEXT DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
                db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT, role TEXT NOT NULL CHECK(role IN ('admin', 'buyer', 'supplier')), supplier_id INTEGER, status TEXT DEFAULT 'active', last_login DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (supplier_id) REFERENCES suppliers(id))`);
                db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
                db.run(`CREATE TABLE IF NOT EXISTS product_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, master_code TEXT UNIQUE NOT NULL, master_name TEXT NOT NULL, category_id INTEGER, unit TEXT, image_path TEXT, specification TEXT, status TEXT DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_by INTEGER, FOREIGN KEY (category_id) REFERENCES categories(id), FOREIGN KEY (created_by) REFERENCES users(id))`);
                db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_id INTEGER NOT NULL, product_code TEXT NOT NULL, product_name TEXT NOT NULL, price REAL, unit TEXT, effective_date DATE, remark TEXT, status TEXT DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (supplier_id) REFERENCES suppliers(id), UNIQUE(supplier_id, product_code))`);
                db.run(`CREATE TABLE IF NOT EXISTS product_mapping (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, product_group_id INTEGER NOT NULL, mapped_by INTEGER, mapped_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (product_group_id) REFERENCES product_groups(id), FOREIGN KEY (mapped_by) REFERENCES users(id), UNIQUE(product_id))`);
                db.run(`CREATE TABLE IF NOT EXISTS price_history (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, price REAL NOT NULL, effective_date DATE NOT NULL, recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP, source TEXT DEFAULT 'manual', FOREIGN KEY (product_id) REFERENCES products(id))`);
                db.run(`CREATE TABLE IF NOT EXISTS import_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_id INTEGER NOT NULL, user_id INTEGER NOT NULL, filename TEXT, total_rows INTEGER, success_rows INTEGER, error_rows INTEGER, imported_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (supplier_id) REFERENCES suppliers(id), FOREIGN KEY (user_id) REFERENCES users(id))`);
                db.run(`CREATE TABLE IF NOT EXISTS purchase_history (id INTEGER PRIMARY KEY AUTOINCREMENT, product_group_id INTEGER, supplier_id INTEGER NOT NULL, product_id INTEGER, quantity REAL, unit_price REAL, total_price REAL, purchase_date DATE, po_number TEXT, remark TEXT, created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_group_id) REFERENCES product_groups(id), FOREIGN KEY (supplier_id) REFERENCES suppliers(id), FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (created_by) REFERENCES users(id))`);
                // Migrate purchase_history columns
                const newCols = ['supplier_code TEXT', 'pf_number TEXT', 'delivery_date DATE', 'product_code TEXT', 'product_name TEXT', 'unit TEXT'];
                newCols.forEach(col => { db.run(`ALTER TABLE purchase_history ADD COLUMN ${col}`, () => { }); });

                db.run(`CREATE TABLE IF NOT EXISTS system_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL, entity_type TEXT, entity_id INTEGER, details TEXT, ip_address TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`, (err) => {
                    if (err) reject(err);
                    else insertDefaultData().then(resolve).catch(reject);
                });
            });
        });
    }
};

const insertDefaultData = async () => {
    try {
        const existing = await getOne('SELECT id FROM users WHERE username = ?', ['admin_master']);
        if (!existing) {
            const adminHash = await bcrypt.hash('Tiger79Moon', 10);
            await runQuery('INSERT INTO users (username, password_hash, full_name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)',
                ['admin_master', adminHash, 'System Administrator', 'admin@example.com', 'admin', 'active']);

            const buyerHash = await bcrypt.hash('River48Star', 10);
            await runQuery('INSERT INTO users (username, password_hash, full_name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)',
                ['buyer_ops', buyerHash, 'Procurement Officer', 'buyer@example.com', 'buyer', 'active']);

            // Sample suppliers
            const suppliers = [
                { code: 'SUP001', name: 'ABC Chemicals Co., Ltd.', contact: 'John Smith', tel: '02-123-4567', email: 'sales@abcchemicals.com' },
                { code: 'SUP002', name: 'XYZ Industrial Supply', contact: 'Jane Doe', tel: '02-234-5678', email: 'contact@xyzindustrial.com' },
                { code: 'SUP003', name: 'Thai Chemical Trading', contact: 'Somchai K.', tel: '02-345-6789', email: 'info@thaichemical.co.th' }
            ];
            for (const sup of suppliers) {
                await runQuery('INSERT INTO suppliers (code, name, contact_person, tel, email, status) VALUES (?, ?, ?, ?, ?, ?)',
                    [sup.code, sup.name, sup.contact, sup.tel, sup.email, 'active']);
            }

            const supplierHash = await bcrypt.hash('Stone63Sky', 10);
            await runQuery('INSERT INTO users (username, password_hash, full_name, email, role, supplier_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                ['supplier_primary', supplierHash, 'ABC Chemicals Staff', 'staff@abcchemicals.com', 'supplier', 1, 'active']);

            // Sample categories
            const categories = ['เคมีภัณฑ์', 'สี', 'กรด', 'ด่าง', 'ตัวทำละลาย'];
            for (const cat of categories) {
                await runQuery('INSERT INTO categories (name) VALUES (?)', [cat]);
            }

            console.log('Default data inserted successfully');
        }
    } catch (err) {
        console.error('Insert default data error:', err);
    }
};

module.exports = { db, pool, initDatabase, runQuery, getOne, getAll, isPG, SQL };
