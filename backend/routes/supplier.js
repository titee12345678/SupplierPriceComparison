const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const { getOne, getAll, runQuery } = require('../database');
const { requireSupplier } = require('../middleware/auth');

// Configure multer for Excel upload
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.xlsx' && ext !== '.xls') {
            return cb(new Error('กรุณา upload ไฟล์ Excel (.xlsx หรือ .xls) เท่านั้น'));
        }
        cb(null, true);
    }
});

// Apply supplier middleware to all routes
router.use(requireSupplier);

// Get supplier's products
router.get('/products', async (req, res) => {
    try {
        const supplierId = req.session.user.supplier_id;
        const products = await getAll(`
            SELECT p.*, pm.product_group_id, pg.master_name as group_name
            FROM products p
            LEFT JOIN product_mapping pm ON p.id = pm.product_id
            LEFT JOIN product_groups pg ON pm.product_group_id = pg.id
            WHERE p.supplier_id = ? AND p.status = 'active'
            ORDER BY p.updated_at DESC
        `, [supplierId]);

        res.json({ products });
    } catch (err) {
        console.error('Get products error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสินค้า' });
    }
});

// Get single product
router.get('/products/:id', async (req, res) => {
    try {
        const supplierId = req.session.user.supplier_id;
        const product = await getOne(`
            SELECT * FROM products WHERE id = ? AND supplier_id = ?
        `, [req.params.id, supplierId]);

        if (!product) {
            return res.status(404).json({ error: 'ไม่พบสินค้า' });
        }

        res.json({ product });
    } catch (err) {
        console.error('Get product error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสินค้า' });
    }
});

// Add new product
router.post('/products', async (req, res) => {
    try {
        const supplierId = req.session.user.supplier_id;
        const { product_code, product_name, price, unit, effective_date, remark } = req.body;

        if (!product_code || !product_name) {
            return res.status(400).json({ error: 'กรุณากรอกรหัสสินค้าและชื่อสินค้า' });
        }

        // Check duplicate code
        const existing = await getOne(
            'SELECT id FROM products WHERE supplier_id = ? AND product_code = ?',
            [supplierId, product_code]
        );

        if (existing) {
            return res.status(400).json({ error: 'รหัสสินค้านี้มีอยู่แล้ว' });
        }

        const result = await runQuery(`
            INSERT INTO products (supplier_id, product_code, product_name, price, unit, effective_date, remark, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
        `, [supplierId, product_code, product_name, price || null, unit || null, effective_date || null, remark || null]);

        // Add to price history
        if (price) {
            await runQuery(`
                INSERT INTO price_history (product_id, price, effective_date, source)
                VALUES (?, ?, ?, 'manual')
            `, [result.lastID, price, effective_date || new Date().toISOString().split('T')[0]]);
        }

        // Log
        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'CREATE', 'product', result.lastID, `Created product ${product_code}`]
        );

        res.json({ success: true, id: result.lastID, message: 'เพิ่มสินค้าเรียบร้อย' });
    } catch (err) {
        console.error('Add product error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มสินค้า' });
    }
});

// Update product
router.put('/products/:id', async (req, res) => {
    try {
        const supplierId = req.session.user.supplier_id;
        const { product_name, price, unit, effective_date, remark, status } = req.body;

        // Check ownership
        const product = await getOne(
            'SELECT * FROM products WHERE id = ? AND supplier_id = ?',
            [req.params.id, supplierId]
        );

        if (!product) {
            return res.status(404).json({ error: 'ไม่พบสินค้า' });
        }

        await runQuery(`
            UPDATE products 
            SET product_name = ?, price = ?, unit = ?, effective_date = ?, remark = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [product_name, price, unit, effective_date, remark, status || 'active', req.params.id]);

        // Add to price history if price changed
        if (price && price !== product.price) {
            await runQuery(`
                INSERT INTO price_history (product_id, price, effective_date, source)
                VALUES (?, ?, ?, 'manual')
            `, [req.params.id, price, effective_date || new Date().toISOString().split('T')[0]]);
        }

        // Log
        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'UPDATE', 'product', req.params.id, `Updated product ${product.product_code}`]
        );

        res.json({ success: true, message: 'อัพเดตสินค้าเรียบร้อย' });
    } catch (err) {
        console.error('Update product error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัพเดตสินค้า' });
    }
});

// Delete product (soft delete - sets status to 'deleted')
router.delete('/products/:id', async (req, res) => {
    try {
        const supplierId = req.session.user.supplier_id;

        // Check ownership
        const product = await getOne(
            'SELECT * FROM products WHERE id = ? AND supplier_id = ?',
            [req.params.id, supplierId]
        );

        if (!product) {
            return res.status(404).json({ error: 'ไม่พบสินค้า' });
        }

        // Soft delete - set status to 'deleted'
        await runQuery(
            'UPDATE products SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['deleted', req.params.id]
        );

        // Log
        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'DELETE', 'product', req.params.id, `Deleted product ${product.product_code}`]
        );

        res.json({ success: true, message: 'ลบสินค้าเรียบร้อย' });
    } catch (err) {
        console.error('Delete product error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบสินค้า' });
    }
});

// Download Excel template (Suppliers.xlsx format)
router.get('/template', (req, res) => {
    try {
        const wb = XLSX.utils.book_new();

        // Create template matching Suppliers.xlsx format
        const headers = [
            ['supplier_product_code', 'product_name', 'description', 'price', 'Currency', 'unit', 'effective_date', 'notes'],
            ['', 'สินค้าตัวอย่าง', 'รายละเอียดสินค้า', 100, 'THB', 'ชิ้น', '2026-01-31', 'หมายเหตุ']
        ];

        const ws = XLSX.utils.aoa_to_sheet(headers);

        // Set column widths
        ws['!cols'] = [
            { wch: 25 }, { wch: 35 }, { wch: 40 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 30 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Price Template');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=supplier_price_template.xlsx');
        res.send(buffer);
    } catch (err) {
        console.error('Template download error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้าง template' });
    }
});

// Upload Excel for preview - Suppliers.xlsx format
// Headers: supplier_product_code, product_name, description, price, Currency, unit, effective_date, notes
router.post('/import/preview', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'กรุณาเลือกไฟล์ Excel' });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (data.length < 2) {
            return res.status(400).json({ error: 'ไฟล์ไม่มีข้อมูล' });
        }

        const headers = data[0];
        const rows = data.slice(1).filter(row => row.length > 0 && (row[0] || row[1])); // Must have code or name

        const preview = [];
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // Excel row number

            // Map to Suppliers.xlsx format: supplier_product_code, product_name, description, price, Currency, unit, effective_date, notes
            const item = {
                row: rowNum,
                product_code: row[0]?.toString().trim() || `AUTO-${Date.now()}-${i}`, // Auto-generate if empty
                product_name: row[1]?.toString().trim() || '',
                description: row[2]?.toString().trim() || '',
                price: parseFloat(row[3]) || 0,
                currency: row[4]?.toString().trim() || 'THB',
                unit: row[5]?.toString().trim() || '',
                effective_date: '',
                remark: row[7]?.toString().trim() || '',
                isValid: true,
                errors: []
            };

            // Parse date
            if (row[6]) {
                let dateValue = row[6];
                if (typeof dateValue === 'number') {
                    // Excel date number
                    const date = XLSX.SSF.parse_date_code(dateValue);
                    item.effective_date = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
                } else if (dateValue instanceof Date) {
                    item.effective_date = dateValue.toISOString().split('T')[0];
                } else if (typeof dateValue === 'string') {
                    // Try parsing various formats
                    if (dateValue.includes('/')) {
                        const parts = dateValue.split('/');
                        if (parts.length === 3) {
                            // Assume DD/MM/YYYY format
                            item.effective_date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                        }
                    } else if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        // YYYY-MM-DD format
                        item.effective_date = dateValue;
                    } else {
                        item.effective_date = dateValue;
                    }
                }

                // Validate parsed date
                if (item.effective_date) {
                    const parsedDate = new Date(item.effective_date);
                    const year = parsedDate.getFullYear();
                    if (isNaN(parsedDate.getTime()) || year < 1900 || year > 2100) {
                        item.errors.push(`วันที่ไม่ถูกต้อง: ${dateValue}`);
                        item.effective_date = '';
                    }
                }
            }

            // Validate
            if (!item.product_name) {
                item.isValid = false;
                item.errors.push('ไม่มีชื่อสินค้า');
            }
            if (!item.price || item.price <= 0) {
                item.isValid = false;
                item.errors.push('ราคาไม่ถูกต้อง');
            }
            if (!item.unit) {
                item.isValid = false;
                item.errors.push('ไม่มีหน่วย');
            }

            if (!item.isValid) {
                errors.push({ row: rowNum, errors: item.errors });
            }

            preview.push(item);
        }

        res.json({
            success: true,
            filename: req.file.originalname,
            totalRows: preview.length,
            validRows: preview.filter(p => p.isValid).length,
            errorRows: errors.length,
            preview,
            errors
        });
    } catch (err) {
        console.error('Import preview error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอ่านไฟล์ Excel' });
    }
});

// Confirm import
router.post('/import/confirm', async (req, res) => {
    try {
        const supplierId = req.session.user.supplier_id;
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'ไม่มีข้อมูลสำหรับ import' });
        }

        let successCount = 0;
        let updateCount = 0;
        const effectiveDate = new Date().toISOString().split('T')[0];

        for (const item of items) {
            if (!item.isValid) continue;

            // Check if product exists
            const existing = await getOne(
                'SELECT id, price FROM products WHERE supplier_id = ? AND product_code = ?',
                [supplierId, item.product_code]
            );

            if (existing) {
                // Update existing product
                await runQuery(`
                    UPDATE products 
                    SET product_name = ?, price = ?, unit = ?, effective_date = ?, remark = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [item.product_name, item.price, item.unit, item.effective_date || effectiveDate, item.remark, existing.id]);

                // Add to price history if price changed
                if (item.price !== existing.price) {
                    await runQuery(`
                        INSERT INTO price_history (product_id, price, effective_date, source)
                        VALUES (?, ?, ?, 'import')
                    `, [existing.id, item.price, item.effective_date || effectiveDate]);
                }
                updateCount++;
            } else {
                // Insert new product
                const result = await runQuery(`
                    INSERT INTO products (supplier_id, product_code, product_name, price, unit, effective_date, remark, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
                `, [supplierId, item.product_code, item.product_name, item.price, item.unit, item.effective_date || effectiveDate, item.remark]);

                // Add to price history
                await runQuery(`
                    INSERT INTO price_history (product_id, price, effective_date, source)
                    VALUES (?, ?, ?, 'import')
                `, [result.lastID, item.price, item.effective_date || effectiveDate]);
                successCount++;
            }
        }

        // Log import
        await runQuery(`
            INSERT INTO import_logs (supplier_id, user_id, total_rows, success_rows, error_rows)
            VALUES (?, ?, ?, ?, ?)
        `, [supplierId, req.session.user.id, items.length, successCount + updateCount, items.length - successCount - updateCount]);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, details) VALUES (?, ?, ?, ?)',
            [req.session.user.id, 'IMPORT', 'products', `Imported ${successCount} new, updated ${updateCount} products`]
        );

        res.json({
            success: true,
            message: `Import สำเร็จ: เพิ่มใหม่ ${successCount} รายการ, อัพเดต ${updateCount} รายการ`,
            newCount: successCount,
            updateCount: updateCount
        });
    } catch (err) {
        console.error('Import confirm error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการ import' });
    }
});

// Get price history for a product
router.get('/price-history/:productId', async (req, res) => {
    try {
        const supplierId = req.session.user.supplier_id;

        // Verify ownership
        const product = await getOne(
            'SELECT * FROM products WHERE id = ? AND supplier_id = ?',
            [req.params.productId, supplierId]
        );

        if (!product) {
            return res.status(404).json({ error: 'ไม่พบสินค้า' });
        }

        const history = await getAll(`
            SELECT price, effective_date, recorded_at, source
            FROM price_history
            WHERE product_id = ?
            ORDER BY effective_date ASC
        `, [req.params.productId]);

        // Calculate stats
        const prices = history.map(h => h.price);
        const stats = {
            average: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
            min: prices.length > 0 ? Math.min(...prices) : 0,
            max: prices.length > 0 ? Math.max(...prices) : 0,
            current: product.price || 0
        };

        res.json({
            product,
            history,
            stats
        });
    } catch (err) {
        console.error('Get price history error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงประวัติราคา' });
    }
});

// Get dashboard stats
router.get('/dashboard', async (req, res) => {
    try {
        const supplierId = req.session.user.supplier_id;

        const totalProducts = await getOne(
            'SELECT COUNT(*) as count FROM products WHERE supplier_id = ? AND status = ?',
            [supplierId, 'active']
        );

        const recentUpdates = await getAll(`
            SELECT * FROM products 
            WHERE supplier_id = ? AND updated_at >= datetime('now', '-7 days')
            ORDER BY updated_at DESC
            LIMIT 5
        `, [supplierId]);

        const importLogs = await getAll(`
            SELECT * FROM import_logs 
            WHERE supplier_id = ?
            ORDER BY imported_at DESC
            LIMIT 5
        `, [supplierId]);

        res.json({
            stats: {
                totalProducts: totalProducts.count,
                recentUpdatesCount: recentUpdates.length
            },
            recentUpdates,
            importLogs
        });
    } catch (err) {
        console.error('Get dashboard error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล dashboard' });
    }
});

module.exports = router;
