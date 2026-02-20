const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(DB_PATH);

// Product templates
const productTemplates = [
    { name: 'กรดซัลฟิวริก', unit: 'กก.', basePrice: 45, category: 3 },
    { name: 'กรดไฮโดรคลอริก', unit: 'ลิตร', basePrice: 35, category: 3 },
    { name: 'กรดไนตริก', unit: 'ลิตร', basePrice: 55, category: 3 },
    { name: 'กรดฟอสฟอริก', unit: 'กก.', basePrice: 40, category: 3 },
    { name: 'โซเดียมไฮดรอกไซด์', unit: 'กก.', basePrice: 32, category: 4 },
    { name: 'โพแทสเซียมไฮดรอกไซด์', unit: 'กก.', basePrice: 48, category: 4 },
    { name: 'แคลเซียมไฮดรอกไซด์', unit: 'กก.', basePrice: 25, category: 4 },
    { name: 'เมทานอล', unit: 'ลิตร', basePrice: 28, category: 5 },
    { name: 'เอทานอล', unit: 'ลิตร', basePrice: 38, category: 5 },
    { name: 'อะซิโตน', unit: 'ลิตร', basePrice: 42, category: 5 },
    { name: 'ไอโซโพรพิลแอลกอฮอล์', unit: 'ลิตร', basePrice: 45, category: 5 },
    { name: 'โทลูอีน', unit: 'ลิตร', basePrice: 50, category: 5 },
    { name: 'ไซลีน', unit: 'ลิตร', basePrice: 52, category: 5 },
    { name: 'สีอีพ็อกซี่', unit: 'กระป๋อง', basePrice: 850, category: 2 },
    { name: 'สีโพลียูรีเทน', unit: 'กระป๋อง', basePrice: 920, category: 2 },
    { name: 'ทินเนอร์', unit: 'ลิตร', basePrice: 65, category: 5 },
    { name: 'แลคเกอร์', unit: 'ลิตร', basePrice: 85, category: 2 },
    { name: 'ไฮโดรเจนเปอร์ออกไซด์', unit: 'ลิตร', basePrice: 75, category: 1 },
    { name: 'แอมโมเนีย', unit: 'ลิตร', basePrice: 30, category: 1 },
    { name: 'คลอรีน', unit: 'กก.', basePrice: 55, category: 1 },
    { name: 'ฟอร์มาลดีไฮด์', unit: 'ลิตร', basePrice: 40, category: 1 },
    { name: 'กลีเซอรอล', unit: 'ลิตร', basePrice: 95, category: 1 },
    { name: 'โซเดียมคาร์บอเนต', unit: 'กก.', basePrice: 22, category: 4 },
    { name: 'โซเดียมไบคาร์บอเนต', unit: 'กก.', basePrice: 18, category: 4 },
    { name: 'แคลเซียมคลอไรด์', unit: 'กก.', basePrice: 28, category: 1 },
    { name: 'แมกนีเซียมซัลเฟต', unit: 'กก.', basePrice: 35, category: 1 },
    { name: 'ซิงค์ออกไซด์', unit: 'กก.', basePrice: 120, category: 1 },
    { name: 'ไททาเนียมไดออกไซด์', unit: 'กก.', basePrice: 180, category: 1 },
    { name: 'คาร์บอนแบล็ค', unit: 'กก.', basePrice: 95, category: 1 },
    { name: 'ซิลิกา', unit: 'กก.', basePrice: 65, category: 1 },
    { name: 'แคลเซียมคาร์บอเนต', unit: 'กก.', basePrice: 15, category: 1 },
    { name: 'เบนทอไนท์', unit: 'กก.', basePrice: 25, category: 1 },
    { name: 'ยูเรีย', unit: 'กก.', basePrice: 20, category: 1 },
    { name: 'โพลีเอทิลีนไกลคอล', unit: 'กก.', basePrice: 140, category: 1 }
];

const suppliers = [
    { id: 1, prefix: 'ABC' },
    { id: 2, prefix: 'XYZ' },
    { id: 3, prefix: 'TC' }
];

const concentrations = ['95%', '98%', '99%', 'Industrial Grade', 'Lab Grade', 'Technical Grade'];

let insertedCount = 0;
const targetCount = 100;

console.log('🚀 Starting to seed database with mock data...\n');

const runQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const seedProducts = async () => {
    let productId = 10; // Start from 10 to avoid conflicts

    for (const supplier of suppliers) {
        for (const template of productTemplates) {
            if (insertedCount >= targetCount) break;

            const concentration = concentrations[Math.floor(Math.random() * concentrations.length)];
            const productCode = `${supplier.prefix}-${String(insertedCount + 1).padStart(3, '0')}`;
            const productName = `${template.name} ${concentration}`;
            const priceVariation = template.basePrice * (0.85 + Math.random() * 0.3);
            const price = Math.round(priceVariation * 100) / 100;
            const effectiveDate = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            try {
                const result = await runQuery(`
                    INSERT INTO products (supplier_id, product_code, product_name, price, unit, effective_date, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'active')
                `, [supplier.id, productCode, productName, price, template.unit, effectiveDate]);

                productId = result.lastID;

                // Add price history for the past 12 months
                for (let i = 11; i >= 0; i--) {
                    const date = new Date();
                    date.setMonth(date.getMonth() - i);
                    const historyVariation = price * (0.9 + Math.random() * 0.2);
                    const historyPrice = Math.round(historyVariation * 100) / 100;
                    const dateStr = date.toISOString().split('T')[0];

                    await runQuery(`
                        INSERT INTO price_history (product_id, price, effective_date, source)
                        VALUES (?, ?, ?, 'import')
                    `, [productId, historyPrice, dateStr]);
                }

                insertedCount++;
                if (insertedCount % 10 === 0) {
                    console.log(`✅ Inserted ${insertedCount} products...`);
                }
            } catch (err) {
                if (!err.message.includes('UNIQUE constraint failed')) {
                    console.error('Error:', err.message);
                }
            }
        }
        if (insertedCount >= targetCount) break;
    }

    // Create more product groups and mappings
    console.log('\n📦 Creating product groups and mappings...');

    const newGroups = [
        { code: 'MASTER005', name: 'กรดไฮโดรคลอริก', category: 3, unit: 'ลิตร' },
        { code: 'MASTER006', name: 'กรดไนตริก', category: 3, unit: 'ลิตร' },
        { code: 'MASTER007', name: 'อะซิโตน', category: 5, unit: 'ลิตร' },
        { code: 'MASTER008', name: 'เอทานอล', category: 5, unit: 'ลิตร' },
        { code: 'MASTER009', name: 'สีอีพ็อกซี่', category: 2, unit: 'กระป๋อง' },
        { code: 'MASTER010', name: 'ทินเนอร์', category: 5, unit: 'ลิตร' }
    ];

    for (const group of newGroups) {
        try {
            await runQuery(`
                INSERT INTO product_groups (master_code, master_name, category_id, unit, created_by)
                VALUES (?, ?, ?, ?, 1)
            `, [group.code, group.name, group.category, group.unit]);
        } catch (err) {
            // Ignore duplicate errors
        }
    }

    // Auto-map products to groups based on name similarity
    console.log('🔗 Auto-mapping products to groups...');

    const groups = await new Promise((resolve, reject) => {
        db.all('SELECT id, master_name FROM product_groups WHERE status = ?', ['active'], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    const unmappedProducts = await new Promise((resolve, reject) => {
        db.all(`
            SELECT p.id, p.product_name FROM products p
            WHERE p.status = 'active' AND NOT EXISTS (
                SELECT 1 FROM product_mapping pm WHERE pm.product_id = p.id
            )
        `, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    let mappedCount = 0;
    for (const product of unmappedProducts) {
        for (const group of groups) {
            if (product.product_name.toLowerCase().includes(group.master_name.toLowerCase().replace(/\s*\d+%?\s*/g, ''))) {
                try {
                    await runQuery(`
                        INSERT INTO product_mapping (product_id, product_group_id, mapped_by)
                        VALUES (?, ?, 1)
                    `, [product.id, group.id]);
                    mappedCount++;
                    break;
                } catch (err) {
                    // Ignore duplicate errors
                }
            }
        }
    }

    console.log(`✅ Mapped ${mappedCount} products to groups`);

    console.log('\n🎉 Seeding complete!');
    console.log(`   Total products inserted: ${insertedCount}`);

    db.close();
};

seedProducts().catch(console.error);
