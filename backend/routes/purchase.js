const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const multer = require('multer');
const path = require('path');
const { getOne, getAll, runQuery, SQL } = require('../database');
const { requireRole } = require('../middleware/auth');

// Configure multer for Excel upload
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.xlsx' && ext !== '.xls') {
            return cb(new Error('กรุณาอัพโหลดไฟล์ Excel (.xlsx, .xls) เท่านั้น'));
        }
        cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 }
});

// Apply buyer/admin middleware to all routes
router.use(requireRole('buyer', 'admin'));

// Helper: parse DD/MM/YYYY date string to YYYY-MM-DD
function parseDateDMY(val) {
    if (!val) return '';
    if (typeof val === 'number') {
        const d = XLSX.SSF.parse_date_code(val);
        return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
    if (val instanceof Date) {
        return val.toISOString().split('T')[0];
    }
    const str = String(val).trim();
    if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
    }
    return str;
}

// ==================== Download Template ====================
router.get('/import/template', (req, res) => {
    try {
        const wb = XLSX.utils.book_new();
        const headers = [
            ['รหัสเจ้าหนี้', 'ชื่อเจ้าหนี้', 'วันที่สั่งซื้อ', 'เลขที่ PF', 'เลขที่สั่งซื้อ',
                'รหัสสินค้า', 'ชื่อสินค้า', 'หน่วยนับ', 'จำนวนสั่งซื้อ', 'ราคา/หน่วย', 'รวมราคา',
                'กำหนดส่ง', 'หมายเหตุ'],
            ['SUP-001', 'บริษัท ตัวอย่าง จำกัด', '10/02/2023', 'PF2302000044', '31B013751',
                'PRD001', 'สินค้าตัวอย่าง', 'ก.ก.', 50, 2000, 100000, '20/02/2023', 'หมายเหตุ']
        ];
        const ws = XLSX.utils.aoa_to_sheet(headers);
        ws['!cols'] = [
            { wch: 15 }, { wch: 35 }, { wch: 15 }, { wch: 18 }, { wch: 15 },
            { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
            { wch: 15 }, { wch: 30 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Purchase Template');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=purchase_history_template.xlsx');
        res.send(buffer);
    } catch (err) {
        console.error('Purchase template error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้าง template' });
    }
});

// ==================== Import Preview ====================
router.post('/import/preview', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'กรุณาเลือกไฟล์ Excel' });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (data.length < 2) {
            return res.status(400).json({ error: 'ไฟล์ไม่มีข้อมูล' });
        }

        // Get all existing suppliers and products for matching
        const suppliers = await getAll('SELECT id, code, name FROM suppliers WHERE status = ?', ['active']);
        const supplierByCode = {};
        const supplierByName = {};
        suppliers.forEach(s => {
            supplierByCode[s.code.toLowerCase().trim()] = s;
            supplierByName[s.name.toLowerCase().trim()] = s;
        });

        const newSuppliers = [];
        const rows = data.slice(1).filter(row => row.length > 0 && (row[0] || row[1] || row[5] || row[6]));

        const preview = [];
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;

            const supplierCode = String(row[0] || '').trim();
            const supplierName = String(row[1] || '').trim();
            const productCode = String(row[5] || '').trim();
            const productName = String(row[6] || '').trim();
            const unit = String(row[7] || '').trim();

            // Match supplier: by code first, then by name
            let matchedSupplier = null;
            if (supplierCode && supplierByCode[supplierCode.toLowerCase()]) {
                matchedSupplier = supplierByCode[supplierCode.toLowerCase()];
            } else if (supplierName && supplierByName[supplierName.toLowerCase()]) {
                matchedSupplier = supplierByName[supplierName.toLowerCase()];
            }

            let supplierId = matchedSupplier ? matchedSupplier.id : null;

            // Auto-create supplier if not found
            if (!supplierId && (supplierCode || supplierName)) {
                const code = supplierCode || supplierName.replace(/\s+/g, '-').substring(0, 20).toUpperCase() + '-' + Date.now().toString().slice(-4);
                try {
                    const result = await runQuery(
                        'INSERT INTO suppliers (code, name, status) VALUES (?, ?, ?)',
                        [code, supplierName || supplierCode, 'active']
                    );
                    supplierId = result.lastID;
                    const newSup = { id: supplierId, code, name: supplierName || supplierCode };
                    supplierByCode[code.toLowerCase()] = newSup;
                    if (supplierName) supplierByName[supplierName.toLowerCase()] = newSup;
                    newSuppliers.push(newSup);
                } catch (err) {
                    console.error(`Failed to create supplier ${supplierCode}:`, err);
                }
            }

            // Match product by code + supplier, then fallback to name + supplier
            let existingProduct = null;
            if (productCode && supplierId) {
                existingProduct = await getOne(
                    'SELECT id, price, product_code FROM products WHERE supplier_id = ? AND product_code = ? AND status = ?',
                    [supplierId, productCode, 'active']
                );
            }
            // Fallback: match by product name + supplier (handles AUTO-coded products)
            if (!existingProduct && productName && supplierId) {
                existingProduct = await getOne(
                    'SELECT id, price, product_code FROM products WHERE supplier_id = ? AND LOWER(TRIM(product_name)) = LOWER(TRIM(?)) AND status = ?',
                    [supplierId, productName, 'active']
                );
            }

            const item = {
                row: rowNum,
                supplier_code: supplierCode,
                supplier_name: supplierName,
                supplier_id: supplierId,
                supplier_matched: !!matchedSupplier,
                supplier_auto_created: !matchedSupplier && !!supplierId,
                purchase_date: parseDateDMY(row[2]),
                pf_number: String(row[3] || '').trim(),
                po_number: String(row[4] || '').trim(),
                product_code: productCode,
                product_name: productName,
                product_id: existingProduct ? existingProduct.id : null,
                product_matched: !!existingProduct,
                unit: unit,
                quantity: parseFloat(row[8]) || 0,
                unit_price: parseFloat(row[9]) || 0,
                total_price: parseFloat(row[10]) || 0,
                delivery_date: parseDateDMY(row[11]),
                remark: String(row[12] || '').trim(),
                isValid: true,
                errors: []
            };

            // Validate
            if (!item.supplier_code && !item.supplier_name) {
                item.isValid = false;
                item.errors.push('ไม่มีรหัสหรือชื่อ Supplier');
            } else if (!item.supplier_id) {
                item.isValid = false;
                item.errors.push('ไม่สามารถระบุ Supplier ได้');
            }
            if (!item.product_name) {
                item.isValid = false;
                item.errors.push('ไม่มีชื่อสินค้า');
            }
            if (!item.unit_price || item.unit_price <= 0) {
                item.isValid = false;
                item.errors.push('ราคา/หน่วยไม่ถูกต้อง');
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
            newSuppliers,
            preview,
            errors
        });
    } catch (err) {
        console.error('Purchase import preview error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอ่านไฟล์ Excel' });
    }
});

// ==================== Import Confirm ====================
router.post('/import/confirm', async (req, res) => {
    try {
        const { items } = req.body;
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'ไม่มีข้อมูลสำหรับ import' });
        }

        let insertCount = 0;
        let skipCount = 0;
        let productCreateCount = 0;

        for (const item of items) {
            if (!item.isValid || !item.supplier_id) continue;

            // Check duplicate: same PO + product code + supplier
            if (item.po_number && item.product_code) {
                const dup = await getOne(
                    'SELECT id FROM purchase_history WHERE po_number = ? AND product_code = ? AND supplier_id = ?',
                    [item.po_number, item.product_code, item.supplier_id]
                );
                if (dup) {
                    skipCount++;
                    continue;
                }
            }

            // Find or create product
            let productId = item.product_id;
            if (!productId && item.supplier_id) {
                // 1. Try exact match by product_code + supplier
                let existing = null;
                if (item.product_code) {
                    existing = await getOne(
                        'SELECT id, product_code FROM products WHERE supplier_id = ? AND product_code = ? AND status = ?',
                        [item.supplier_id, item.product_code, 'active']
                    );
                }

                // 2. Fallback: match by product_name + supplier (handles AUTO-coded products)
                if (!existing && item.product_name) {
                    existing = await getOne(
                        'SELECT id, product_code FROM products WHERE supplier_id = ? AND LOWER(TRIM(product_name)) = LOWER(TRIM(?)) AND status = ?',
                        [item.supplier_id, item.product_name, 'active']
                    );
                }

                if (existing) {
                    productId = existing.id;
                    // If existing product has AUTO code and import has real code, update it
                    if (item.product_code && existing.product_code && existing.product_code.startsWith('AUTO-') && !item.product_code.startsWith('AUTO-')) {
                        await runQuery(
                            'UPDATE products SET product_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                            [item.product_code, existing.id]
                        );
                    }
                } else if (item.product_code) {
                    // Auto-create product
                    const result = await runQuery(`
                        INSERT INTO products (supplier_id, product_code, product_name, price, unit, effective_date, status)
                        VALUES (?, ?, ?, ?, ?, ?, 'active')
                    `, [item.supplier_id, item.product_code, item.product_name, item.unit_price,
                    item.unit, item.purchase_date]);
                    productId = result.lastID;
                    productCreateCount++;
                }
            }

            // Insert purchase_history
            await runQuery(`
                INSERT INTO purchase_history
                (supplier_id, product_id, supplier_code, pf_number, po_number,
                 product_code, product_name, unit, quantity, unit_price, total_price,
                 purchase_date, delivery_date, remark, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                item.supplier_id, productId, item.supplier_code, item.pf_number, item.po_number,
                item.product_code, item.product_name, item.unit, item.quantity, item.unit_price,
                item.total_price, item.purchase_date, item.delivery_date, item.remark,
                req.session.user.id
            ]);

            // Insert price_history for price tracking (linked to product)
            if (productId && item.unit_price > 0) {
                await runQuery(`
                    INSERT INTO price_history (product_id, price, effective_date, source)
                    VALUES (?, ?, ?, 'purchase_import')
                `, [productId, item.unit_price, item.purchase_date]);

                // Update product price if this is the most recent purchase
                const latestPH = await getOne(
                    'SELECT purchase_date FROM purchase_history WHERE product_id = ? ORDER BY purchase_date DESC LIMIT 1',
                    [productId]
                );
                if (latestPH && latestPH.purchase_date <= item.purchase_date) {
                    await runQuery(
                        'UPDATE products SET price = ?, effective_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [item.unit_price, item.purchase_date, productId]
                    );
                }
            }

            insertCount++;
        }

        // Log
        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, details) VALUES (?, ?, ?, ?)',
            [req.session.user.id, 'IMPORT', 'purchase_history',
            `Purchase import: ${insertCount} inserted, ${skipCount} skipped (duplicate), ${productCreateCount} new products`]
        );

        res.json({
            success: true,
            message: `Import สำเร็จ: เพิ่ม ${insertCount} รายการ, ข้าม ${skipCount} รายการ (ซ้ำ), สร้างสินค้าใหม่ ${productCreateCount} รายการ`,
            insertCount,
            skipCount,
            productCreateCount
        });
    } catch (err) {
        console.error('Purchase import confirm error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการ import' });
    }
});

// ==================== Purchase History List ====================
router.get('/history', async (req, res) => {
    try {
        const { supplier_id, search, date_from, date_to, page = 1, limit = 30 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        let baseQuery = ' FROM purchase_history ph LEFT JOIN suppliers s ON ph.supplier_id = s.id WHERE 1=1 ';
        const params = [];

        if (supplier_id) {
            baseQuery += ' AND ph.supplier_id = ?';
            params.push(supplier_id);
        }
        if (search) {
            baseQuery += ' AND (ph.product_name LIKE ? OR ph.product_code LIKE ? OR ph.po_number LIKE ? OR ph.pf_number LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (date_from) {
            baseQuery += ' AND ph.purchase_date >= ?';
            params.push(date_from);
        }
        if (date_to) {
            baseQuery += ' AND ph.purchase_date <= ?';
            params.push(date_to);
        }

        const countResult = await getOne(`SELECT COUNT(*) as count ${baseQuery}`, params);
        const total = countResult.count;
        const totalPages = Math.ceil(total / limitNum);

        const rows = await getAll(`
            SELECT ph.*, s.name as supplier_display_name, s.code as supplier_display_code
            ${baseQuery}
            ORDER BY ph.purchase_date DESC, ph.id DESC
            LIMIT ? OFFSET ?
        `, [...params, limitNum, offset]);

        // Get suppliers for filter dropdown
        const suppliers = await getAll(`
            SELECT DISTINCT s.id, s.code, s.name
            FROM suppliers s
            JOIN purchase_history ph ON ph.supplier_id = s.id
            ORDER BY s.name
        `);

        res.json({ rows, total, totalPages, page: pageNum, limit: limitNum, suppliers });
    } catch (err) {
        console.error('Purchase history list error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติการซื้อ' });
    }
});

// ==================== Product Purchase Detail ====================
router.get('/history/product/:productCode', async (req, res) => {
    try {
        const { productCode } = req.params;
        const { supplier_id } = req.query;

        let query = 'SELECT * FROM purchase_history WHERE product_code = ?';
        const params = [productCode];

        if (supplier_id) {
            query += ' AND supplier_id = ?';
            params.push(supplier_id);
        }

        query += ' ORDER BY purchase_date ASC';
        const history = await getAll(query, params);

        if (history.length === 0) {
            return res.status(404).json({ error: 'ไม่พบประวัติการซื้อ' });
        }

        // Get product info
        const first = history[0];
        const prices = history.map(h => h.unit_price).filter(p => p > 0);
        const quantities = history.map(h => h.quantity).filter(q => q > 0);

        // Get supplier name
        let supplierName = first.supplier_code;
        if (first.supplier_id) {
            const supplier = await getOne('SELECT name FROM suppliers WHERE id = ?', [first.supplier_id]);
            if (supplier) supplierName = supplier.name;
        }

        const stats = {
            productCode: first.product_code,
            productName: first.product_name,
            supplierName: supplierName,
            totalOrders: history.length,
            totalQuantity: quantities.reduce((a, b) => a + b, 0),
            totalValue: history.reduce((a, h) => a + (h.total_price || 0), 0),
            minPrice: prices.length > 0 ? Math.min(...prices) : 0,
            maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
            avgPrice: prices.length > 0 ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100 : 0,
            latestPrice: prices.length > 0 ? prices[prices.length - 1] : 0,
            firstDate: history[0].purchase_date,
            lastDate: history[history.length - 1].purchase_date
        };

        res.json({ history, stats });
    } catch (err) {
        console.error('Product purchase detail error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติ' });
    }
});

// ==================== Purchase Summary ====================
router.get('/summary', async (req, res) => {
    try {
        // Overall stats
        const overall = await getOne(`
            SELECT
                COUNT(*) as total_records,
                COUNT(DISTINCT product_code) as unique_products,
                COUNT(DISTINCT supplier_id) as unique_suppliers,
                COUNT(DISTINCT po_number) as unique_orders,
                SUM(total_price) as total_value,
                MIN(purchase_date) as earliest_date,
                MAX(purchase_date) as latest_date
            FROM purchase_history
        `);

        // Top products by order frequency
        const topProducts = await getAll(`
            SELECT product_code, product_name, unit,
                   COUNT(*) as order_count,
                   SUM(quantity) as total_qty,
                   ${SQL.round('AVG(unit_price)', 2)} as avg_price,
                   MIN(unit_price) as min_price,
                   MAX(unit_price) as max_price,
                   SUM(total_price) as total_value
            FROM purchase_history
            GROUP BY product_code
            ORDER BY order_count DESC
            LIMIT 20
        `);

        // Supplier breakdown
        const supplierBreakdown = await getAll(`
            SELECT ph.supplier_id, s.name as supplier_name, s.code as supplier_code,
                   COUNT(*) as order_count,
                   COUNT(DISTINCT ph.product_code) as product_count,
                   SUM(ph.total_price) as total_value
            FROM purchase_history ph
            LEFT JOIN suppliers s ON ph.supplier_id = s.id
            GROUP BY ph.supplier_id
            ORDER BY total_value DESC
        `);

        // Monthly spending trend
        const monthlyTrend = await getAll(`
            SELECT ${SQL.yearMonth('purchase_date')} as month,
                   COUNT(*) as order_count,
                   SUM(total_price) as total_value
            FROM purchase_history
            WHERE purchase_date IS NOT NULL
            GROUP BY 1
            ORDER BY 1 ASC
        `);

        res.json({ overall, topProducts, supplierBreakdown, monthlyTrend });
    } catch (err) {
        console.error('Purchase summary error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างสรุป' });
    }
});

module.exports = router;
