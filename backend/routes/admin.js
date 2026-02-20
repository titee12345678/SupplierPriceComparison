const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { db, getOne, getAll, runQuery } = require('../database');
const { requireRole } = require('../middleware/auth');

// Configure multer: Cloudinary (production) or local disk (dev)
let upload;
const useCloudinary = !!process.env.CLOUDINARY_URL;

if (useCloudinary) {
    const cloudinary = require('cloudinary').v2;
    const { CloudinaryStorage } = require('multer-storage-cloudinary');
    // CLOUDINARY_URL auto-configures cloudinary
    const cloudStorage = new CloudinaryStorage({
        cloudinary,
        params: {
            folder: 'price-compare/products',
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
            transformation: [{ width: 800, height: 800, crop: 'limit' }]
        }
    });
    upload = multer({ storage: cloudStorage, limits: { fileSize: 5 * 1024 * 1024 } });
    console.log('📷 Using Cloudinary for image storage');
} else {
    const diskStorage = multer.diskStorage({
        destination: (req, file, cb) => {
            const uploadDir = path.join(__dirname, '../uploads/products');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `product_${req.params.id}_${Date.now()}${ext}`);
        }
    });
    upload = multer({
        storage: diskStorage,
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            const allowedTypes = /jpeg|jpg|png|gif|webp/;
            const ext = path.extname(file.originalname).toLowerCase();
            if (allowedTypes.test(ext)) cb(null, true);
            else cb(new Error('กรุณา upload รูปภาพเท่านั้น (jpg, png, gif, webp)'));
        }
    });
}

// Apply admin middleware to all routes
router.use(requireRole('admin'));

// ==================== User Management ====================

// Get all users
router.get('/users', async (req, res) => {
    try {
        const users = await getAll(`
            SELECT u.id, u.username, u.full_name, u.email, u.role, u.status, u.last_login, u.created_at,
                   s.name as supplier_name
            FROM users u
            LEFT JOIN suppliers s ON u.supplier_id = s.id
            WHERE u.status != 'deleted'
            ORDER BY u.created_at DESC
        `);

        res.json({ users });
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้' });
    }
});

// Get single user
router.get('/users/:id', async (req, res) => {
    try {
        const user = await getOne(`
            SELECT u.id, u.username, u.full_name, u.email, u.role, u.supplier_id, u.status, u.last_login, u.created_at,
                   s.name as supplier_name
            FROM users u
            LEFT JOIN suppliers s ON u.supplier_id = s.id
            WHERE u.id = ?
        `, [req.params.id]);

        if (!user) {
            return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
        }

        res.json({ user });
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้' });
    }
});

// Create user
router.post('/users', async (req, res) => {
    try {
        const { username, password, full_name, email, role, supplier_id, status } = req.body;

        if (!username || !password || !full_name || !role) {
            return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
        }

        const existing = await getOne('SELECT id FROM users WHERE username = ?', [username]);
        if (existing) {
            return res.status(400).json({ error: 'Username นี้มีอยู่แล้ว' });
        }

        if (role === 'supplier' && !supplier_id) {
            return res.status(400).json({ error: 'กรุณาเลือก Supplier สำหรับผู้ใช้ที่เป็น Supplier' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const result = await runQuery(`
            INSERT INTO users (username, password_hash, full_name, email, role, supplier_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [username, passwordHash, full_name, email || null, role, role === 'supplier' ? supplier_id : null, status || 'active']);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'CREATE', 'user', result.lastID, `Created user ${username}`]
        );

        res.json({ success: true, id: result.lastID, message: 'สร้างผู้ใช้เรียบร้อย' });
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างผู้ใช้' });
    }
});

// Update user
router.put('/users/:id', async (req, res) => {
    try {
        const { full_name, email, role, supplier_id, status } = req.body;

        await runQuery(`
            UPDATE users 
            SET full_name = ?, email = ?, role = ?, supplier_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [full_name, email || null, role, role === 'supplier' ? supplier_id : null, status || 'active', req.params.id]);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'UPDATE', 'user', req.params.id, 'Updated user']
        );

        res.json({ success: true, message: 'อัพเดตผู้ใช้เรียบร้อย' });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัพเดตผู้ใช้' });
    }
});

// Delete user (soft delete)
router.delete('/users/:id', async (req, res) => {
    try {
        // Prevent deleting self
        if (parseInt(req.params.id) === req.session.user.id) {
            return res.status(400).json({ error: 'ไม่สามารถลบบัญชีตัวเองได้' });
        }

        await runQuery(
            'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['deleted', req.params.id]
        );

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'DELETE', 'user', req.params.id, 'Deleted user']
        );

        res.json({ success: true, message: 'ลบผู้ใช้เรียบร้อย' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบผู้ใช้' });
    }
});

// Reset password
router.post('/users/:id/reset-password', async (req, res) => {
    try {
        const { new_password } = req.body;

        if (!new_password || new_password.length < 6) {
            return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
        }

        const passwordHash = await bcrypt.hash(new_password, 10);

        await runQuery(
            'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [passwordHash, req.params.id]
        );

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'RESET_PASSWORD', 'user', req.params.id, 'Reset password']
        );

        res.json({ success: true, message: 'รีเซ็ตรหัสผ่านเรียบร้อย' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน' });
    }
});

// ==================== Supplier Company Management ====================

// Get all suppliers
router.get('/suppliers', async (req, res) => {
    try {
        const suppliers = await getAll(`
            SELECT s.*,
                   (SELECT COUNT(*) FROM users WHERE supplier_id = s.id AND status = 'active') as user_count,
                   (SELECT COUNT(*) FROM products WHERE supplier_id = s.id AND status = 'active') as product_count
            FROM suppliers s
            ORDER BY s.name
        `);

        res.json({ suppliers });
    } catch (err) {
        console.error('Get suppliers error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล suppliers' });
    }
});

// Get single supplier
router.get('/suppliers/:id', async (req, res) => {
    try {
        const supplier = await getOne('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);

        if (!supplier) {
            return res.status(404).json({ error: 'ไม่พบ Supplier' });
        }

        res.json({ supplier });
    } catch (err) {
        console.error('Get supplier error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล supplier' });
    }
});

// Create supplier
router.post('/suppliers', async (req, res) => {
    try {
        const { code, name, address, contact_person, tel, email, tax_id, status } = req.body;

        if (!code || !name) {
            return res.status(400).json({ error: 'กรุณากรอกรหัสและชื่อ Supplier' });
        }

        const existing = await getOne('SELECT id FROM suppliers WHERE code = ?', [code]);
        if (existing) {
            return res.status(400).json({ error: 'รหัส Supplier นี้มีอยู่แล้ว' });
        }

        const result = await runQuery(`
            INSERT INTO suppliers (code, name, address, contact_person, tel, email, tax_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [code, name, address || null, contact_person || null, tel || null, email || null, tax_id || null, status || 'active']);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'CREATE', 'supplier', result.lastID, `Created supplier ${code}`]
        );

        res.json({ success: true, id: result.lastID, message: 'สร้าง Supplier เรียบร้อย' });
    } catch (err) {
        console.error('Create supplier error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้าง supplier' });
    }
});

// Update supplier
router.put('/suppliers/:id', async (req, res) => {
    try {
        const { name, address, contact_person, tel, email, tax_id, status } = req.body;

        await runQuery(`
            UPDATE suppliers 
            SET name = ?, address = ?, contact_person = ?, tel = ?, email = ?, tax_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [name, address || null, contact_person || null, tel || null, email || null, tax_id || null, status || 'active', req.params.id]);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'UPDATE', 'supplier', req.params.id, 'Updated supplier']
        );

        res.json({ success: true, message: 'อัพเดต Supplier เรียบร้อย' });
    } catch (err) {
        console.error('Update supplier error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัพเดต supplier' });
    }
});

// Delete supplier
router.delete('/suppliers/:id', async (req, res) => {
    try {
        // Check if supplier has products
        const products = await getOne(
            'SELECT COUNT(*) as count FROM products WHERE supplier_id = ? AND status = ?', [req.params.id, 'active']
        );

        if (products.count > 0) {
            return res.status(400).json({ error: 'ไม่สามารถลบ Supplier ที่มีสินค้าอยู่ได้' });
        }

        await runQuery('UPDATE suppliers SET status = ? WHERE id = ?', ['deleted', req.params.id]);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'DELETE', 'supplier', req.params.id, 'Deleted supplier']
        );

        res.json({ success: true, message: 'ลบ Supplier เรียบร้อย' });
    } catch (err) {
        console.error('Delete supplier error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบ supplier' });
    }
});

// ==================== Product Image Upload ====================

// Upload product image
router.post('/products/:id/image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'กรุณาเลือกรูปภาพ' });
        }

        // Cloudinary returns full URL in req.file.path; local returns filename
        const imagePath = useCloudinary
            ? req.file.path
            : `/uploads/products/${req.file.filename}`;

        await runQuery(
            'UPDATE product_groups SET image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [imagePath, req.params.id]
        );

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'UPLOAD_IMAGE', 'product_group', req.params.id, 'Uploaded product image']
        );

        res.json({ success: true, imagePath, message: 'อัพโหลดรูปภาพเรียบร้อย' });
    } catch (err) {
        console.error('Upload image error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัพโหลดรูปภาพ' });
    }
});

// Delete product image
router.delete('/products/:id/image', async (req, res) => {
    try {
        const product = await getOne('SELECT image_path FROM product_groups WHERE id = ?', [req.params.id]);

        if (product && product.image_path) {
            if (useCloudinary && product.image_path.includes('cloudinary')) {
                // Extract public_id from Cloudinary URL and delete
                try {
                    const cloudinary = require('cloudinary').v2;
                    const parts = product.image_path.split('/');
                    const filename = parts[parts.length - 1].split('.')[0];
                    const folder = parts[parts.length - 2];
                    await cloudinary.uploader.destroy(`${folder}/${filename}`);
                } catch (e) { console.warn('Cloudinary delete error:', e.message); }
            } else {
                // Local file delete
                const fullPath = path.join(__dirname, '..', product.image_path);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            }
        }

        await runQuery(
            'UPDATE product_groups SET image_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [req.params.id]
        );

        res.json({ success: true, message: 'ลบรูปภาพเรียบร้อย' });
    } catch (err) {
        console.error('Delete image error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบรูปภาพ' });
    }
});

// ==================== Categories Management ====================

// Get all categories
router.get('/categories', async (req, res) => {
    try {
        const categories = await getAll(`
            SELECT c.*,
                   (SELECT COUNT(*) FROM product_groups WHERE category_id = c.id) as product_count
            FROM categories c
            ORDER BY c.name
        `);

        res.json({ categories });
    } catch (err) {
        console.error('Get categories error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

// Create category
router.post('/categories', async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'กรุณากรอกชื่อหมวดหมู่' });
        }

        const result = await runQuery(
            'INSERT INTO categories (name, description) VALUES (?, ?)',
            [name, description || null]
        );

        res.json({ success: true, id: result.lastID, message: 'สร้างหมวดหมู่เรียบร้อย' });
    } catch (err) {
        console.error('Create category error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างหมวดหมู่' });
    }
});

// Update category
router.put('/categories/:id', async (req, res) => {
    try {
        const { name, description } = req.body;

        await runQuery(
            'UPDATE categories SET name = ?, description = ? WHERE id = ?',
            [name, description || null, req.params.id]
        );

        res.json({ success: true, message: 'อัพเดตหมวดหมู่เรียบร้อย' });
    } catch (err) {
        console.error('Update category error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัพเดตหมวดหมู่' });
    }
});

// Delete category
router.delete('/categories/:id', async (req, res) => {
    try {
        const products = await getOne(
            'SELECT COUNT(*) as count FROM product_groups WHERE category_id = ?', [req.params.id]
        );

        if (products.count > 0) {
            return res.status(400).json({ error: 'ไม่สามารถลบหมวดหมู่ที่มีสินค้าอยู่ได้' });
        }

        await runQuery('DELETE FROM categories WHERE id = ?', [req.params.id]);

        res.json({ success: true, message: 'ลบหมวดหมู่เรียบร้อย' });
    } catch (err) {
        console.error('Delete category error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบหมวดหมู่' });
    }
});

// ==================== Export Functions ====================

// Whitelist of allowed table names to prevent SQL injection
const ALLOWED_TABLES = ['users', 'suppliers', 'products', 'product_groups', 'product_mapping', 'price_history', 'categories', 'import_logs', 'purchase_history', 'system_logs'];

// Export database as SQL
router.get('/export/sql', async (req, res) => {
    try {
        const tables = await getAll("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");

        // Filter to only allowed tables to prevent SQL injection
        const safeTables = tables.filter(t => ALLOWED_TABLES.includes(t.name));

        let sql = '-- Database Backup\n';
        sql += `-- Generated at: ${new Date().toISOString()}\n\n`;

        for (const table of safeTables) {
            const tableName = table.name;

            // Get table schema
            const schema = await getOne(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, [tableName]);
            sql += `-- Table: ${tableName}\n`;
            sql += `DROP TABLE IF EXISTS ${tableName};\n`;
            sql += schema.sql + ';\n\n';

            // Get table data
            const rows = await getAll(`SELECT * FROM ${tableName}`);
            if (rows.length > 0) {
                const columns = Object.keys(rows[0]);
                for (const row of rows) {
                    const values = columns.map(col => {
                        const val = row[col];
                        if (val === null) return 'NULL';
                        if (typeof val === 'number') return val;
                        return `'${String(val).replace(/'/g, "''")}'`;
                    });
                    sql += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
                }
                sql += '\n';
            }
        }

        const date = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'application/sql');
        res.setHeader('Content-Disposition', `attachment; filename=backup_${date}.sql`);
        res.send(sql);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, details) VALUES (?, ?, ?, ?)',
            [req.session.user.id, 'EXPORT', 'database', 'Exported SQL backup']
        );
    } catch (err) {
        console.error('Export SQL error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการ export SQL' });
    }
});

// Export data as Excel
router.get('/export/excel', async (req, res) => {
    try {
        const { tables } = req.query;
        const requestedTables = tables ? tables.split(',') : ['users', 'suppliers', 'products', 'product_groups', 'price_history'];
        // Filter to only allowed tables to prevent SQL injection
        const tableList = requestedTables.filter(t => ALLOWED_TABLES.includes(t.trim()));

        const wb = XLSX.utils.book_new();

        for (const tableName of tableList) {
            try {
                let rows = await getAll(`SELECT * FROM ${tableName}`);

                // Remove sensitive data
                if (tableName === 'users') {
                    rows = rows.map(row => {
                        const { password_hash, ...rest } = row;
                        return rest;
                    });
                }

                if (rows.length > 0) {
                    const ws = XLSX.utils.json_to_sheet(rows);
                    XLSX.utils.book_append_sheet(wb, ws, tableName);
                }
            } catch (err) {
                console.log(`Skipping table ${tableName}: ${err.message}`);
            }
        }

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const date = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=data_export_${date}.xlsx`);
        res.send(buffer);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, details) VALUES (?, ?, ?, ?)',
            [req.session.user.id, 'EXPORT', 'excel', `Exported tables: ${tableList.join(', ')}`]
        );
    } catch (err) {
        console.error('Export Excel error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการ export Excel' });
    }
});

// ==================== System Logs ====================

// Get system logs
router.get('/logs', async (req, res) => {
    try {
        const { user_id, action, from_date, to_date, limit = 100 } = req.query;

        let query = `
            SELECT sl.*, u.username, u.full_name
            FROM system_logs sl
            LEFT JOIN users u ON sl.user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (user_id) {
            query += ' AND sl.user_id = ?';
            params.push(user_id);
        }
        if (action) {
            query += ' AND sl.action = ?';
            params.push(action);
        }
        if (from_date) {
            query += ' AND sl.created_at >= ?';
            params.push(from_date);
        }
        if (to_date) {
            query += ' AND sl.created_at <= ?';
            params.push(to_date + ' 23:59:59');
        }

        query += ' ORDER BY sl.created_at DESC LIMIT ?';
        params.push(parseInt(limit));

        const logs = await getAll(query, params);

        // Get available actions for filter
        const actions = await getAll('SELECT DISTINCT action FROM system_logs ORDER BY action');

        res.json({ logs, actions: actions.map(a => a.action) });
    } catch (err) {
        console.error('Get logs error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล logs' });
    }
});

// ==================== Dashboard Stats ====================

// Get admin dashboard stats
router.get('/dashboard', async (req, res) => {
    try {
        const users = await getOne("SELECT COUNT(*) as count FROM users WHERE status = 'active'");
        const suppliers = await getOne("SELECT COUNT(*) as count FROM suppliers WHERE status = 'active'");
        const products = await getOne("SELECT COUNT(*) as count FROM products WHERE status = 'active'");
        const productGroups = await getOne("SELECT COUNT(*) as count FROM product_groups WHERE status = 'active'");

        const recentUsers = await getAll(`
            SELECT id, username, full_name, role, last_login 
            FROM users 
            WHERE status = 'active' 
            ORDER BY last_login DESC NULLS LAST 
            LIMIT 5
        `);

        const recentLogs = await getAll(`
            SELECT sl.*, u.username
            FROM system_logs sl
            LEFT JOIN users u ON sl.user_id = u.id
            ORDER BY sl.created_at DESC
            LIMIT 10
        `);

        res.json({
            stats: {
                users: users.count,
                suppliers: suppliers.count,
                products: products.count,
                productGroups: productGroups.count
            },
            recentUsers,
            recentLogs
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล dashboard' });
    }
});

// ==================== Delete All Data ====================

// Delete all data (products, price history, mappings, etc.)
router.delete('/delete-all-data', async (req, res) => {
    try {
        const { isPG } = require('../database');

        // Count before deletion for logging
        const productCount = await getOne('SELECT COUNT(*) as count FROM products');
        const historyCount = await getOne('SELECT COUNT(*) as count FROM price_history');
        const groupCount = await getOne('SELECT COUNT(*) as count FROM product_groups');
        const mappingCount = await getOne('SELECT COUNT(*) as count FROM product_mapping');

        if (isPG) {
            // PostgreSQL: use TRUNCATE CASCADE for clean deletion
            await runQuery('TRUNCATE TABLE purchase_history, import_logs, price_history, product_mapping, products, product_groups RESTART IDENTITY CASCADE');
        } else {
            // SQLite: delete in correct foreign key order
            try { await runQuery('DELETE FROM purchase_history'); } catch (e) { }
            try { await runQuery('DELETE FROM import_logs'); } catch (e) { }
            await runQuery('DELETE FROM price_history');
            await runQuery('DELETE FROM product_mapping');
            await runQuery('DELETE FROM products');
            await runQuery('DELETE FROM product_groups');
        }

        // Log the action
        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, details) VALUES (?, ?, ?, ?)',
            [
                req.session.user.id,
                'DELETE_ALL',
                'system',
                `Deleted all data: ${productCount.count} products, ${historyCount.count} price history, ${groupCount.count} product groups, ${mappingCount.count} mappings`
            ]
        );

        res.json({
            success: true,
            message: 'ลบข้อมูลทั้งหมดสำเร็จ',
            deleted: {
                products: productCount.count,
                priceHistory: historyCount.count,
                productGroups: groupCount.count,
                mappings: mappingCount.count
            }
        });
    } catch (err) {
        console.error('Delete all data error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
    }
});

module.exports = router;
