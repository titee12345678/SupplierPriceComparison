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
            return cb(new Error('กรุณา upload ไฟล์ Excel (.xlsx หรือ .xls) เท่านั้น'));
        }
        cb(null, true);
    }
});

// Apply buyer/admin middleware to all routes
router.use(requireRole('buyer', 'admin'));

// Get dashboard stats
router.get('/dashboard', async (req, res) => {
    try {
        const activeSuppliers = await getOne(
            'SELECT COUNT(*) as count FROM suppliers WHERE status = ?', ['active']
        );

        const totalProducts = await getOne(
            'SELECT COUNT(*) as count FROM products WHERE status = ?', ['active']
        );

        const mappedProducts = await getOne(
            'SELECT COUNT(DISTINCT product_id) as count FROM product_mapping'
        );

        const unmappedProducts = await getOne(`
            SELECT COUNT(*) as count FROM products p 
            WHERE p.status = 'active' AND NOT EXISTS (
                SELECT 1 FROM product_mapping pm WHERE pm.product_id = p.id
            )
        `);

        const recentUpdates = await getAll(`
            SELECT p.*, s.name as supplier_name 
            FROM products p
            JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.updated_at >= datetime('now', '-7 days')
            ORDER BY p.updated_at DESC
            LIMIT 10
        `);

        const productGroups = await getOne(
            'SELECT COUNT(*) as count FROM product_groups WHERE status = ?', ['active']
        );

        res.json({
            stats: {
                activeSuppliers: activeSuppliers.count,
                totalProducts: totalProducts.count,
                mappedProducts: mappedProducts.count,
                unmappedProducts: unmappedProducts.count,
                productGroups: productGroups.count
            },
            recentUpdates
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล dashboard' });
    }
});

// Dashboard Charts Data
router.get('/dashboard-charts', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        // Validate date format (YYYY-MM-DD) to prevent injection
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const hasDateFilter = start_date && end_date && dateRegex.test(start_date) && dateRegex.test(end_date);

        // Build parameterized date filter
        const dateFilterSQL = hasDateFilter
            ? 'AND effective_date >= ? AND effective_date <= ?'
            : `AND effective_date >= ${SQL.dateAgo(12, 'months')}`;
        const dateParams = hasDateFilter ? [start_date, end_date] : [];

        // 1. Products by Supplier (Pie/Doughnut Chart)
        const productsBySupplier = await getAll(`
            SELECT s.name as supplier_name, COUNT(p.id) as product_count
            FROM suppliers s
            LEFT JOIN products p ON s.id = p.supplier_id AND p.status = 'active'
            WHERE s.status = 'active'
            GROUP BY s.id
            ORDER BY product_count DESC
            LIMIT 10
        `);

        // 2. Monthly Price Updates (Line Chart)
        const monthlyUpdates = await getAll(`
            SELECT 
                ${SQL.yearMonth('effective_date')} as month,
                COUNT(*) as update_count,
                AVG(price) as avg_price
            FROM products
            WHERE effective_date IS NOT NULL 
            ${dateFilterSQL}
            AND status = 'active'
            GROUP BY ${SQL.yearMonth('effective_date')}
            ORDER BY month
        `, dateParams);

        // 3. Price Range Distribution (Bar Chart)
        const priceRanges = await getAll(`
            SELECT 
                CASE 
                    WHEN price < 100 THEN '0-100'
                    WHEN price < 500 THEN '100-500'
                    WHEN price < 1000 THEN '500-1000'
                    WHEN price < 5000 THEN '1000-5000'
                    ELSE '5000+'
                END as price_range,
                COUNT(*) as count
            FROM products
            WHERE price IS NOT NULL AND status = 'active'
            GROUP BY 1
            ORDER BY MIN(price)
        `);

        // 4. Products by Category (Bar Chart)
        const productsByCategory = await getAll(`
            SELECT 
                COALESCE(c.name, 'ไม่มีหมวดหมู่') as category_name,
                COUNT(DISTINCT pm.product_id) as product_count
            FROM product_groups pg
            LEFT JOIN categories c ON pg.category_id = c.id
            LEFT JOIN product_mapping pm ON pg.id = pm.product_group_id
            WHERE pg.status = 'active'
            GROUP BY c.id
            ORDER BY product_count DESC
        `);

        // 5. Top 5 Highest Prices (Bar Chart)
        const topPrices = await getAll(`
            SELECT p.product_name, p.price, s.name as supplier_name
            FROM products p
            JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.status = 'active' AND p.price IS NOT NULL
            ORDER BY p.price DESC
            LIMIT 5
        `);

        // 6. Recent Price Changes Trend (for mini sparkline)
        const recentPriceChanges = await getAll(`
            SELECT 
                ph.effective_date as date,
                AVG(ph.price) as avg_price
            FROM price_history ph
            WHERE ph.effective_date >= ${SQL.dateAgo(30, 'days')}
            GROUP BY ph.effective_date
            ORDER BY date
        `);

        // 7. Average Price Trend (Line Chart - different from monthly updates)
        const avgPriceTrend = await getAll(`
            SELECT 
                ${SQL.yearMonth('effective_date')} as month,
                AVG(price) as avg_price,
                MIN(price) as min_price,
                MAX(price) as max_price
            FROM products
            WHERE effective_date IS NOT NULL 
            ${dateFilterSQL}
            AND status = 'active' AND price IS NOT NULL
            GROUP BY ${SQL.yearMonth('effective_date')}
            ORDER BY month
        `, dateParams);

        // 8. Supplier Activity (Bar Chart - updates per supplier)
        const supplierActivity = await getAll(`
            SELECT 
                s.name as supplier_name,
                COUNT(ph.id) as update_count
            FROM suppliers s
            LEFT JOIN products p ON s.id = p.supplier_id
            LEFT JOIN price_history ph ON p.id = ph.product_id
            WHERE s.status = 'active'
            GROUP BY s.id
            ORDER BY update_count DESC
            LIMIT 8
        `);

        // 9. Mapped vs Unmapped Products (Pie Chart)
        const mappingStatus = await getAll(`
            SELECT 
                CASE WHEN pm.id IS NOT NULL THEN 'จับคู่แล้ว' ELSE 'ยังไม่จับคู่' END as status,
                COUNT(p.id) as count
            FROM products p
            LEFT JOIN product_mapping pm ON p.id = pm.product_id
            WHERE p.status = 'active'
            GROUP BY CASE WHEN pm.id IS NOT NULL THEN 'จับคู่แล้ว' ELSE 'ยังไม่จับคู่' END
        `);

        // 10. Lowest Price Products (Horizontal Bar - opposite of top prices)
        const lowestPrices = await getAll(`
            SELECT p.product_name, p.price, s.name as supplier_name
            FROM products p
            JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.status = 'active' AND p.price IS NOT NULL AND p.price > 0
            ORDER BY p.price ASC
            LIMIT 5
        `);

        res.json({
            productsBySupplier,
            monthlyUpdates,
            priceRanges,
            productsByCategory,
            topPrices,
            recentPriceChanges,
            avgPriceTrend,
            supplierActivity,
            mappingStatus,
            lowestPrices
        });
    } catch (err) {
        console.error('Dashboard charts error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลกราฟ' });
    }
});

// Top 10 Volatile Products (Feature 5)
router.get('/top-volatile', async (req, res) => {
    try {
        const volatile = await getAll(`
            SELECT 
                p.id,
                p.product_name,
                p.product_code,
                s.name as supplier_name,
                COUNT(ph.id) as history_count,
                MIN(ph.price) as min_price,
                MAX(ph.price) as max_price,
                AVG(ph.price) as avg_price,
                ROUND(
                    (MAX(ph.price) - MIN(ph.price)) * 100.0 / 
                    CASE WHEN AVG(ph.price) = 0 THEN 1 ELSE AVG(ph.price) END
                , 2) as volatility_pct
            FROM products p
            JOIN price_history ph ON p.id = ph.product_id
            JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.status = 'active'
            GROUP BY p.id
            HAVING COUNT(ph.id) >= 2
            ORDER BY volatility_pct DESC
            LIMIT 10
        `);
        res.json({ volatile });
    } catch (err) {
        console.error('Top volatile error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

// Export all data to Excel with multiple sheets
router.get('/export-all', async (req, res) => {
    try {
        // Sheet 1: All Products (สินค้า)
        const products = await getAll(`
            SELECT 
                p.product_code as 'รหัสสินค้า',
                p.product_name as 'ชื่อสินค้า',
                s.name as 'Supplier',
                p.price as 'ราคา',
                p.unit as 'หน่วย',
                p.effective_date as 'วันที่มีผล',
                p.status as 'สถานะ',
                COALESCE(pg.master_code, '-') as 'รหัสกลุ่มสินค้า',
                COALESCE(pg.master_name, '-') as 'ชื่อกลุ่มสินค้า'
            FROM products p
            JOIN suppliers s ON p.supplier_id = s.id
            LEFT JOIN product_mapping pm ON p.id = pm.product_id
            LEFT JOIN product_groups pg ON pm.product_group_id = pg.id
            WHERE p.status = 'active'
            ORDER BY s.name, p.product_name
        `);

        // Sheet 2: Master Codes (รหัสกลุ่มสินค้า)
        const masterCodes = await getAll(`
            SELECT 
                pg.master_code as 'รหัสกลุ่มสินค้า',
                pg.master_name as 'ชื่อกลุ่มสินค้า',
                COALESCE(c.name, '-') as 'หมวดหมู่',
                pg.unit as 'หน่วย',
                pg.specification as 'รายละเอียด',
                (SELECT COUNT(*) FROM product_mapping pm WHERE pm.product_group_id = pg.id) as 'จำนวนสินค้าที่จับคู่',
                pg.status as 'สถานะ'
            FROM product_groups pg
            LEFT JOIN categories c ON pg.category_id = c.id
            ORDER BY pg.master_code
        `);

        // Sheet 3: Price History (ประวัติราคา)
        const priceHistory = await getAll(`
            SELECT 
                p.product_code as 'รหัสสินค้า',
                p.product_name as 'ชื่อสินค้า',
                s.name as 'Supplier',
                ph.price as 'ราคา',
                ph.effective_date as 'วันที่มีผล',
                ph.source as 'แหล่งที่มา'
            FROM price_history ph
            JOIN products p ON ph.product_id = p.id
            JOIN suppliers s ON p.supplier_id = s.id
            ORDER BY ph.effective_date DESC, s.name
            LIMIT 5000
        `);

        // Create workbook with multiple sheets
        const workbook = XLSX.utils.book_new();

        // Add sheets
        const productsSheet = XLSX.utils.json_to_sheet(products);
        XLSX.utils.book_append_sheet(workbook, productsSheet, 'สินค้าทั้งหมด');

        const masterCodesSheet = XLSX.utils.json_to_sheet(masterCodes);
        XLSX.utils.book_append_sheet(workbook, masterCodesSheet, 'รหัสกลุ่มสินค้า');

        const priceHistorySheet = XLSX.utils.json_to_sheet(priceHistory);
        XLSX.utils.book_append_sheet(workbook, priceHistorySheet, 'ประวัติราคา');

        // Generate buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Set headers for download
        const filename = `Export_${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการ export ข้อมูล' });
    }
});

// Get all suppliers
router.get('/suppliers', async (req, res) => {
    try {
        const suppliers = await getAll(`
            SELECT s.*, 
                   (SELECT COUNT(*) FROM products WHERE supplier_id = s.id AND status = 'active') as product_count,
                   (SELECT MAX(updated_at) FROM products WHERE supplier_id = s.id) as last_update
            FROM suppliers s
            WHERE s.status = 'active'
            ORDER BY s.name
        `);

        res.json({ suppliers });
    } catch (err) {
        console.error('Get suppliers error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล suppliers' });
    }
});

// Get all products from all suppliers (for admin/buyer)
router.get('/all-products', async (req, res) => {
    try {
        const { search, supplier_id, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = "WHERE p.status = 'active'";
        let params = [];

        if (search) {
            whereClause += " AND (p.product_name LIKE ? OR p.product_code LIKE ? OR s.name LIKE ?)";
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        if (supplier_id) {
            whereClause += " AND p.supplier_id = ?";
            params.push(supplier_id);
        }

        // Get total count
        const countResult = await getOne(`
            SELECT COUNT(*) as total 
            FROM products p
            JOIN suppliers s ON p.supplier_id = s.id
            ${whereClause}
        `, params);

        // Get products with supplier info
        const products = await getAll(`
            SELECT 
                p.id, p.product_code, p.product_name, p.price, p.unit, 
                p.effective_date, p.remark, p.updated_at,
                s.id as supplier_id, s.name as supplier_name, s.code as supplier_code
            FROM products p
            JOIN suppliers s ON p.supplier_id = s.id
            ${whereClause}
            ORDER BY p.updated_at DESC
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit), parseInt(offset)]);

        res.json({
            products,
            pagination: {
                total: countResult.total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(countResult.total / limit)
            }
        });
    } catch (err) {
        console.error('Get all products error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสินค้า' });
    }
});

// Get product groups (master products)
router.get('/product-groups', async (req, res) => {
    try {
        const groups = await getAll(`
            SELECT pg.*, c.name as category_name,
                   (SELECT COUNT(*) FROM product_mapping pm WHERE pm.product_group_id = pg.id) as product_count
            FROM product_groups pg
            LEFT JOIN categories c ON pg.category_id = c.id
            WHERE pg.status = 'active'
            ORDER BY pg.master_name
        `);

        res.json({ groups });
    } catch (err) {
        console.error('Get product groups error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลกลุ่มสินค้า' });
    }
});

// Get single product group with mapped products
router.get('/product-groups/:id', async (req, res) => {
    try {
        const group = await getOne(`
            SELECT pg.*, c.name as category_name
            FROM product_groups pg
            LEFT JOIN categories c ON pg.category_id = c.id
            WHERE pg.id = ?
        `, [req.params.id]);

        if (!group) {
            return res.status(404).json({ error: 'ไม่พบกลุ่มสินค้า' });
        }

        const mappedProducts = await getAll(`
            SELECT p.*, s.name as supplier_name, s.code as supplier_code
            FROM products p
            JOIN product_mapping pm ON p.id = pm.product_id
            JOIN suppliers s ON p.supplier_id = s.id
            WHERE pm.product_group_id = ?
            ORDER BY s.name, p.product_name
        `, [req.params.id]);

        res.json({ group, mappedProducts });
    } catch (err) {
        console.error('Get product group error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลกลุ่มสินค้า' });
    }
});

// Create product group
router.post('/product-groups', async (req, res) => {
    try {
        const { master_code, master_name, category_id, unit, specification } = req.body;

        if (!master_code || !master_name) {
            return res.status(400).json({ error: 'กรุณากรอกรหัสและชื่อกลุ่มสินค้า' });
        }

        const existing = await getOne(
            'SELECT id FROM product_groups WHERE master_code = ?', [master_code]
        );

        if (existing) {
            return res.status(400).json({ error: 'รหัสกลุ่มสินค้านี้มีอยู่แล้ว' });
        }

        const result = await runQuery(`
            INSERT INTO product_groups (master_code, master_name, category_id, unit, specification, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [master_code, master_name, category_id || null, unit || null, specification || null, req.session.user.id]);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'CREATE', 'product_group', result.lastID, `Created product group ${master_code}`]
        );

        res.json({ success: true, id: result.lastID, message: 'สร้างกลุ่มสินค้าเรียบร้อย' });
    } catch (err) {
        console.error('Create product group error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างกลุ่มสินค้า' });
    }
});

// Update product group
router.put('/product-groups/:id', async (req, res) => {
    try {
        const { master_name, category_id, unit, specification, status } = req.body;

        await runQuery(`
            UPDATE product_groups 
            SET master_name = ?, category_id = ?, unit = ?, specification = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [master_name, category_id || null, unit || null, specification || null, status || 'active', req.params.id]);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'UPDATE', 'product_group', req.params.id, `Updated product group`]
        );

        res.json({ success: true, message: 'อัพเดตกลุ่มสินค้าเรียบร้อย' });
    } catch (err) {
        console.error('Update product group error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัพเดตกลุ่มสินค้า' });
    }
});

// Delete product group (products will become unmapped)
router.delete('/product-groups/:id', async (req, res) => {
    try {
        const group = await getOne('SELECT * FROM product_groups WHERE id = ?', [req.params.id]);

        if (!group) {
            return res.status(404).json({ error: 'ไม่พบกลุ่มสินค้า' });
        }

        // Count products that will become unmapped
        const mappedCount = await getOne(
            'SELECT COUNT(*) as count FROM product_mapping WHERE product_group_id = ?',
            [req.params.id]
        );

        // Remove all product mappings for this group (products become unmapped)
        await runQuery('DELETE FROM product_mapping WHERE product_group_id = ?', [req.params.id]);

        // Delete the product group
        await runQuery('DELETE FROM product_groups WHERE id = ?', [req.params.id]);

        // Log the action
        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'DELETE', 'product_group', req.params.id,
            `Deleted product group ${group.master_code}, ${mappedCount.count} products became unmapped`]
        );

        res.json({
            success: true,
            message: `ลบกลุ่มสินค้าเรียบร้อย สินค้า ${mappedCount.count} รายการย้ายไปสินค้าที่ยังไม่จัดกลุ่ม`
        });
    } catch (err) {
        console.error('Delete product group error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบกลุ่มสินค้า' });
    }
});

// Get categories
router.get('/categories', async (req, res) => {
    try {
        const categories = await getAll('SELECT * FROM categories ORDER BY name');
        res.json({ categories });
    } catch (err) {
        console.error('Get categories error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลหมวดหมู่' });
    }
});

// Get unmapped products
router.get('/unmapped-products', async (req, res) => {
    try {
        const products = await getAll(`
            SELECT p.*, s.name as supplier_name, s.code as supplier_code
            FROM products p
            JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.status = 'active' AND NOT EXISTS (
                SELECT 1 FROM product_mapping pm WHERE pm.product_id = p.id
            )
            ORDER BY s.name, p.product_name
        `);

        res.json({ products });
    } catch (err) {
        console.error('Get unmapped products error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

// Map products to group
router.post('/mapping', async (req, res) => {
    try {
        const { product_ids, product_group_id } = req.body;

        if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
            return res.status(400).json({ error: 'กรุณาเลือกสินค้าที่ต้องการ map' });
        }

        if (!product_group_id) {
            return res.status(400).json({ error: 'กรุณาเลือกกลุ่มสินค้า' });
        }

        let mappedCount = 0;
        for (const productId of product_ids) {
            // Check if already mapped
            const existing = await getOne(
                'SELECT id FROM product_mapping WHERE product_id = ?', [productId]
            );

            if (existing) {
                // Update mapping
                await runQuery(
                    'UPDATE product_mapping SET product_group_id = ?, mapped_by = ?, mapped_at = CURRENT_TIMESTAMP WHERE product_id = ?',
                    [product_group_id, req.session.user.id, productId]
                );
            } else {
                // Create new mapping
                await runQuery(
                    'INSERT INTO product_mapping (product_id, product_group_id, mapped_by) VALUES (?, ?, ?)',
                    [productId, product_group_id, req.session.user.id]
                );
            }
            mappedCount++;
        }

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'MAP', 'product_mapping', product_group_id, `Mapped ${mappedCount} products to group`]
        );

        res.json({ success: true, message: `Map สินค้า ${mappedCount} รายการเรียบร้อย` });
    } catch (err) {
        console.error('Map products error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการ map สินค้า' });
    }
});

// Remove product mapping
router.delete('/mapping/:productId', async (req, res) => {
    try {
        await runQuery('DELETE FROM product_mapping WHERE product_id = ?', [req.params.productId]);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'UNMAP', 'product_mapping', req.params.productId, 'Removed product mapping']
        );

        res.json({ success: true, message: 'ยกเลิก mapping เรียบร้อย' });
    } catch (err) {
        console.error('Remove mapping error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการยกเลิก mapping' });
    }
});

// Delete a product (and its price history)
router.delete('/products/:id', async (req, res) => {
    try {
        const productId = req.params.id;

        // Get product info for logging
        const product = await getOne('SELECT * FROM products WHERE id = ?', [productId]);
        if (!product) {
            return res.status(404).json({ error: 'ไม่พบสินค้า' });
        }

        // Delete related data first
        await runQuery('DELETE FROM price_history WHERE product_id = ?', [productId]);
        await runQuery('DELETE FROM product_mapping WHERE product_id = ?', [productId]);
        await runQuery('DELETE FROM products WHERE id = ?', [productId]);

        // Log the action
        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user?.id, 'DELETE', 'products', productId, `Deleted product: ${product.product_name}`]
        );

        res.json({ success: true, message: 'ลบสินค้าสำเร็จ' });
    } catch (err) {
        console.error('Delete product error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบสินค้า' });
    }
});

// Get price history for a specific product
router.get('/products/:id/price-history', async (req, res) => {
    try {
        const productId = req.params.id;

        const product = await getOne('SELECT * FROM products WHERE id = ?', [productId]);
        const history = await getAll(`
            SELECT * FROM price_history 
            WHERE product_id = ? 
            ORDER BY effective_date DESC
        `, [productId]);

        res.json({ product, history });
    } catch (err) {
        console.error('Get price history error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงประวัติราคา' });
    }
});

// Delete all price history for a product
router.delete('/products/:id/price-history', async (req, res) => {
    try {
        const productId = req.params.id;

        await runQuery('DELETE FROM price_history WHERE product_id = ?', [productId]);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user?.id, 'DELETE', 'price_history', productId, 'Deleted all price history']
        );

        res.json({ success: true, message: 'ลบประวัติราคาทั้งหมดสำเร็จ' });
    } catch (err) {
        console.error('Delete all price history error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบประวัติราคา' });
    }
});

// Delete a single price history entry
router.delete('/price-history/:id', async (req, res) => {
    try {
        const historyId = req.params.id;

        await runQuery('DELETE FROM price_history WHERE id = ?', [historyId]);

        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) {
        console.error('Delete price history entry error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบรายการ' });
    }
});

// Get price comparison
router.get('/price-comparison', async (req, res) => {
    try {
        const { category_id, group_id } = req.query;

        let query = `
            SELECT pg.id as group_id, pg.master_code, pg.master_name, pg.unit,
                   c.name as category_name
            FROM product_groups pg
            LEFT JOIN categories c ON pg.category_id = c.id
            WHERE pg.status = 'active'
        `;
        const params = [];

        if (category_id) {
            query += ' AND pg.category_id = ?';
            params.push(category_id);
        }
        if (group_id) {
            query += ' AND pg.id = ?';
            params.push(group_id);
        }

        query += ' ORDER BY pg.master_name';

        const groups = await getAll(query, params);

        // Get all active suppliers
        const suppliers = await getAll(
            'SELECT id, code, name FROM suppliers WHERE status = ? ORDER BY name', ['active']
        );

        // Get price data for each group
        const comparison = [];
        for (const group of groups) {
            const priceData = await getAll(`
                SELECT p.id, p.product_code, p.product_name, p.price, p.unit, p.effective_date, p.supplier_id,
                       s.code as supplier_code, s.name as supplier_name
                FROM products p
                JOIN product_mapping pm ON p.id = pm.product_id
                JOIN suppliers s ON p.supplier_id = s.id
                WHERE pm.product_group_id = ? AND p.status = 'active'
            `, [group.group_id]);

            const prices = priceData.map(p => p.price).filter(p => p > 0);
            const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
            const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
            const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

            comparison.push({
                ...group,
                supplierPrices: priceData,
                stats: {
                    average: Math.round(avgPrice * 100) / 100,
                    min: minPrice,
                    max: maxPrice,
                    count: priceData.length
                }
            });
        }

        res.json({ comparison, suppliers });
    } catch (err) {
        console.error('Price comparison error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลเปรียบเทียบราคา' });
    }
});

// Update product code
router.put('/products/:id/code', async (req, res) => {
    try {
        const { product_code } = req.body;
        const productId = req.params.id;

        if (!product_code) {
            return res.status(400).json({ error: 'กรุณากรอกรหัสสินค้า' });
        }

        const product = await getOne('SELECT * FROM products WHERE id = ?', [productId]);
        if (!product) {
            return res.status(404).json({ error: 'ไม่พบสินค้า' });
        }

        await runQuery('UPDATE products SET product_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [product_code, productId]);

        res.json({ success: true, message: 'อัพเดทรหัสสินค้าสำเร็จ' });
    } catch (err) {
        console.error('Update product code error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัพเดทรหัสสินค้า' });
    }
});

// Get price comparison chart data
router.get('/price-comparison/:groupId/chart', async (req, res) => {
    try {
        const group = await getOne('SELECT * FROM product_groups WHERE id = ?', [req.params.groupId]);

        if (!group) {
            return res.status(404).json({ error: 'ไม่พบกลุ่มสินค้า' });
        }

        // Get mapped products with current price
        const products = await getAll(`
            SELECT p.id, p.product_code, p.product_name, p.price, p.effective_date, p.updated_at,
                   s.name as supplier_name, s.code as supplier_code
            FROM products p
            JOIN product_mapping pm ON p.id = pm.product_id
            JOIN suppliers s ON p.supplier_id = s.id
            WHERE pm.product_group_id = ? AND p.status = 'active'
        `, [req.params.groupId]);

        // Calculate 30 days ago for "current" threshold
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Get price history for each product (last 12 months)
        const chartData = [];
        for (const product of products) {
            const history = await getAll(`
                SELECT price, effective_date
                FROM price_history
                WHERE product_id = ? AND effective_date >= ${SQL.dateAgo(12, 'months')}
                ORDER BY effective_date ASC
            `, [product.id]);

            // Determine last update date
            let lastUpdateDate = product.effective_date || product.updated_at;
            if (history.length > 0) {
                lastUpdateDate = history[history.length - 1].effective_date;
            }

            // Calculate if outdated (more than 30 days)
            const lastUpdate = new Date(lastUpdateDate);
            const isOutdated = lastUpdate < thirtyDaysAgo;
            const daysSinceUpdate = Math.floor((new Date() - lastUpdate) / (1000 * 60 * 60 * 24));

            // If no history, use current price as single data point
            let priceHistory = history;
            if (history.length === 0 && product.price) {
                priceHistory = [{
                    price: product.price,
                    effective_date: lastUpdateDate || new Date().toISOString().split('T')[0]
                }];
            }

            chartData.push({
                productId: product.id,
                productCode: product.product_code,
                supplier: product.supplier_name,
                supplierCode: product.supplier_code,
                productName: product.product_name,
                currentPrice: product.price,
                lastUpdateDate: lastUpdateDate,
                daysSinceUpdate: daysSinceUpdate,
                isOutdated: isOutdated,
                history: priceHistory
            });
        }

        res.json({ group, chartData });
    } catch (err) {
        console.error('Chart data error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลกราฟ' });
    }
});

// Export price comparison to Excel
router.get('/export', async (req, res) => {
    try {
        const { category_id } = req.query;

        let query = `
            SELECT pg.master_code, pg.master_name, pg.unit as master_unit,
                   c.name as category_name,
                   p.product_code, p.product_name, p.price, p.unit, p.effective_date,
                   s.code as supplier_code, s.name as supplier_name
            FROM product_groups pg
            LEFT JOIN categories c ON pg.category_id = c.id
            LEFT JOIN product_mapping pm ON pg.id = pm.product_group_id
            LEFT JOIN products p ON pm.product_id = p.id
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            WHERE pg.status = 'active'
        `;
        const params = [];

        if (category_id) {
            query += ' AND pg.category_id = ?';
            params.push(category_id);
        }

        query += ' ORDER BY pg.master_name, s.name';

        const data = await getAll(query, params);

        const wb = XLSX.utils.book_new();

        // Create price comparison sheet
        const headers = ['รหัสมาตรฐาน', 'ชื่อสินค้ามาตรฐาน', 'หมวดหมู่', 'Supplier', 'รหัสสินค้า Supplier', 'ชื่อสินค้า Supplier', 'ราคา', 'หน่วย', 'วันที่อัพเดต'];
        const rows = data.map(row => [
            row.master_code,
            row.master_name,
            row.category_name || '',
            row.supplier_name || '',
            row.product_code || '',
            row.product_name || '',
            row.price || '',
            row.unit || '',
            row.effective_date || ''
        ]);

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws['!cols'] = [
            { wch: 15 }, { wch: 35 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 35 }, { wch: 12 }, { wch: 10 }, { wch: 15 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Price Comparison');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const date = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=price_comparison_${date}.xlsx`);
        res.send(buffer);
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการ export' });
    }
});

// Get suggestion for auto-mapping (based on name similarity)
router.get('/mapping-suggestions', async (req, res) => {
    try {
        const unmapped = await getAll(`
            SELECT p.id, p.product_name, s.name as supplier_name
            FROM products p
            JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.status = 'active' AND NOT EXISTS (
                SELECT 1 FROM product_mapping pm WHERE pm.product_id = p.id
            )
        `);

        const groups = await getAll('SELECT id, master_name FROM product_groups WHERE status = ?', ['active']);

        const suggestions = [];
        for (const product of unmapped) {
            for (const group of groups) {
                const similarity = calculateSimilarity(product.product_name.toLowerCase(), group.master_name.toLowerCase());
                if (similarity >= 0.5) {
                    suggestions.push({
                        product_id: product.id,
                        product_name: product.product_name,
                        supplier_name: product.supplier_name,
                        group_id: group.id,
                        group_name: group.master_name,
                        similarity: Math.round(similarity * 100)
                    });
                }
            }
        }

        // Sort by similarity descending
        suggestions.sort((a, b) => b.similarity - a.similarity);

        res.json({ suggestions: suggestions.slice(0, 50) });
    } catch (err) {
        console.error('Suggestions error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการหาคำแนะนำ' });
    }
});

// Simple string similarity function
function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const costs = [];
    for (let i = 0; i <= shorter.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= longer.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else if (j > 0) {
                let newValue = costs[j - 1];
                if (shorter[i - 1] !== longer[j - 1]) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[longer.length] = lastValue;
    }

    return (longer.length - costs[longer.length]) / longer.length;
}

// ==================== Price History API ====================

// Get all products with price history (for history list page)
router.get('/price-history', async (req, res) => {
    try {
        const { supplier_id, search, page = 1, limit = 20 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        let baseQuery = `
            FROM products p
            JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.status = 'active'
        `;
        const params = [];

        if (supplier_id) {
            baseQuery += ' AND p.supplier_id = ?';
            params.push(supplier_id);
        }

        if (search) {
            baseQuery += ' AND (p.product_name LIKE ? OR p.product_code LIKE ? OR s.name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        // Get total count
        const countQuery = `SELECT COUNT(*) as count ${baseQuery}`;
        const countResult = await getOne(countQuery, params);
        const total = countResult.count;
        const totalPages = Math.ceil(total / limitNum);

        // Get paginated products
        const query = `
            SELECT p.id, p.product_code, p.product_name, p.price, p.unit, p.effective_date,
                   s.id as supplier_id, s.code as supplier_code, s.name as supplier_name,
                   (SELECT COUNT(*) FROM price_history ph WHERE ph.product_id = p.id) as history_count
            ${baseQuery}
            ORDER BY s.name, p.product_name
            LIMIT ? OFFSET ?
        `;
        const products = await getAll(query, [...params, limitNum, offset]);

        res.json({ products, total, totalPages, page: pageNum, limit: limitNum });
    } catch (err) {
        console.error('Price history list error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติราคา' });
    }
});

// Get single product price history detail
router.get('/price-history/:productId', async (req, res) => {
    try {
        const product = await getOne(`
            SELECT p.*, s.name as supplier_name, s.code as supplier_code
            FROM products p
            JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.id = ?
        `, [req.params.productId]);

        if (!product) {
            return res.status(404).json({ error: 'ไม่พบสินค้า' });
        }

        // Get price history (last 12 months)
        const history = await getAll(`
            SELECT price, effective_date, source
            FROM price_history
            WHERE product_id = ?
            ORDER BY effective_date DESC
        `, [req.params.productId]);

        // Calculate stats - use history for accuracy
        const prices = history.map(h => h.price).filter(p => p > 0);
        const latestPrice = history.length > 0 ? history[0].price : (product.price || 0);
        const stats = {
            min: prices.length > 0 ? Math.min(...prices) : 0,
            max: prices.length > 0 ? Math.max(...prices) : 0,
            average: prices.length > 0 ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100 : 0,
            current: latestPrice,
            count: history.length
        };

        res.json({ product, history, stats });
    } catch (err) {
        console.error('Price history detail error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติราคา' });
    }
});

// ==================== Admin/Buyer Import ====================

// Download Excel template for Admin/Buyer (adminandbuyer.xlsx format)
router.get('/import/template', (req, res) => {
    try {
        const wb = XLSX.utils.book_new();

        // Create template matching adminandbuyer.xlsx format
        const headers = [
            ['supplier_name', 'supplier_product_code', 'product_name', 'description', 'price', 'Currency', 'unit', 'effective_date', 'notes'],
            ['บริษัท ABC จำกัด', '', 'สินค้าตัวอย่าง', 'รายละเอียดสินค้า', 100, 'THB', 'ชิ้น', '2026-01-31', 'หมายเหตุ']
        ];

        const ws = XLSX.utils.aoa_to_sheet(headers);

        // Set column widths
        ws['!cols'] = [
            { wch: 30 }, { wch: 25 }, { wch: 35 }, { wch: 40 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 30 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Import Template');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=admin_import_template.xlsx');
        res.send(buffer);
    } catch (err) {
        console.error('Template download error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้าง template' });
    }
});

// Upload Excel for preview - adminandbuyer.xlsx format
// Headers: supplier_name, supplier_product_code, product_name, description, price, Currency, unit, effective_date, notes
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

        // Get all suppliers for lookup
        const suppliers = await getAll('SELECT id, name FROM suppliers WHERE status = ?', ['active']);
        const supplierMap = {};
        suppliers.forEach(s => {
            supplierMap[s.name.toLowerCase().trim()] = s.id;
        });

        // Track newly created suppliers
        const newSuppliers = [];

        const headers = data[0];
        const rows = data.slice(1).filter(row => row.length > 0 && (row[0] || row[2])); // Must have supplier or product name

        const preview = [];
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // Excel row number

            // Map to adminandbuyer.xlsx format: supplier_name, supplier_product_code, product_name, description, price, Currency, unit, effective_date, notes
            const supplierName = row[0]?.toString().trim() || '';
            let supplierId = supplierMap[supplierName.toLowerCase()];

            // Auto-create supplier if not found
            if (supplierName && !supplierId) {
                try {
                    // Generate code from supplier name (remove spaces, take first 10 chars)
                    const supplierCode = supplierName.replace(/\s+/g, '-').substring(0, 20).toUpperCase() + '-' + Date.now().toString().slice(-4);

                    const result = await runQuery(
                        'INSERT INTO suppliers (code, name, status) VALUES (?, ?, ?)',
                        [supplierCode, supplierName, 'active']
                    );
                    supplierId = result.lastID;

                    // Add to map for future rows
                    supplierMap[supplierName.toLowerCase()] = supplierId;
                    newSuppliers.push({ name: supplierName, code: supplierCode, id: supplierId });

                    console.log(`Auto-created supplier: ${supplierName} (ID: ${supplierId})`);
                } catch (err) {
                    console.error(`Failed to create supplier ${supplierName}:`, err);
                }
            }

            // Get product code from Excel or lookup by name + supplier
            let productCode = row[1]?.toString().trim() || '';
            const productName = row[2]?.toString().trim() || '';
            let existingProductId = null;

            // If no product code provided, try to find existing product by name + supplier
            if (!productCode && productName && supplierId) {
                const existingProduct = await getOne(
                    'SELECT id, product_code FROM products WHERE supplier_id = ? AND LOWER(product_name) = LOWER(?) AND status = ?',
                    [supplierId, productName, 'active']
                );
                if (existingProduct) {
                    productCode = existingProduct.product_code;
                    existingProductId = existingProduct.id;
                } else {
                    // Generate new code only if product doesn't exist
                    productCode = `AUTO-${Date.now()}-${i}`;
                }
            } else if (!productCode) {
                productCode = `AUTO-${Date.now()}-${i}`;
            }

            const item = {
                row: rowNum,
                supplier_name: supplierName,
                supplier_id: supplierId || null,
                product_code: productCode,
                product_name: productName,
                existing_product_id: existingProductId, // Track if this is an update
                description: row[3]?.toString().trim() || '',
                price: parseFloat(row[4]) || 0,
                currency: row[5]?.toString().trim() || 'THB',
                unit: row[6]?.toString().trim() || '',
                effective_date: '',
                remark: row[8]?.toString().trim() || '',
                isValid: true,
                errors: []
            };

            // Parse date
            if (row[7]) {
                let dateValue = row[7];
                if (typeof dateValue === 'number') {
                    const date = XLSX.SSF.parse_date_code(dateValue);
                    item.effective_date = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
                } else if (dateValue instanceof Date) {
                    item.effective_date = dateValue.toISOString().split('T')[0];
                } else if (typeof dateValue === 'string') {
                    if (dateValue.includes('/')) {
                        const parts = dateValue.split('/');
                        if (parts.length === 3) {
                            item.effective_date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                        }
                    } else {
                        item.effective_date = dateValue;
                    }
                }
            }

            // Validate
            if (!item.supplier_name) {
                item.isValid = false;
                item.errors.push('ไม่มีชื่อ Supplier');
            } else if (!item.supplier_id) {
                item.isValid = false;
                item.errors.push(`ไม่สามารถสร้าง Supplier "${item.supplier_name}" อัตโนมัติได้`);
            }
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
            errors,
            suppliers: suppliers.map(s => s.name)
        });
    } catch (err) {
        console.error('Import preview error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอ่านไฟล์ Excel' });
    }
});

// Confirm import for Admin/Buyer
router.post('/import/confirm', async (req, res) => {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'ไม่มีข้อมูลสำหรับ import' });
        }

        let successCount = 0;
        let updateCount = 0;
        const effectiveDate = new Date().toISOString().split('T')[0];

        for (const item of items) {
            if (!item.isValid || !item.supplier_id) continue;

            // Check if product exists for this supplier
            const existing = await getOne(
                'SELECT id, price FROM products WHERE supplier_id = ? AND product_code = ?',
                [item.supplier_id, item.product_code]
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
                        VALUES (?, ?, ?, 'admin_import')
                    `, [existing.id, item.price, item.effective_date || effectiveDate]);
                }
                updateCount++;
            } else {
                // Insert new product
                const result = await runQuery(`
                    INSERT INTO products (supplier_id, product_code, product_name, price, unit, effective_date, remark, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
                `, [item.supplier_id, item.product_code, item.product_name, item.price, item.unit, item.effective_date || effectiveDate, item.remark]);

                // Add to price history
                await runQuery(`
                    INSERT INTO price_history (product_id, price, effective_date, source)
                    VALUES (?, ?, ?, 'admin_import')
                `, [result.lastID, item.price, item.effective_date || effectiveDate]);
                successCount++;
            }
        }

        // Log import
        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, details) VALUES (?, ?, ?, ?)',
            [req.session.user.id, 'IMPORT', 'products', `Admin imported ${successCount} new, updated ${updateCount} products`]
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

// ==================== Supplier Management (Admin & Buyer) ====================

// Get all suppliers
router.get('/manage-suppliers', async (req, res) => {
    try {
        const suppliers = await getAll(`
            SELECT s.*,
                   (SELECT COUNT(*) FROM users WHERE supplier_id = s.id AND status = 'active') as user_count,
                   (SELECT COUNT(*) FROM products WHERE supplier_id = s.id AND status = 'active') as product_count
            FROM suppliers s
            WHERE s.status != 'deleted'
            ORDER BY s.name
        `);
        res.json({ suppliers });
    } catch (err) {
        console.error('Get suppliers error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล Supplier' });
    }
});

// Create supplier
router.post('/manage-suppliers', async (req, res) => {
    try {
        const { code, name, address, contact_person, tel, email, tax_id } = req.body;

        if (!code || !name) {
            return res.status(400).json({ error: 'กรุณากรอกรหัสและชื่อ Supplier' });
        }

        const existing = await getOne('SELECT id FROM suppliers WHERE code = ?', [code]);
        if (existing) {
            return res.status(400).json({ error: 'รหัส Supplier นี้มีอยู่แล้ว' });
        }

        const result = await runQuery(`
            INSERT INTO suppliers (code, name, address, contact_person, tel, email, tax_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
        `, [code, name, address || null, contact_person || null, tel || null, email || null, tax_id || null]);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'CREATE', 'supplier', result.lastID, `Created supplier ${code}`]
        );

        res.json({ success: true, id: result.lastID, message: 'สร้าง Supplier เรียบร้อย' });
    } catch (err) {
        console.error('Create supplier error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้าง Supplier' });
    }
});

// Update supplier
router.put('/manage-suppliers/:id', async (req, res) => {
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
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัพเดต Supplier' });
    }
});

// Delete supplier (soft delete)
router.delete('/manage-suppliers/:id', async (req, res) => {
    try {
        // Check if supplier has products
        const products = await getOne(
            'SELECT COUNT(*) as count FROM products WHERE supplier_id = ? AND status = ?',
            [req.params.id, 'active']
        );

        if (products.count > 0) {
            return res.status(400).json({ error: `ไม่สามารถลบ Supplier ที่มีสินค้าอยู่ได้ (${products.count} รายการ)` });
        }

        await runQuery('UPDATE suppliers SET status = ? WHERE id = ?', ['deleted', req.params.id]);

        await runQuery(
            'INSERT INTO system_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, 'DELETE', 'supplier', req.params.id, 'Deleted supplier']
        );

        res.json({ success: true, message: 'ลบ Supplier เรียบร้อย' });
    } catch (err) {
        console.error('Delete supplier error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบ Supplier' });
    }
});

// ==================== Bulk Delete Products ====================
router.post('/bulk-delete-products', async (req, res) => {
    try {
        const { productIds } = req.body;
        if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({ error: 'กรุณาเลือกสินค้าที่ต้องการลบ' });
        }

        const placeholders = productIds.map(() => '?').join(',');

        // Delete related data first
        await runQuery(`DELETE FROM price_history WHERE product_id IN (${placeholders})`, productIds);
        await runQuery(`DELETE FROM product_mapping WHERE product_id IN (${placeholders})`, productIds);
        await runQuery(`DELETE FROM products WHERE id IN (${placeholders})`, productIds);

        res.json({ success: true, message: `ลบสินค้า ${productIds.length} รายการเรียบร้อย`, deletedCount: productIds.length });
    } catch (err) {
        console.error('Bulk delete products error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบสินค้า' });
    }
});

// ==================== Price Anomaly Detection ====================
router.get('/price-anomalies', async (req, res) => {
    try {
        const threshold = parseFloat(req.query.threshold) || 15; // default 15% change

        const anomalies = await getAll(`
            SELECT 
                ph.id,
                p.product_name,
                p.product_code,
                s.name as supplier_name,
                ph.price as new_price,
                ph.effective_date,
                prev.price as old_price,
                ROUND(ABS((ph.price - prev.price) / prev.price * 100), 2) as change_percent,
                CASE WHEN ph.price > prev.price THEN 'increase' ELSE 'decrease' END as direction
            FROM price_history ph
            JOIN products p ON ph.product_id = p.id
            JOIN suppliers s ON p.supplier_id = s.id
            JOIN price_history prev ON prev.product_id = ph.product_id 
                AND prev.effective_date = (
                    SELECT MAX(ph2.effective_date) 
                    FROM price_history ph2 
                    WHERE ph2.product_id = ph.product_id 
                    AND ph2.effective_date < ph.effective_date
                )
            WHERE p.status = 'active'
            AND ABS((ph.price - prev.price) / prev.price * 100) >= ?
            ORDER BY ph.effective_date DESC
            LIMIT 50
        `, [threshold]);

        res.json({ anomalies, threshold });
    } catch (err) {
        console.error('Price anomalies error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจจับราคาผิดปกติ' });
    }
});

// ==================== Reports Summary ====================
router.get('/reports/summary', async (req, res) => {
    try {
        // 1. Group price summary
        const groupSummary = await getAll(`
            SELECT 
                pg.id,
                pg.master_code,
                pg.master_name,
                c.name as category_name,
                COUNT(DISTINCT pm.product_id) as supplier_count,
                MIN(p.price) as min_price,
                MAX(p.price) as max_price,
                ROUND(AVG(p.price), 2) as avg_price,
                ROUND(MAX(p.price) - MIN(p.price), 2) as price_spread,
                ROUND((MAX(p.price) - MIN(p.price)) / NULLIF(MIN(p.price), 0) * 100, 2) as spread_percent
            FROM product_groups pg
            LEFT JOIN categories c ON pg.category_id = c.id
            LEFT JOIN product_mapping pm ON pg.id = pm.product_group_id
            LEFT JOIN products p ON pm.product_id = p.id AND p.status = 'active'
            WHERE pg.status = 'active'
            GROUP BY pg.id, pg.master_code, pg.master_name, c.name
            HAVING COUNT(DISTINCT pm.product_id) > 0
            ORDER BY 10 DESC
        `);

        // 2. Supplier ranking (by average price competitiveness)
        const supplierRanking = await getAll(`
            SELECT 
                s.id,
                s.name,
                s.code,
                COUNT(p.id) as product_count,
                ROUND(AVG(p.price), 2) as avg_price,
                SUM(CASE WHEN p.price = (
                    SELECT MIN(p2.price) FROM products p2
                    JOIN product_mapping pm2 ON p2.id = pm2.product_id
                    JOIN product_mapping pm3 ON pm3.product_group_id = pm2.product_group_id
                    JOIN products p3 ON pm3.product_id = p3.id AND p3.status = 'active'
                    WHERE pm2.product_group_id = pm.product_group_id
                ) THEN 1 ELSE 0 END) as lowest_count,
                ROUND(SUM(CASE WHEN p.price = (
                    SELECT MIN(p2.price) FROM products p2
                    JOIN product_mapping pm2 ON p2.id = pm2.product_id
                    WHERE pm2.product_group_id = pm.product_group_id AND p2.status = 'active'
                ) THEN 1.0 ELSE 0 END) / NULLIF(COUNT(p.id), 0) * 100, 1) as win_rate
            FROM suppliers s
            JOIN products p ON s.id = p.supplier_id AND p.status = 'active'
            LEFT JOIN product_mapping pm ON p.id = pm.product_id
            WHERE s.status = 'active'
            GROUP BY s.id, s.name, s.code
            ORDER BY 7 DESC
        `);

        // 3. Recent anomalies count
        const anomalyCount = await getOne(`
            SELECT COUNT(*) as count FROM (
                SELECT ph.id
                FROM price_history ph
                JOIN products p ON ph.product_id = p.id
                JOIN price_history prev ON prev.product_id = ph.product_id 
                    AND prev.effective_date = (
                        SELECT MAX(ph2.effective_date) 
                        FROM price_history ph2 
                        WHERE ph2.product_id = ph.product_id 
                        AND ph2.effective_date < ph.effective_date
                    )
                WHERE p.status = 'active'
                AND ABS((ph.price - prev.price) / prev.price * 100) >= 15
                AND ph.effective_date >= ${SQL.dateAgo(30, 'days')}
            ) AS sub
        `);

        // 4. Overall stats
        const overallStats = await getOne(`
            SELECT 
                (SELECT COUNT(*) FROM product_groups WHERE status = 'active') as total_groups,
                (SELECT COUNT(*) FROM suppliers WHERE status = 'active') as total_suppliers,
                (SELECT COUNT(*) FROM products WHERE status = 'active') as total_products,
                (SELECT COUNT(*) FROM price_history) as total_history
        `);

        res.json({ groupSummary, supplierRanking, anomalyCount: anomalyCount.count, overallStats });
    } catch (err) {
        console.error('Reports summary error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างรายงาน' });
    }
});

module.exports = router;

