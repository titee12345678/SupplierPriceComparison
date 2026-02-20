const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { getOne, runQuery } = require('../database');

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'กรุณากรอก username และ password' });
        }

        const user = await getOne(`
            SELECT u.*, s.name as supplier_name 
            FROM users u 
            LEFT JOIN suppliers s ON u.supplier_id = s.id 
            WHERE u.username = ? AND u.status = 'active'
        `, [username]);

        if (!user) {
            return res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
        }

        // Update last login
        await runQuery('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

        // Log login
        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, details, ip_address) VALUES (?, ?, ?, ?, ?)',
            [user.id, 'LOGIN', 'user', `User ${user.username} logged in`, req.ip]
        );

        // Set session
        req.session.user = {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            email: user.email,
            role: user.role,
            supplier_id: user.supplier_id,
            supplier_name: user.supplier_name
        };

        res.json({
            success: true,
            user: req.session.user
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
    }
});

// Logout
router.post('/logout', async (req, res) => {
    try {
        if (req.session.user) {
            await runQuery(
                'INSERT INTO system_logs (user_id, action, entity_type, details, ip_address) VALUES (?, ?, ?, ?, ?)',
                [req.session.user.id, 'LOGOUT', 'user', `User ${req.session.user.username} logged out`, req.ip]
            );
        }

        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการออกจากระบบ' });
            }
            res.json({ success: true, message: 'ออกจากระบบเรียบร้อย' });
        });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการออกจากระบบ' });
    }
});

// Get current user
router.get('/me', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'ไม่ได้เข้าสู่ระบบ' });
    }
    res.json({ user: req.session.user });
});

// Change password
router.post('/change-password', async (req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
        }

        const user = await getOne('SELECT password_hash FROM users WHERE id = ?', [req.session.user.id]);

        const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await runQuery('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newHash, req.session.user.id]);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
            [req.session.user.id, 'CHANGE_PASSWORD', 'user', req.session.user.id, 'Password changed', req.ip]
        );

        res.json({ success: true, message: 'เปลี่ยนรหัสผ่านเรียบร้อย' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน' });
    }
});

module.exports = router;
