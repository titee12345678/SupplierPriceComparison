// Supplier Price Comparison System - Main App
class App {
    constructor() {
        this.user = null;
        this.currentPage = 'dashboard';
        this.init();
    }

    // Date formatting helper - validates and converts to D/M/YYYY CE format
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        const year = d.getFullYear();
        if (isNaN(d.getTime()) || year < 1900 || year > 2100) {
            return '-';
        }
        return `${d.getDate()}/${d.getMonth() + 1}/${year}`;
    }

    // HTML escape helper - prevents XSS by escaping special characters
    escHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async init() {
        await this.checkAuth();
        this.bindEvents();
        this.initKeyboardShortcuts();
        this.initBulkSelect();
    }

    async checkAuth() {
        try {
            const response = await api.getCurrentUser();
            this.user = response.user;
            this.showMainApp();
        } catch (err) {
            this.showLoginPage();
        }
    }

    bindEvents() {
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());

        // Sidebar toggle
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('collapsed');
        });

        // Mobile menu
        document.getElementById('mobileMenuBtn').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });

        // Notification bell
        const notificationBtn = document.getElementById('notificationBtn');
        const notificationDropdown = document.getElementById('notificationDropdown');
        if (notificationBtn && notificationDropdown) {
            notificationBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                notificationDropdown.classList.toggle('hidden');
                this.loadNotifications();
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!notificationDropdown.contains(e.target) && !notificationBtn.contains(e.target)) {
                    notificationDropdown.classList.add('hidden');
                }
            });
        }

        // Theme toggle
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Global header search
        this.setupGlobalSearch();

        // Load saved theme on startup
        this.loadTheme();
    }

    // Theme toggle methods
    toggleTheme() {
        const body = document.body;
        const themeIcon = document.getElementById('themeIcon');
        const currentTheme = body.getAttribute('data-theme');

        if (currentTheme === 'light') {
            body.removeAttribute('data-theme');
            if (themeIcon) themeIcon.className = 'fas fa-sun';
            localStorage.setItem('theme', 'dark');
        } else {
            body.setAttribute('data-theme', 'light');
            if (themeIcon) themeIcon.className = 'fas fa-moon';
            localStorage.setItem('theme', 'light');
        }

        // Re-render current page to update chart colors
        if (this.currentPage && this.user) {
            this.loadPage(this.currentPage);
        }
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme');
        const themeIcon = document.getElementById('themeIcon');

        if (savedTheme === 'light') {
            document.body.setAttribute('data-theme', 'light');
            if (themeIcon) themeIcon.className = 'fas fa-moon';
        } else {
            document.body.removeAttribute('data-theme');
            if (themeIcon) themeIcon.className = 'fas fa-sun';
        }
    }

    setupGlobalSearch() {
        const input = document.getElementById('globalSearch');
        const btn = document.getElementById('globalSearchBtn');
        const dropdown = document.getElementById('globalSearchDropdown');
        if (!input || !dropdown) return;

        let debounceTimer;
        const doSearch = async () => {
            const query = input.value.toLowerCase().trim();
            if (query.length < 2) {
                dropdown.classList.remove('active');
                dropdown.innerHTML = '';
                return;
            }
            try {
                // Fetch data for searching
                const [compData, supplierData] = await Promise.all([
                    api.getPriceComparison().catch(() => ({ comparison: [], suppliers: [] })),
                    api.getProcurementSuppliers().catch(() => ({ suppliers: [] }))
                ]);

                const groups = compData.comparison || [];
                const suppliers = [...(compData.suppliers || []), ...(supplierData.suppliers || [])];

                // Search groups
                const matchedGroups = groups.filter(g =>
                    (g.master_name && g.master_name.toLowerCase().includes(query)) ||
                    (g.master_code && g.master_code.toLowerCase().includes(query))
                ).slice(0, 3);

                // Search products inside groups
                const matchedProducts = [];
                groups.forEach(g => {
                    (g.supplierPrices || []).forEach(sp => {
                        if (matchedProducts.length >= 6) return;
                        if ((sp.product_name && sp.product_name.toLowerCase().includes(query)) ||
                            (sp.product_code && sp.product_code.toLowerCase().includes(query))) {
                            matchedProducts.push({ ...sp, group_name: g.master_name });
                        }
                    });
                });

                // Search suppliers (deduplicate by name)
                const seen = new Set();
                const matchedSuppliers = suppliers.filter(s => {
                    const name = s.name || s.company_name || '';
                    if (seen.has(name)) return false;
                    seen.add(name);
                    return name.toLowerCase().includes(query) ||
                        (s.code && s.code.toLowerCase().includes(query));
                }).slice(0, 4);

                let html = '';
                if (matchedGroups.length > 0) {
                    html += `<div class="search-category"><i class="fas fa-layer-group"></i> กลุ่มสินค้า</div>`;
                    matchedGroups.forEach(g => {
                        html += `<div class="search-result-item" onclick="app.navigateTo('product-groups')">
                            <div class="search-result-icon group"><i class="fas fa-cubes"></i></div>
                            <div class="search-result-content">
                                <div class="search-result-title">${this.escHtml(g.master_name)}</div>
                                <div class="search-result-subtitle">${g.master_code || ''}</div>
                            </div></div>`;
                    });
                }
                if (matchedProducts.length > 0) {
                    html += `<div class="search-category"><i class="fas fa-box"></i> สินค้า</div>`;
                    matchedProducts.forEach(p => {
                        html += `<div class="search-result-item" onclick="app.navigateTo('all-products')">
                            <div class="search-result-icon" style="background:#3b82f6;"><i class="fas fa-tag"></i></div>
                            <div class="search-result-content">
                                <div class="search-result-title">${this.escHtml(p.product_name)}</div>
                                <div class="search-result-subtitle">${this.escHtml(p.supplier_name)} · ${p.price?.toLocaleString() || '-'} ฿</div>
                            </div></div>`;
                    });
                }
                if (matchedSuppliers.length > 0) {
                    html += `<div class="search-category"><i class="fas fa-building"></i> Supplier</div>`;
                    matchedSuppliers.forEach(s => {
                        html += `<div class="search-result-item" onclick="app.navigateTo('suppliers')">
                            <div class="search-result-icon supplier"><i class="fas fa-store"></i></div>
                            <div class="search-result-content">
                                <div class="search-result-title">${this.escHtml(s.name || s.company_name)}</div>
                                <div class="search-result-subtitle">${this.escHtml(s.code) || '-'}</div>
                            </div></div>`;
                    });
                }
                if (!html) {
                    html = `<div class="search-no-results"><i class="fas fa-search"></i><p>ไม่พบผลลัพธ์สำหรับ "${this.escHtml(query)}"</p></div>`;
                }
                dropdown.innerHTML = html;
                dropdown.classList.add('active');
            } catch (err) {
                dropdown.innerHTML = `<div class="search-no-results"><p>เกิดข้อผิดพลาด</p></div>`;
                dropdown.classList.add('active');
            }
        };

        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(doSearch, 300);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { clearTimeout(debounceTimer); doSearch(); }
        });
        if (btn) btn.addEventListener('click', doSearch);

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target) && !(btn && btn.contains(e.target))) {
                dropdown.classList.remove('active');
            }
        });
    }

    // Get theme-aware chart colors
    getChartColors() {
        const isLightMode = document.body.getAttribute('data-theme') === 'light';
        return {
            gridColor: isLightMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
            tickColor: isLightMode ? '#1e293b' : '#94a3b8',
            tooltipBg: isLightMode ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.8)',
            // Darker line colors for light mode, brighter for dark mode
            lineColors: isLightMode
                ? ['#1d4ed8', '#047857', '#b45309', '#be123c', '#6d28d9', '#0369a1', '#4338ca', '#065f46']
                : ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#6366f1', '#34d399']
        };
    }

    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('loginError');

        try {
            errorDiv.classList.add('hidden');
            const response = await api.login(username, password);
            this.user = response.user;
            this.showMainApp();
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.classList.remove('hidden');
        }
    }

    async handleLogout() {
        try {
            await api.logout();
            this.user = null;
            this.showLoginPage();
        } catch (err) {
            console.error('Logout error:', err);
        }
    }

    async loadNotifications() {
        const notificationList = document.getElementById('notificationList');
        if (!notificationList) return;

        try {
            // Load real notifications from system_logs (recent 10)
            const data = await api.getLogs({ limit: 10 });
            const logs = data.logs || [];

            const badge = document.getElementById('notificationBadge');
            if (badge) badge.textContent = logs.length > 0 ? logs.length : '';

            if (logs.length === 0) {
                notificationList.innerHTML = '<div class="notification-empty"><i class="fas fa-bell-slash"></i><p>ไม่มีการแจ้งเตือน</p></div>';
                return;
            }

            notificationList.innerHTML = logs.map(log => {
                const timeStr = log.created_at ? new Date(log.created_at).toLocaleString('th-TH') : '';
                return `
                    <div class="notification-item unread">
                        <div class="notification-title">${this.escHtml(log.action)} - ${this.escHtml(log.entity_type || '')}</div>
                        <div class="notification-time">${this.escHtml(log.details || '')} · ${timeStr}</div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            // Non-admin users may not have access to logs
            notificationList.innerHTML = '<div class="notification-empty"><i class="fas fa-bell-slash"></i><p>ไม่มีการแจ้งเตือน</p></div>';
            const badge = document.getElementById('notificationBadge');
            if (badge) badge.textContent = '';
        }
    }

    markNotificationRead(id) {
        const dropdown = document.getElementById('notificationDropdown');
        if (dropdown) dropdown.classList.add('hidden');
    }

    showLoginPage() {
        document.getElementById('loginPage').classList.add('active');
        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('active');
    }

    showMainApp() {
        document.getElementById('loginPage').classList.remove('active');
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('active');

        // Update user info
        document.getElementById('userName').textContent = this.user.full_name;
        document.getElementById('userRole').textContent = this.getRoleDisplay(this.user.role);

        // Build navigation based on role
        this.buildNavigation();

        // Load default page
        this.navigateTo('dashboard');
    }

    getRoleDisplay(role) {
        const roleMap = { admin: 'ผู้ดูแลระบบ', buyer: 'ฝ่ายจัดซื้อ', supplier: 'Supplier' };
        return roleMap[role] || role;
    }

    buildNavigation() {
        const navEl = document.getElementById('sidebarNav');
        let navItems = '';

        if (this.user.role === 'supplier') {
            navItems = `
                <li><a href="#" data-page="dashboard"><i class="fas fa-home"></i><span>หน้าแรก</span></a></li>
                <li><a href="#" data-page="products"><i class="fas fa-box"></i><span>สินค้าของฉัน</span></a></li>
                <li><a href="#" data-page="import"><i class="fas fa-file-excel"></i><span>Import ราคา</span></a></li>
                <li><a href="#" data-page="history"><i class="fas fa-chart-line"></i><span>ประวัติราคา</span></a></li>
            `;
        } else if (this.user.role === 'buyer') {
            navItems = `
                <li><a href="#" data-page="dashboard"><i class="fas fa-home"></i><span>Dashboard</span></a></li>
                <li><a href="#" data-page="suppliers"><i class="fas fa-building"></i><span>Suppliers</span></a></li>
                <li><a href="#" data-page="all-products"><i class="fas fa-boxes"></i><span>สินค้าทั้งหมด</span></a></li>
                <li><a href="#" data-page="product-groups"><i class="fas fa-layer-group"></i><span>กลุ่มสินค้า</span></a></li>
                <li><a href="#" data-page="mapping"><i class="fas fa-link"></i><span>จัดกลุ่มสินค้า</span></a></li>
                <li><a href="#" data-page="comparison"><i class="fas fa-balance-scale"></i><span>เปรียบเทียบราคา</span></a></li>
                <li><a href="#" data-page="price-history"><i class="fas fa-history"></i><span>ประวัติการอัพเดตราคา</span></a></li>
                <li><a href="#" data-page="reports"><i class="fas fa-file-alt"></i><span>รายงานสรุป</span></a></li>
            <li><a href="#" data-page="import"><i class="fas fa-file-excel"></i><span>Import ราคา</span></a></li>
                <div class="nav-divider"></div>
                <div class="nav-section-title">ประวัติการซื้อ</div>
                <li><a href="#" data-page="purchase-import"><i class="fas fa-file-upload"></i><span>Import ประวัติการซื้อ</span></a></li>
                <li><a href="#" data-page="purchase-history"><i class="fas fa-receipt"></i><span>ดูประวัติการซื้อ</span></a></li>
                <div class="nav-divider"></div>
                <div class="nav-section-title">จัดการ Supplier</div>
                <li><a href="#" data-page="supplier-companies"><i class="fas fa-store"></i><span>จัดการ Supplier</span></a></li>
            `;
        } else if (this.user.role === 'admin') {
            navItems = `
                <li><a href="#" data-page="dashboard"><i class="fas fa-home"></i><span>Dashboard</span></a></li>
                <div class="nav-divider"></div>
                <div class="nav-section-title">จัดซื้อ</div>
                <li><a href="#" data-page="suppliers"><i class="fas fa-building"></i><span>Suppliers</span></a></li>
                <li><a href="#" data-page="all-products"><i class="fas fa-boxes"></i><span>สินค้าทั้งหมด</span></a></li>
                <li><a href="#" data-page="product-groups"><i class="fas fa-layer-group"></i><span>กลุ่มสินค้า</span></a></li>
                <li><a href="#" data-page="mapping"><i class="fas fa-link"></i><span>จัดกลุ่มสินค้า</span></a></li>
                <li><a href="#" data-page="comparison"><i class="fas fa-balance-scale"></i><span>เปรียบเทียบราคา</span></a></li>
                <li><a href="#" data-page="price-history"><i class="fas fa-history"></i><span>ประวัติการอัพเดตราคา</span></a></li>
                <li><a href="#" data-page="reports"><i class="fas fa-file-alt"></i><span>รายงานสรุป</span></a></li>
            <li><a href="#" data-page="import"><i class="fas fa-file-excel"></i><span>Import ราคา</span></a></li>
                <div class="nav-divider"></div>
                <div class="nav-section-title">ประวัติการซื้อ</div>
                <li><a href="#" data-page="purchase-import"><i class="fas fa-file-upload"></i><span>Import ประวัติการซื้อ</span></a></li>
                <li><a href="#" data-page="purchase-history"><i class="fas fa-receipt"></i><span>ดูประวัติการซื้อ</span></a></li>
                <div class="nav-divider"></div>
                <div class="nav-section-title">ผู้ดูแลระบบ</div>
                <li><a href="#" data-page="users"><i class="fas fa-users"></i><span>จัดการผู้ใช้</span></a></li>
                <li><a href="#" data-page="supplier-companies"><i class="fas fa-store"></i><span>จัดการ Supplier</span></a></li>
                <li><a href="#" data-page="categories"><i class="fas fa-tags"></i><span>หมวดหมู่</span></a></li>
                <li><a href="#" data-page="export"><i class="fas fa-download"></i><span>Export ข้อมูล</span></a></li>
                <li><a href="#" data-page="logs"><i class="fas fa-history"></i><span>System Logs</span></a></li>
                <li><a href="#" data-page="delete-all-data"><i class="fas fa-trash-alt" style="color:#dc3545;"></i><span style="color:#dc3545;">ลบข้อมูลทั้งหมด</span></a></li>
            `;
        }

        navEl.innerHTML = navItems;

        // Bind click events
        navEl.querySelectorAll('a[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo(link.dataset.page);
            });
        });
    }

    navigateTo(page) {
        this.currentPage = page;

        // Update active nav
        document.querySelectorAll('#sidebarNav a').forEach(a => a.classList.remove('active'));
        document.querySelector(`#sidebarNav a[data-page="${page}"]`)?.classList.add('active');

        // Close mobile menu
        document.getElementById('sidebar').classList.remove('open');

        // Load page content
        this.loadPage(page);
    }

    async loadPage(page) {
        const wrapper = document.getElementById('contentWrapper');
        wrapper.innerHTML = this.getLoadingSkeleton();

        const titles = {
            dashboard: 'Dashboard', products: 'สินค้าของฉัน', import: 'Import ราคา',
            history: 'ประวัติราคา', suppliers: 'Suppliers', 'product-groups': 'กลุ่มสินค้า',
            mapping: 'จัดกลุ่มสินค้า', comparison: 'เปรียบเทียบราคา', users: 'จัดการผู้ใช้',
            'supplier-companies': 'จัดการ Supplier', categories: 'หมวดหมู่', export: 'Export ข้อมูล',
            logs: 'System Logs', 'price-history': 'ประวัติการอัพเดตราคา',
            reports: '📊 รายงานสรุป', 'all-products': 'สินค้าทั้งหมด',
            'delete-all-data': 'ลบข้อมูลทั้งหมด',
            'purchase-import': 'Import ประวัติการซื้อ',
            'purchase-history': 'ประวัติการซื้อ'
        };
        document.getElementById('pageTitle').textContent = titles[page] || page;

        // Update breadcrumb
        const headerLeft = document.querySelector('.header-left');
        if (headerLeft && page !== 'dashboard') {
            document.getElementById('pageTitle').innerHTML = `<span class="breadcrumb-nav"><a href="#" onclick="app.navigateTo('dashboard');return false;"><i class="fas fa-home"></i></a> <i class="fas fa-chevron-right" style="font-size:0.7rem;opacity:0.5;margin:0 0.25rem;"></i> ${titles[page] || page}</span>`;
        }

        try {
            switch (page) {
                case 'dashboard': await this.loadDashboard(); break;
                case 'products': await this.loadProducts(); break;
                case 'all-products': await this.loadAllProducts(); break;
                case 'import': await this.loadImport(); break;
                case 'history': await this.loadPriceHistory(); break;
                case 'suppliers': await this.loadSuppliers(); break;
                case 'product-groups': await this.loadProductGroups(); break;
                case 'mapping': await this.loadMapping(); break;
                case 'comparison': await this.loadComparison(); break;
                case 'price-history': await this.loadAllPriceHistory(); break;
                case 'users': await this.loadUsers(); break;
                case 'supplier-companies': await this.loadSupplierCompanies(); break;
                case 'categories': await this.loadCategories(); break;
                case 'export': await this.loadExport(); break;
                case 'logs': await this.loadLogs(); break;
                case 'reports': await this.loadReports(); break;
                case 'delete-all-data': await this.loadDeleteAllData(); break;
                case 'purchase-import': await this.loadPurchaseImport(); break;
                case 'purchase-history': await this.loadPurchaseHistory(); break;
                default: wrapper.innerHTML = '<div class="empty-state"><i class="fas fa-question-circle"></i><h3>หน้านี้ยังไม่พร้อมใช้งาน</h3></div>';
            }
        } catch (err) {
            wrapper.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error</h3><p>${err.message}</p></div>`;
        }
    }

    // Dashboard pages
    async loadDashboard() {
        const wrapper = document.getElementById('contentWrapper');

        if (this.user.role === 'supplier') {
            const data = await api.getSupplierDashboard();
            wrapper.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon blue"><i class="fas fa-box"></i></div>
                        <div class="stat-content">
                            <div class="stat-label">สินค้าทั้งหมด</div>
                            <div class="stat-value">${data.stats.totalProducts}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon green"><i class="fas fa-clock"></i></div>
                        <div class="stat-content">
                            <div class="stat-label">อัพเดตล่าสุด 7 วัน</div>
                            <div class="stat-value">${data.stats.recentUpdatesCount}</div>
                        </div>
                    </div>
                </div>
                <div class="card mt-4">
                    <div class="card-header"><h3 class="card-title"><i class="fas fa-history"></i> สินค้าที่อัพเดตล่าสุด</h3></div>
                    <div class="card-body"><div class="table-container">
                        <table class="data-table">
                            <thead><tr><th>รหัส</th><th>ชื่อสินค้า</th><th>ราคา</th><th>หน่วย</th><th>วันที่อัพเดต</th></tr></thead>
                            <tbody>${data.recentUpdates.map(p => `
                                <tr><td>${this.escHtml(p.product_code)}</td><td>${this.escHtml(p.product_name)}</td><td class="price-cell">${p.price?.toLocaleString() || '-'}</td><td>${this.escHtml(p.unit) || '-'}</td><td>${new Date(p.updated_at).toLocaleDateString('th-TH')}</td></tr>
                            `).join('')}</tbody>
                        </table>
                    </div></div>
                </div>
            `;
        } else {
            // Fetch dashboard data, universal search data, chart data, and anomalies
            const [data, compData, chartData, anomalyData] = await Promise.all([
                this.user.role === 'admin' ? api.getAdminDashboard() : api.getProcurementDashboard(),
                api.getPriceComparison(),
                api.getDashboardCharts(),
                api.getPriceAnomalies(15).catch(() => ({ anomalies: [] }))
            ]);

            wrapper.innerHTML = `
                <!-- Universal Search for Dashboard -->
                <div class="page-header" style="margin-bottom:1.5rem;">
                    <div class="toolbar" style="flex-wrap:wrap;gap:1rem;">
                        <div class="toolbar-left" style="flex:1;min-width:300px;">
                            <div class="universal-search-container">
                                <div class="universal-search-box" style="display:flex;align-items:center;">
                                    <i class="fas fa-search search-icon"></i>
                                    <input type="text" id="dashboardSearch" placeholder="ค้นหาสินค้า, Supplier, กลุ่มสินค้า..." autocomplete="off" style="flex:1;">
                                    <button class="btn btn-primary btn-sm" onclick="document.getElementById('dashboardSearch').dispatchEvent(new Event('input'))" style="margin-left:0.5rem;border-radius:8px;padding:0.5rem 1rem;">
                                        <i class="fas fa-search"></i> ค้นหา
                                    </button>
                                </div>
                                <div class="universal-search-dropdown" id="dashboardSearchDropdown">
                                    <!-- Results will be populated here -->
                                </div>
                            </div>
                        </div>
                        </div>
                        </div>
                    </div>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-building"></i></div><div class="stat-content"><div class="stat-label">Suppliers</div><div class="stat-value">${data.stats.activeSuppliers || data.stats.suppliers}</div></div></div>
                    <div class="stat-card"><div class="stat-icon green"><i class="fas fa-box"></i></div><div class="stat-content"><div class="stat-label">สินค้าทั้งหมด</div><div class="stat-value">${data.stats.totalProducts || data.stats.products}</div></div></div>
                    <div class="stat-card"><div class="stat-icon purple"><i class="fas fa-layer-group"></i></div><div class="stat-content"><div class="stat-label">กลุ่มสินค้า</div><div class="stat-value">${data.stats.productGroups}</div></div></div>
                    ${data.stats.users ? `<div class="stat-card"><div class="stat-icon orange"><i class="fas fa-users"></i></div><div class="stat-content"><div class="stat-label">ผู้ใช้งาน</div><div class="stat-value">${data.stats.users}</div></div></div>` : ''}
                </div>

                ${anomalyData.anomalies && anomalyData.anomalies.length > 0 ? `
                <!-- Price Anomaly Alerts -->
                <div class="card mt-4 anomaly-alerts-card">
                    <div class="card-header">
                        <h3 class="card-title" style="color:#f59e0b;">
                            <i class="fas fa-exclamation-triangle"></i> แจ้งเตือนราคาผิดปกติ 
                            <span class="badge badge-warning">${anomalyData.anomalies.length} รายการ</span>
                        </h3>
                        <button class="btn btn-sm btn-warning" onclick="app.navigateTo('reports')">
                            <i class="fas fa-chart-bar"></i> ดูรายงานเพิ่มเติม
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="anomaly-grid">
                            ${anomalyData.anomalies.slice(0, 5).map(a => `
                                <div class="anomaly-card ${a.direction}">
                                    <div class="anomaly-icon">
                                        <i class="fas fa-${a.direction === 'increase' ? 'arrow-up' : 'arrow-down'}"></i>
                                    </div>
                                    <div class="anomaly-content">
                                        <div class="anomaly-product">${a.product_name}</div>
                                        <div class="anomaly-supplier">${a.supplier_name}</div>
                                        <div class="anomaly-detail">
                                            <span class="anomaly-old">${a.old_price?.toLocaleString()} ฿</span>
                                            <i class="fas fa-arrow-right"></i>
                                            <span class="anomaly-new">${a.new_price?.toLocaleString()} ฿</span>
                                            <span class="anomaly-percent ${a.direction}">${a.direction === 'increase' ? '+' : '-'}${a.change_percent}%</span>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                ` : ''}

                <!-- Charts Section -->
                <div class="grid-2 mt-4">
                    <div class="card">
                        <div class="card-header"><h3 class="card-title"><i class="fas fa-chart-pie"></i> สินค้าแยกตาม Supplier</h3></div>
                        <div class="card-body">
                            <div class="chart-container" style="height:280px"><canvas id="supplierChart"></canvas></div>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header"><h3 class="card-title"><i class="fas fa-chart-bar"></i> การกระจายช่วงราคา</h3></div>
                        <div class="card-body">
                            <div class="chart-container" style="height:280px"><canvas id="priceRangeChart"></canvas></div>
                        </div>
                    </div>
                </div>

                <div class="grid-2 mt-4">
                    <div class="card">
                        <div class="card-header"><h3 class="card-title"><i class="fas fa-trophy"></i> Top 5 ราคาสูงสุด</h3></div>
                        <div class="card-body">
                            <div class="chart-container" style="height:280px"><canvas id="topPricesChart"></canvas></div>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header"><h3 class="card-title"><i class="fas fa-sync"></i> ความถี่อัพเดต Supplier</h3></div>
                        <div class="card-body">
                            <div class="chart-container" style="height:280px"><canvas id="supplierActivityChart"></canvas></div>
                        </div>
                    </div>
                </div>

                <div class="grid-2 mt-4">
                    <div class="card">
                        <div class="card-header"><h3 class="card-title"><i class="fas fa-link"></i> สถานะการจับคู่สินค้า</h3></div>
                        <div class="card-body">
                            <div class="chart-container" style="height:280px"><canvas id="mappingStatusChart"></canvas></div>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header"><h3 class="card-title"><i class="fas fa-tag"></i> Top 5 ราคาต่ำสุด</h3></div>
                        <div class="card-body">
                            <div class="chart-container" style="height:280px"><canvas id="lowestPricesChart"></canvas></div>
                        </div>
                    </div>
                </div>

                ${data.recentUpdates ? `
                <div class="card mt-4">
                    <div class="card-header"><h3 class="card-title"><i class="fas fa-clock"></i> การอัพเดตล่าสุด</h3></div>
                    <div class="card-body"><div class="table-container">
                        <table class="data-table">
                            <thead><tr><th>Supplier</th><th>สินค้า</th><th>ราคา</th><th>วันที่</th></tr></thead>
                            <tbody>${data.recentUpdates.slice(0, 10).map(p => `
                                <tr><td>${this.escHtml(p.supplier_name) || '-'}</td><td>${this.escHtml(p.product_name)}</td><td class="price-cell">${p.price?.toLocaleString() || '-'}</td><td>${new Date(p.updated_at).toLocaleDateString('th-TH')}</td></tr>
                            `).join('')}</tbody>
                        </table>
                    </div></div>
                </div>` : ''}

                <!-- Top 10 Volatile Products -->
                <div class="card mt-4" id="volatileCard">
                    <div class="card-header">
                        <h3 class="card-title" style="color:#e74c3c;"><i class="fas fa-chart-line"></i> Top 10 สินค้าราคาผันผวน</h3>
                    </div>
                    <div class="card-body" id="volatileBody">
                        <div style="text-align:center;padding:2rem;"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</div>
                    </div>
                </div>
            `;

            // Setup universal search for dashboard
            this.setupDashboardSearch(compData.comparison, compData.suppliers);

            // Render charts
            this.renderDashboardCharts(chartData);

            // Load volatile products
            this.loadVolatileProducts();
        }
    }

    async filterDashboardByDate() {
        const start = document.getElementById('dashStartDate')?.value;
        const end = document.getElementById('dashEndDate')?.value;
        if (!start || !end) {
            this.showToast('กรุณาเลือกช่วงวันที่', 'warning');
            return;
        }
        try {
            const chartData = await api.getDashboardCharts({ start_date: start, end_date: end });
            this.renderDashboardCharts(chartData);
            this.showToast(`กรองข้อมูลตั้งแต่ ${start} ถึง ${end}`, 'success');
        } catch (err) {
            this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
        }
    }

    async loadVolatileProducts() {
        try {
            const { volatile } = await api.getTopVolatile();
            const body = document.getElementById('volatileBody');
            if (!body) return;
            if (!volatile || volatile.length === 0) {
                body.innerHTML = '<div style="text-align:center;padding:1rem;" class="text-muted">ยังไม่มีข้อมูลประวัติราคาเพียงพอ</div>';
                return;
            }
            body.innerHTML = `
                <div class="table-container"><table class="data-table">
                    <thead><tr><th>#</th><th>สินค้า</th><th>Supplier</th><th>ราคาต่ำสุด</th><th>ราคาสูงสุด</th><th>ความผันผวน</th></tr></thead>
                    <tbody>${volatile.map((v, i) => `
                        <tr>
                            <td><strong>${i + 1}</strong></td>
                            <td>${this.escHtml(v.product_name)}<br><small class="text-muted">${this.escHtml(v.product_code)}</small></td>
                            <td><span class="badge badge-secondary">${this.escHtml(v.supplier_name)}</span></td>
                            <td class="price-cell">${v.min_price?.toLocaleString()} ฿</td>
                            <td class="price-cell">${v.max_price?.toLocaleString()} ฿</td>
                            <td><span class="badge ${v.volatility_pct > 50 ? 'badge-danger' : v.volatility_pct > 20 ? 'badge-warning' : 'badge-info'}" style="font-size:0.9rem;">
                                <i class="fas fa-chart-line"></i> ${v.volatility_pct}%
                            </span></td>
                        </tr>
                    `).join('')}</tbody>
                </table></div>
            `;
        } catch (err) {
            const body = document.getElementById('volatileBody');
            if (body) body.innerHTML = '<div class="text-muted" style="text-align:center;padding:1rem;">ไม่สามารถโหลดข้อมูลได้</div>';
        }
    }

    // Products (Supplier)
    async loadProducts() {
        const wrapper = document.getElementById('contentWrapper');
        const data = await api.getSupplierProducts();

        wrapper.innerHTML = `
            <div class="toolbar">
                <div class="toolbar-left"><div class="search-input" style="display:flex;align-items:center;gap:0.5rem;"><i class="fas fa-search"></i><input type="text" id="searchProducts" placeholder="ค้นหาสินค้า..."><button class="btn btn-primary btn-sm" onclick="document.getElementById('searchProducts').dispatchEvent(new Event('input'))" style="border-radius:8px;padding:0.4rem 0.8rem;white-space:nowrap;"><i class="fas fa-search"></i> ค้นหา</button></div></div>
                <div class="toolbar-right"><button class="btn btn-primary" onclick="app.showAddProductModal()"><i class="fas fa-plus"></i> เพิ่มสินค้า</button></div>
            </div>
            <div class="card"><div class="card-body"><div class="table-container">
                <table class="data-table" id="productsTable">
                    <thead><tr><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>ราคา</th><th>หน่วย</th><th>วันที่มีผล</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
                    <tbody>${data.products.map(p => `
                        <tr>
                            <td>${this.escHtml(p.product_code)}</td>
                            <td>${this.escHtml(p.product_name)}</td>
                            <td class="price-cell">${p.price?.toLocaleString() || '-'}</td>
                            <td>${this.escHtml(p.unit) || '-'}</td>
                            <td>${this.formatDate(p.effective_date)}</td>
                            <td><span class="badge ${p.status === 'active' ? 'badge-success' : 'badge-default'}">${p.status === 'active' ? 'Active' : 'Inactive'}</span></td>
                            <td class="actions">
                                <button class="action-btn" onclick="app.showEditProductModal(${p.id})" title="แก้ไข"><i class="fas fa-edit"></i></button>
                                <button class="action-btn" onclick="app.viewPriceHistory(${p.id})" title="ดูราคา"><i class="fas fa-chart-line"></i></button>
                                <button class="action-btn text-danger" onclick="app.deleteSupplierProduct(${p.id}, '${p.product_code.replace(/'/g, "\\'")}')" title="ลบ"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>
                    `).join('')}</tbody>
                </table>
            </div></div></div>
        `;

        document.getElementById('searchProducts').addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#productsTable tbody tr').forEach(tr => {
                tr.style.display = tr.textContent.toLowerCase().includes(term) ? '' : 'none';
            });
        });
    }

    async deleteSupplierProduct(id, productCode) {
        this.showConfirm(`ต้องการลบสินค้า "${this.escHtml(productCode)}" หรือไม่?`, async () => {
            try {
                await api.deleteSupplierProduct(id);
                this.showAlert('ลบสินค้าเรียบร้อย', 'success');
                this.loadProducts();
            } catch (error) {
                this.showAlert('เกิดข้อผิดพลาด: ' + error.message, 'error');
            }
        });
    }

    showAddProductModal() {
        this.showModal('เพิ่มสินค้าใหม่', `
            <form id="addProductForm">
                <div class="form-group"><label>รหัสสินค้า *</label><input type="text" name="product_code" required></div>
                <div class="form-group"><label>ชื่อสินค้า *</label><input type="text" name="product_name" required></div>
                <div class="form-group"><label>ราคา</label><input type="number" name="price" step="0.01"></div>
                <div class="form-group"><label>หน่วย</label><input type="text" name="unit" placeholder="กก., ลิตร..."></div>
                <div class="form-group"><label>วันที่มีผล</label><input type="date" name="effective_date"></div>
                <div class="form-group"><label>หมายเหตุ</label><textarea name="remark" rows="2"></textarea></div>
            </form>
        `, async () => {
            const form = document.getElementById('addProductForm');
            const data = Object.fromEntries(new FormData(form));
            await api.createSupplierProduct(data);
            this.hideModal();
            this.loadProducts();
        });
    }

    async showEditProductModal(id) {
        const { product } = await api.getSupplierProduct(id);
        this.showModal('แก้ไขสินค้า', `
            <form id="editProductForm">
                <div class="form-group"><label>รหัสสินค้า</label><input type="text" value="${this.escHtml(product.product_code)}" disabled></div>
                <div class="form-group"><label>ชื่อสินค้า *</label><input type="text" name="product_name" value="${this.escHtml(product.product_name)}" required></div>
                <div class="form-group"><label>ราคา</label><input type="number" name="price" step="0.01" value="${product.price || ''}"></div>
                <div class="form-group"><label>หน่วย</label><input type="text" name="unit" value="${product.unit || ''}"></div>
                <div class="form-group"><label>วันที่มีผล</label><input type="date" name="effective_date" value="${product.effective_date || ''}"></div>
                <div class="form-group"><label>หมายเหตุ</label><textarea name="remark" rows="2">${product.remark || ''}</textarea></div>
                <div class="form-group"><label>สถานะ</label><select name="status"><option value="active" ${product.status === 'active' ? 'selected' : ''}>Active</option><option value="inactive" ${product.status === 'inactive' ? 'selected' : ''}>Inactive</option></select></div>
            </form>
        `, async () => {
            const form = document.getElementById('editProductForm');
            const data = Object.fromEntries(new FormData(form));
            await api.updateSupplierProduct(id, data);
            this.hideModal();
            this.loadProducts();
        });
    }

    // Import page
    async loadImport() {
        const wrapper = document.getElementById('contentWrapper');
        const isAdminOrBuyer = this.user && (this.user.role === 'admin' || this.user.role === 'buyer');
        const downloadFn = isAdminOrBuyer ? 'api.downloadAdminTemplate()' : 'api.downloadTemplate()';
        const templateName = isAdminOrBuyer ? 'adminandbuyer.xlsx' : 'Suppliers.xlsx';

        wrapper.innerHTML = `
            <div class="card">
                <div class="card-header"><h3 class="card-title"><i class="fas fa-file-excel"></i> Import ราคาจาก Excel</h3>
                    <button class="btn btn-secondary btn-sm" onclick="${downloadFn}"><i class="fas fa-download"></i> Download Template</button>
                </div>
                <div class="card-body">
                    <div class="alert alert-info" style="margin-bottom:1rem;">
                        <i class="fas fa-info-circle"></i> 
                        ${isAdminOrBuyer
                ? 'รูปแบบ: supplier_name, supplier_product_code, product_name, description, price, Currency, unit, effective_date, notes'
                : 'รูปแบบ: supplier_product_code, product_name, description, price, Currency, unit, effective_date, notes'
            }
                    </div>
                    <div class="upload-zone" id="uploadZone">
                        <i class="fas fa-cloud-upload-alt"></i>
                        <h4>ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</h4>
                        <p>รองรับไฟล์ .xlsx, .xls</p>
                        <input type="file" id="fileInput" accept=".xlsx,.xls" style="display:none">
                    </div>
                    <div id="previewContainer" class="hidden mt-4"></div>
                </div>
            </div>
        `;

        const zone = document.getElementById('uploadZone');
        const input = document.getElementById('fileInput');

        zone.onclick = () => input.click();
        zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('dragover'); };
        zone.ondragleave = () => zone.classList.remove('dragover');
        zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('dragover'); if (e.dataTransfer.files.length) this.handleFileUpload(e.dataTransfer.files[0]); };
        input.onchange = (e) => { if (e.target.files.length) this.handleFileUpload(e.target.files[0]); };
    }

    async handleFileUpload(file) {
        try {
            const isAdminOrBuyer = this.user && (this.user.role === 'admin' || this.user.role === 'buyer');
            const result = isAdminOrBuyer
                ? await api.uploadAdminPreview(file)
                : await api.uploadPreview(file);

            const container = document.getElementById('previewContainer');
            container.classList.remove('hidden');

            // Different columns for admin vs supplier
            const headerRow = isAdminOrBuyer
                ? '<tr><th>แถว</th><th>Supplier</th><th>รหัสสินค้า</th><th>ชื่อ</th><th>ราคา</th><th>หน่วย</th><th>วันที่</th><th>สถานะ</th></tr>'
                : '<tr><th>แถว</th><th>รหัสสินค้า</th><th>ชื่อ</th><th>ราคา</th><th>หน่วย</th><th>วันที่</th><th>สถานะ</th></tr>';

            const bodyRows = result.preview.slice(0, 50).map(r => {
                if (isAdminOrBuyer) {
                    return `
                        <tr class="${r.isValid ? '' : 'error'}">
                            <td>${r.row}</td>
                            <td>${r.supplier_name || '-'}</td>
                            <td>${r.product_code}</td>
                            <td>${r.product_name}</td>
                            <td>${r.price}</td>
                            <td>${r.unit}</td>
                            <td>${this.formatDate(r.effective_date)}</td>
                            <td>${r.isValid ? '<span class="badge badge-success">OK</span>' : `<span class="badge badge-danger">${r.errors.join(', ')}</span>`}</td>
                        </tr>
                    `;
                } else {
                    return `
                        <tr class="${r.isValid ? '' : 'error'}">
                            <td>${r.row}</td>
                            <td>${r.product_code}</td>
                            <td>${r.product_name}</td>
                            <td>${r.price}</td>
                            <td>${r.unit}</td>
                            <td>${this.formatDate(r.effective_date)}</td>
                            <td>${r.isValid ? '<span class="badge badge-success">OK</span>' : `<span class="badge badge-danger">${r.errors.join(', ')}</span>`}</td>
                        </tr>
                    `;
                }
            }).join('');

            container.innerHTML = `
                <div class="card">
                    <div class="card-header"><h3 class="card-title">Preview: ${result.filename}</h3>
                        <span>รวม ${result.totalRows} รายการ | สำเร็จ ${result.validRows} | ผิดพลาด ${result.errorRows}</span>
                    </div>
                    <div class="card-body preview-table">
                        <table class="data-table"><thead>${headerRow}</thead>
                        <tbody>${bodyRows}</tbody></table>
                    </div>
                    <div class="card-footer"><button class="btn btn-success" onclick="app.confirmImport()" ${result.validRows === 0 ? 'disabled' : ''}><i class="fas fa-check"></i> ยืนยัน Import (${result.validRows} รายการ)</button></div>
                </div>
            `;
            this.pendingImport = result.preview;
            this.importIsAdmin = isAdminOrBuyer;
        } catch (err) {
            this.showAlert('Error: ' + err.message, 'error');
        }
    }

    async confirmImport() {
        if (!this.pendingImport) return;
        try {
            const result = this.importIsAdmin
                ? await api.confirmAdminImport(this.pendingImport)
                : await api.confirmImport(this.pendingImport);
            this.showAlert(result.message, 'success');
            this.pendingImport = null;
            this.importIsAdmin = false;
            if (this.user.role === 'supplier') {
                this.loadProducts();
                this.navigateTo('products');
            } else {
                // Admin/Buyer ไปหน้าสินค้าทั้งหมด
                this.navigateTo('all-products');
            }
        } catch (err) {
            this.showAlert('Error: ' + err.message, 'error');
        }
    }

    // Price History
    async loadPriceHistory() {
        const wrapper = document.getElementById('contentWrapper');
        const { products } = await api.getSupplierProducts();

        wrapper.innerHTML = `
            <div class="toolbar"><div class="toolbar-left"><select id="productSelect" class="filter-select">
                <option value="">-- เลือกสินค้า --</option>
                ${products.map(p => `<option value="${p.id}">${this.escHtml(p.product_code)} - ${this.escHtml(p.product_name)}</option>`).join('')}
            </select></div></div>
            <div class="grid-2">
                <div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-chart-line"></i> กราฟราคา</h3></div><div class="card-body"><div class="chart-container"><canvas id="priceChart"></canvas></div><div id="statsBox" class="mt-4"></div></div></div>
                <div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-list"></i> ประวัติราคา</h3></div><div class="card-body"><div id="historyTable"></div></div></div>
            </div>
        `;

        document.getElementById('productSelect').onchange = (e) => {
            if (e.target.value) this.viewPriceHistory(e.target.value);
        };
    }

    async viewPriceHistory(productId) {
        const { product, history, stats } = await api.getPriceHistory(productId);

        // Stats
        document.getElementById('statsBox').innerHTML = `
            <div class="stats-grid" style="grid-template-columns:repeat(2,1fr)">
                <div class="stat-card"><div class="stat-content"><div class="stat-label">ราคาปัจจุบัน</div><div class="stat-value">${stats.current.toLocaleString()}</div></div></div>
                <div class="stat-card"><div class="stat-content"><div class="stat-label">ราคาเฉลี่ย</div><div class="stat-value">${stats.average.toFixed(2)}</div></div></div>
                <div class="stat-card"><div class="stat-content"><div class="stat-label">ราคาต่ำสุด</div><div class="stat-value price-lowest">${stats.min.toLocaleString()}</div></div></div>
                <div class="stat-card"><div class="stat-content"><div class="stat-label">ราคาสูงสุด</div><div class="stat-value price-highest">${stats.max.toLocaleString()}</div></div></div>
            </div>
        `;

        // Table
        document.getElementById('historyTable').innerHTML = `
            <table class="data-table"><thead><tr><th>วันที่</th><th>ราคา</th><th>แหล่งที่มา</th></tr></thead>
            <tbody>${history.map(h => `<tr><td>${this.formatDate(h.effective_date)}</td><td class="price-cell">${h.price.toLocaleString()}</td><td><span class="badge badge-info">${h.source}</span></td></tr>`).join('')}</tbody></table>
        `;

        // Chart
        const ctx = document.getElementById('priceChart').getContext('2d');
        const chartColors = this.getChartColors();
        if (this.priceChart) this.priceChart.destroy();
        this.priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: history.map(h => this.formatDate(h.effective_date)),
                datasets: [{
                    label: 'ราคา',
                    data: history.map(h => h.price),
                    borderColor: chartColors.lineColors[0],
                    backgroundColor: chartColors.lineColors[0] + '20',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { color: chartColors.gridColor },
                        ticks: { color: chartColors.tickColor }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: chartColors.tickColor }
                    }
                }
            }
        });
    }

    // All Products page (for admin/buyer)
    async loadAllProducts(params = {}) {
        const wrapper = document.getElementById('contentWrapper');
        const { suppliers } = await api.getProcurementSuppliers();
        const data = await api.getAllProducts(params);

        wrapper.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-boxes"></i> สินค้าทั้งหมด</h3>
                    <div class="header-actions">
                        <span class="badge badge-info">${data.pagination.total} รายการ</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="filter-bar" style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
                        <input type="text" id="allProductSearch" class="form-control" placeholder="ค้นหาสินค้า..." value="${params.search || ''}" style="max-width:300px;">
                        <button class="btn btn-primary btn-sm" onclick="app.loadAllProducts({search: document.getElementById('allProductSearch').value})" style="border-radius:8px;padding:0.4rem 0.8rem;white-space:nowrap;"><i class="fas fa-search"></i> ค้นหา</button>
                        <select id="allProductSupplier" class="form-control" style="max-width:250px;">
                            <option value="">-- Supplier ทั้งหมด --</option>
                            ${suppliers.map(s => `<option value="${s.id}" ${params.supplier_id == s.id ? 'selected' : ''}>${this.escHtml(s.name)}</option>`).join('')}
                        </select>
                        <button class="btn btn-primary" onclick="app.filterAllProducts()"><i class="fas fa-search"></i> ค้นหา</button>
                    </div>
                    <div id="bulkToolbar" class="bulk-toolbar"></div>
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th style="width:40px;"><input type="checkbox" id="selectAllProducts" onchange="app.toggleSelectAll(this.checked)"></th>
                                    <th>Supplier</th>
                                    <th>รหัสสินค้า</th>
                                    <th>ชื่อสินค้า</th>
                                    <th>ราคา</th>
                                    <th>หน่วย</th>
                                    <th>วันที่มีผล</th>
                                    <th>อัพเดตล่าสุด</th>
                                    <th>จัดการ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.products.length === 0 ? '<tr><td colspan="9" class="text-center">ไม่พบสินค้า</td></tr>' :
                data.products.map(p => `
                                    <tr>
                                        <td><input type="checkbox" class="product-checkbox" data-id="${p.id}" onchange="app.toggleSelectProduct(${p.id}, this.checked)"></td>
                                        <td><span class="badge badge-secondary">${this.escHtml(p.supplier_name)}</span></td>
                                        <td>${this.escHtml(p.product_code)}</td>
                                        <td>${this.escHtml(p.product_name)}</td>
                                        <td class="price">${p.price?.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</td>
                                        <td>${this.escHtml(p.unit) || '-'}</td>
                                        <td>${this.formatDate(p.effective_date)}</td>
                                        <td>${this.formatDate(p.updated_at)}</td>
                                        <td>
                                            <div class="btn-group">
                                                <button class="btn btn-sm btn-warning" onclick="app.viewProductPriceHistory(${p.id})" title="ดูประวัติราคา">
                                                    <i class="fas fa-history"></i>
                                                </button>
                                                <button class="btn btn-sm btn-danger" onclick="app.deleteProduct(${p.id}, '${p.product_name.replace(/'/g, "\\'")}')" title="ลบสินค้า">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ${data.pagination.pages > 1 ? `
                        <div class="pagination" style="margin-top:1rem;display:flex;gap:0.5rem;justify-content:center;">
                            ${Array.from({ length: data.pagination.pages }, (_, i) => i + 1).map(p => `
                                <button class="btn ${p === data.pagination.page ? 'btn-primary' : 'btn-secondary'}" 
                                    onclick="app.loadAllProducts({page: ${p}, search: '${params.search || ''}', supplier_id: '${params.supplier_id || ''}'})">
                                    ${p}
                                </button>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    filterAllProducts() {
        const search = document.getElementById('allProductSearch').value;
        const supplier_id = document.getElementById('allProductSupplier').value;
        this.loadAllProducts({ search, supplier_id, page: 1 });
    }

    async deleteProduct(productId, productName) {
        this.showConfirmDialog({
            title: 'ยืนยันการลบสินค้า',
            message: `คุณต้องการลบสินค้า "${productName}" หรือไม่?`,
            warning: 'หมายเหตุ: การลบจะลบประวัติราคาทั้งหมดด้วย',
            onConfirm: async () => {
                try {
                    await api.request(`/procurement/products/${productId}`, { method: 'DELETE' });
                    this.showToast('ลบสินค้าสำเร็จ', 'success');
                    await this.loadAllProducts();
                } catch (err) {
                    this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
                }
            }
        });
    }

    async viewProductPriceHistory(productId) {
        try {
            const data = await api.request(`/procurement/products/${productId}/price-history`);

            const modal = document.createElement('div');
            modal.className = 'modal-overlay active';
            modal.innerHTML = `
                <div class="modal" style="max-width:700px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-history"></i> ประวัติราคา - ${data.product?.product_name || 'สินค้า'}</h3>
                        <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${data.history && data.history.length > 0 ? `
                            <div class="mb-3">
                                <button class="btn btn-danger btn-sm" onclick="app.deleteAllPriceHistory(${productId})">
                                    <i class="fas fa-trash"></i> ลบประวัติทั้งหมด
                                </button>
                            </div>
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>ราคา</th>
                                        <th>วันที่มีผล</th>
                                        <th>แหล่งที่มา</th>
                                        <th>จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.history.map(h => `
                                        <tr id="history-row-${h.id}">
                                            <td class="price">${h.price?.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</td>
                                            <td>${this.formatDate(h.effective_date)}</td>
                                            <td><span class="badge badge-secondary">${h.source || '-'}</span></td>
                                            <td>
                                                <button class="btn btn-sm btn-danger" onclick="app.deletePriceHistoryEntry(${h.id})">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<p class="text-center">ไม่มีประวัติราคา</p>'}
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } catch (err) {
            this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
        }
    }

    async deletePriceHistoryEntry(historyId) {
        this.showConfirmDialog({
            title: 'ยืนยันการลบ',
            message: 'คุณต้องการลบรายการประวัติราคานี้หรือไม่?',
            onConfirm: async () => {
                try {
                    await api.request(`/procurement/price-history/${historyId}`, { method: 'DELETE' });
                    document.getElementById(`history-row-${historyId}`)?.remove();
                    this.showToast('ลบรายการสำเร็จ', 'success');
                } catch (err) {
                    this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
                }
            }
        });
    }

    async deleteAllPriceHistory(productId) {
        this.showConfirmDialog({
            title: 'ยืนยันการลบทั้งหมด',
            message: 'คุณต้องการลบประวัติราคาทั้งหมดของสินค้านี้หรือไม่?',
            warning: 'การดำเนินการนี้ไม่สามารถย้อนกลับได้',
            onConfirm: async () => {
                try {
                    await api.request(`/procurement/products/${productId}/price-history`, { method: 'DELETE' });
                    document.querySelector('.modal-overlay')?.remove();
                    this.showToast('ลบประวัติราคาทั้งหมดสำเร็จ', 'success');
                } catch (err) {
                    this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
                }
            }
        });
    }

    showConfirmDialog({ title, message, warning, onConfirm }) {
        const dialog = document.createElement('div');
        dialog.className = 'modal-overlay active';
        dialog.id = 'confirmDialog';
        dialog.innerHTML = `
            <div class="modal" style="max-width:450px;">
                <div class="modal-header" style="background: linear-gradient(135deg, #dc3545, #c82333);">
                    <h3><i class="fas fa-exclamation-triangle"></i> ${title}</h3>
                </div>
                <div class="modal-body" style="text-align:center;padding:2rem;">
                    <p style="font-size:1.1rem;margin-bottom:1rem;">${message}</p>
                    ${warning ? `<p style="color:#dc3545;font-size:0.9rem;"><i class="fas fa-warning"></i> ${warning}</p>` : ''}
                </div>
                <div class="modal-footer" style="display:flex;gap:1rem;justify-content:center;padding:1rem 2rem 2rem;">
                    <button class="btn btn-secondary" id="confirmCancel" style="min-width:100px;">
                        <i class="fas fa-times"></i> ยกเลิก
                    </button>
                    <button class="btn btn-danger" id="confirmOk" style="min-width:100px;">
                        <i class="fas fa-trash"></i> ลบ
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        document.getElementById('confirmCancel').onclick = () => dialog.remove();
        document.getElementById('confirmOk').onclick = () => {
            dialog.remove();
            onConfirm();
        };
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : 'info-circle'}"></i> ${message}`;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10001;
            animation: slideIn 0.3s ease;
            background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // Suppliers list
    async loadSuppliers() {
        const wrapper = document.getElementById('contentWrapper');
        const { suppliers } = await api.getProcurementSuppliers();

        wrapper.innerHTML = `
            <div class="stats-grid">${suppliers.map(s => `
                <div class="stat-card clickable-card" onclick="app.viewSupplierProducts(${s.id}, '${s.name.replace(/'/g, "\\'")}')" style="cursor:pointer;">
                    <div class="stat-icon blue"><i class="fas fa-building"></i></div>
                    <div class="stat-content">
                        <div class="stat-label">${this.escHtml(s.name)}</div>
                        <div class="stat-value">${s.product_count} สินค้า</div>
                        <div class="stat-change">${s.last_update ? 'อัพเดต: ' + new Date(s.last_update).toLocaleDateString('th-TH') : '-'}</div>
                    </div>
                </div>
            `).join('')}</div>
        `;
    }

    // View products of a specific supplier
    async viewSupplierProducts(supplierId, supplierName) {
        document.getElementById('pageTitle').textContent = `สินค้าของ ${supplierName}`;
        await this.loadAllProducts({ supplier_id: supplierId });
    }


    // Product Groups
    async loadProductGroups() {
        const wrapper = document.getElementById('contentWrapper');
        const { groups } = await api.getProductGroups();

        wrapper.innerHTML = `
            <div class="toolbar"><div class="toolbar-left"><div class="search-input" style="display:flex;align-items:center;gap:0.5rem;"><i class="fas fa-search"></i><input type="text" id="searchGroups" placeholder="ค้นหากลุ่มสินค้า..."><button class="btn btn-primary btn-sm" onclick="document.getElementById('searchGroups').dispatchEvent(new Event('input'))" style="border-radius:8px;padding:0.4rem 0.8rem;white-space:nowrap;"><i class="fas fa-search"></i> ค้นหา</button></div></div>
            <div class="toolbar-right"><button class="btn btn-primary" onclick="app.showAddGroupModal()"><i class="fas fa-plus"></i> สร้างกลุ่มใหม่</button></div></div>
            <div class="card"><div class="card-body"><div class="table-container">
                <table class="data-table" id="groupsTable"><thead><tr><th>รหัส</th><th>ชื่อกลุ่มสินค้า</th><th>หมวดหมู่</th><th>หน่วย</th><th>สินค้าที่ map</th><th>จัดการ</th></tr></thead>
                <tbody>${groups.map(g => `
                    <tr><td>${this.escHtml(g.master_code)}</td><td>${this.escHtml(g.master_name)}</td><td>${this.escHtml(g.category_name) || '-'}</td><td>${this.escHtml(g.unit) || '-'}</td><td><span class="badge badge-info">${g.product_count || 0}</span></td>
                    <td class="actions"><button class="action-btn" onclick="app.showEditGroupModal(${g.id})" title="แก้ไข"><i class="fas fa-edit"></i></button><button class="action-btn" onclick="app.viewGroupProducts(${g.id})" title="ดูสินค้า"><i class="fas fa-eye"></i></button><button class="action-btn danger" onclick="app.deleteGroup(${g.id}, '${g.master_name.replace(/'/g, "\\'")}')" title="ลบกลุ่ม"><i class="fas fa-trash"></i></button></td></tr>
                `).join('')}</tbody></table>
            </div></div></div>
        `;
    }

    async showAddGroupModal() {
        const { categories } = await api.getCategories();
        this.showModal('สร้างกลุ่มสินค้าใหม่', `
            <form id="addGroupForm">
                <div class="form-group"><label>รหัสกลุ่ม *</label><input type="text" name="master_code" required></div>
                <div class="form-group"><label>ชื่อกลุ่มสินค้า *</label><input type="text" name="master_name" required></div>
                <div class="form-group"><label>หมวดหมู่</label><select name="category_id"><option value="">-- เลือก --</option>${categories.map(c => `<option value="${c.id}">${this.escHtml(c.name)}</option>`).join('')}</select></div>
                <div class="form-group"><label>หน่วย</label><input type="text" name="unit"></div>
                <div class="form-group"><label>Specification</label><textarea name="specification" rows="3"></textarea></div>
            </form>
        `, async () => {
            const form = document.getElementById('addGroupForm');
            const data = Object.fromEntries(new FormData(form));
            await api.createProductGroup(data);
            this.hideModal();
            this.loadProductGroups();
        });
    }

    async showEditGroupModal(id) {
        const [{ group }, { categories }] = await Promise.all([
            api.getProductGroup(id),
            api.getCategories()
        ]);

        this.showModal('แก้ไขกลุ่มสินค้า', `
            <form id="editGroupForm">
                <div class="form-group"><label>รหัสกลุ่ม</label><input type="text" value="${group.master_code}" disabled></div>
                <div class="form-group"><label>ชื่อกลุ่มสินค้า *</label><input type="text" name="master_name" value="${group.master_name}" required></div>
                <div class="form-group"><label>หมวดหมู่</label><select name="category_id">
                    <option value="">-- เลือก --</option>
                    ${categories.map(c => `<option value="${c.id}" ${group.category_id == c.id ? 'selected' : ''}>${this.escHtml(c.name)}</option>`).join('')}
                </select></div>
                <div class="form-group"><label>หน่วย</label><input type="text" name="unit" value="${group.unit || ''}"></div>
                <div class="form-group"><label>Specification</label><textarea name="specification" rows="3">${group.specification || ''}</textarea></div>
                <div class="form-group"><label>สถานะ</label><select name="status">
                    <option value="active" ${group.status === 'active' ? 'selected' : ''}>Active</option>
                    <option value="inactive" ${group.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                </select></div>
                <div class="form-group"><label>รูปภาพสินค้า</label>
                    <div id="groupImageArea" style="margin-top:0.5rem;">
                        ${group.image_path ? `
                            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:0.5rem;">
                                <img src="${group.image_path}" style="max-width:120px;max-height:80px;border-radius:8px;object-fit:cover;border:2px solid var(--border-color);" alt="Product Image">
                                <button type="button" class="btn btn-danger btn-sm" onclick="app.deleteGroupImage(${id})">
                                    <i class="fas fa-trash"></i> ลบรูป
                                </button>
                            </div>
                        ` : '<p class="text-muted" style="font-size:0.85rem;">ยังไม่มีรูปภาพ</p>'}
                        <input type="file" id="groupImageFile" accept="image/*" style="margin-top:0.5rem;">
                        <button type="button" class="btn btn-info btn-sm" onclick="app.uploadGroupImage(${id})" style="margin-top:0.5rem;">
                            <i class="fas fa-upload"></i> อัพโหลดรูป
                        </button>
                    </div>
                </div>
            </form>
        `, async () => {
            const form = document.getElementById('editGroupForm');
            const data = Object.fromEntries(new FormData(form));
            await api.updateProductGroup(id, data);
            this.hideModal();
            this.loadProductGroups();
        });
    }

    async uploadGroupImage(groupId) {
        const fileInput = document.getElementById('groupImageFile');
        if (!fileInput || !fileInput.files[0]) {
            this.showToast('กรุณาเลือกรูปภาพ', 'warning');
            return;
        }
        try {
            const result = await api.uploadProductImage(groupId, fileInput.files[0]);
            this.showToast(result.message, 'success');
            // Refresh modal
            this.hideModal();
            this.showEditGroupModal(groupId);
        } catch (err) {
            this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
        }
    }

    async deleteGroupImage(groupId) {
        try {
            await api.deleteProductImage(groupId);
            this.showToast('ลบรูปภาพเรียบร้อย', 'success');
            // Refresh modal
            this.hideModal();
            this.showEditGroupModal(groupId);
        } catch (err) {
            this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
        }
    }

    async viewGroupProducts(id) {
        const { group, mappedProducts } = await api.getProductGroup(id);

        this.showModal(`สินค้าในกลุ่ม: ${group.master_name}`, `
            <div style="max-height:400px;overflow-y:auto;">
                ${mappedProducts && mappedProducts.length > 0 ? `
                    <table class="data-table">
                        <thead>
                            <tr><th>Supplier</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>ราคา</th><th>จัดการ</th></tr>
                        </thead>
                        <tbody>
                            ${mappedProducts.map(p => `
                                <tr>
                                    <td>${this.escHtml(p.supplier_name) || '-'}</td>
                                    <td>${this.escHtml(p.product_code)}</td>
                                    <td>${this.escHtml(p.product_name)}</td>
                                    <td class="price-cell">${p.price?.toLocaleString() || '-'}</td>
                                    <td><button class="action-btn danger btn-sm" onclick="app.removeProductFromGroup(${p.id})" title="นำออกจากกลุ่ม"><i class="fas fa-times"></i></button></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<div class="empty-state"><i class="fas fa-box-open"></i><h3>ยังไม่มีสินค้าในกลุ่มนี้</h3></div>'}
            </div>
        `, null, 'ปิด');
    }

    async deleteGroup(id, name) {
        this.showConfirm(`ต้องการลบกลุ่มสินค้า "${name}" หรือไม่?\n\nสินค้าในกลุ่มนี้จะย้ายไป "สินค้าที่ยังไม่จัดกลุ่ม"`, async () => {
            try {
                const result = await api.deleteProductGroup(id);
                this.showAlert(result.message, 'success');
                this.loadProductGroups();
            } catch (error) {
                this.showAlert('เกิดข้อผิดพลาด: ' + error.message, 'error');
            }
        });
    }

    async removeProductFromGroup(productId) {
        this.showConfirm('ต้องการนำสินค้านี้ออกจากกลุ่มหรือไม่?', async () => {
            try {
                await api.removeMapping(productId);
                this.hideModal();
                this.showAlert('นำสินค้าออกจากกลุ่มเรียบร้อย', 'success');
                this.loadProductGroups();
            } catch (error) {
                this.showAlert('เกิดข้อผิดพลาด: ' + error.message, 'error');
            }
        });
    }

    // Mapping page - Quick Group Style
    async loadMapping() {
        const wrapper = document.getElementById('contentWrapper');
        const [unmapped, groups] = await Promise.all([api.getUnmappedProducts(), api.getProductGroups()]);

        // Store groups for popup
        this.productGroups = groups.groups;

        wrapper.innerHTML = `
            <div class="toolbar" style="margin-bottom:1rem;">
                <div class="toolbar-left" style="gap:1rem;">
                    <span class="badge badge-warning" style="font-size:1rem;padding:0.5rem 1rem;">
                        <i class="fas fa-box-open"></i> ${unmapped.products.length} สินค้ายังไม่จัดกลุ่ม
                    </span>
                    <input type="text" id="mappingSearch" placeholder="🔍 ค้นหาสินค้า..." 
                           style="padding:0.5rem 1rem;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-secondary);min-width:250px;"
                           oninput="app.filterMappingCards(this.value)">
                </div>
                <div class="toolbar-right" style="gap:0.5rem;">
                    <button class="btn btn-info" onclick="app.showMappingSuggestions()" style="white-space:nowrap;">
                        <i class="fas fa-magic"></i> AI แนะนำจับคู่
                    </button>
                    <button class="btn btn-success" onclick="app.showCreateGroupFromProducts()">
                        <i class="fas fa-plus-circle"></i> สร้างกลุ่มใหม่
                    </button>
                </div>
            </div>
            
            ${unmapped.products.length === 0 ? `
                <div class="card">
                    <div class="card-body" style="text-align:center;padding:3rem;">
                        <i class="fas fa-check-circle" style="font-size:4rem;color:#28a745;margin-bottom:1rem;"></i>
                        <h2 style="color:#28a745;">จัดกลุ่มครบแล้ว!</h2>
                        <p class="text-muted">สินค้าทั้งหมดได้รับการจัดกลุ่มเรียบร้อย</p>
                    </div>
                </div>
            ` : (() => {
                // Create color map for suppliers
                const supplierColors = [
                    { bg: 'linear-gradient(135deg, #667eea, #764ba2)', border: '#667eea' },
                    { bg: 'linear-gradient(135deg, #f093fb, #f5576c)', border: '#f5576c' },
                    { bg: 'linear-gradient(135deg, #4facfe, #00f2fe)', border: '#4facfe' },
                    { bg: 'linear-gradient(135deg, #43e97b, #38f9d7)', border: '#43e97b' },
                    { bg: 'linear-gradient(135deg, #fa709a, #fee140)', border: '#fa709a' },
                    { bg: 'linear-gradient(135deg, #a18cd1, #fbc2eb)', border: '#a18cd1' },
                    { bg: 'linear-gradient(135deg, #ff9a9e, #fecfef)', border: '#ff9a9e' },
                    { bg: 'linear-gradient(135deg, #96fbc4, #f9f586)', border: '#96fbc4' },
                    { bg: 'linear-gradient(135deg, #30cfd0, #5B86E5)', border: '#30cfd0' },
                    { bg: 'linear-gradient(135deg, #d299c2, #fef9d7)', border: '#d299c2' }
                ];
                const uniqueSuppliers = [...new Set(unmapped.products.map(p => p.supplier_name))];
                const supplierColorMap = {};
                uniqueSuppliers.forEach((s, i) => {
                    supplierColorMap[s] = supplierColors[i % supplierColors.length];
                });

                return `
                <div class="mapping-hint" style="background:var(--bg-tertiary);padding:1rem;border-radius:8px;margin-bottom:1rem;">
                    <i class="fas fa-info-circle"></i> <strong>วิธีใช้:</strong> คลิกที่การ์ดสินค้า → เลือกกลุ่ม → เสร็จ! ง่ายๆ แค่นี้
                    <div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.5rem;">
                        ${uniqueSuppliers.map(s => `
                            <span style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.8rem;padding:0.25rem 0.5rem;border-radius:4px;background:var(--bg-secondary);border-left:3px solid ${supplierColorMap[s].border};">
                                ${s}
                            </span>
                        `).join('')}
                    </div>
                </div>
                <div id="mappingCards" class="mapping-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
                    ${unmapped.products.map(p => {
                    const color = supplierColorMap[p.supplier_name];
                    return `
                        <div class="mapping-card" data-id="${p.id}" data-name="${p.product_name.toLowerCase()}" data-supplier="${p.supplier_name.toLowerCase()}"
                             onclick="app.showQuickGroupPopup(${p.id}, '${p.product_name.replace(/'/g, "\\'")}', '${p.supplier_name.replace(/'/g, "\\'")}')"
                             onmouseenter="this.style.border='2px solid ${color.border}';this.style.borderLeft='4px solid ${color.border}';this.style.boxShadow='0 4px 12px ${color.border}40'"
                             onmouseleave="this.style.border='2px solid ${color.border}30';this.style.borderLeft='4px solid ${color.border}';this.style.boxShadow='none'"
                             style="background:var(--bg-secondary);border-radius:12px;padding:1rem;cursor:pointer;border:2px solid ${color.border}30;border-left:4px solid ${color.border};transition:all 0.2s;">
                            <div style="display:flex;align-items:center;gap:0.75rem;">
                                <div style="width:40px;height:40px;border-radius:8px;background:${color.bg};display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">
                                    ${(() => {
                            // Extract actual company name (skip บริษัท, หจก., ห้างหุ้นส่วน, etc.)
                            const name = p.supplier_name;
                            const prefixes = ['บริษัท', 'หจก.', 'ห้างหุ้นส่วน', 'บจก.', 'บมจ.'];
                            let cleanName = name;
                            for (const prefix of prefixes) {
                                if (cleanName.startsWith(prefix)) {
                                    cleanName = cleanName.substring(prefix.length).trim();
                                    break;
                                }
                            }
                            // Get first non-space character
                            return cleanName.trim().charAt(0).toUpperCase();
                        })()}
                                </div>
                                <div style="flex:1;overflow:hidden;">
                                    <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escHtml(p.product_name)}</div>
                                    <div style="font-size:0.85rem;color:${color.border};font-weight:500;">${this.escHtml(p.supplier_name)}</div>
                                </div>
                                <i class="fas fa-chevron-right" style="color:var(--text-muted);"></i>
                            </div>
                            <div style="margin-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
                                <span class="badge badge-secondary" style="font-size:0.75rem;">${this.escHtml(p.product_code)}</span>
                                <span class="badge badge-info" style="font-size:0.75rem;">฿${(p.price || 0).toLocaleString()}</span>
                            </div>
                        </div>
                    `}).join('')}
                </div>
            `})()}
        `;

        // Add hover styles
        const style = document.createElement('style');
        style.textContent = `
            .mapping-card:hover { transform: translateY(-2px); }
            .group-option:hover { background: var(--bg-tertiary) !important; border-color: #667eea !important; }
        `;
        document.head.appendChild(style);
    }

    filterMappingCards(query) {
        const q = query.toLowerCase();
        document.querySelectorAll('.mapping-card').forEach(card => {
            const name = card.dataset.name || '';
            const supplier = card.dataset.supplier || '';
            card.style.display = (name.includes(q) || supplier.includes(q)) ? '' : 'none';
        });
    }

    showQuickGroupPopup(productId, productName, supplierName) {
        const groups = this.productGroups || [];

        const popup = document.createElement('div');
        popup.className = 'modal-overlay active';
        popup.id = 'quickGroupPopup';
        popup.innerHTML = `
            <div class="modal" style="max-width:500px;max-height:80vh;">
                <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2);">
                    <h3><i class="fas fa-layer-group"></i> เลือกกลุ่มสินค้า</h3>
                    <button class="modal-close" onclick="document.getElementById('quickGroupPopup').remove()">&times;</button>
                </div>
                <div class="modal-body" style="padding:1rem;">
                    <div style="background:var(--bg-tertiary);padding:1rem;border-radius:8px;margin-bottom:1rem;">
                        <strong>${productName}</strong><br>
                        <small class="text-muted">${supplierName}</small>
                    </div>
                    <input type="text" id="groupSearch" placeholder="🔍 ค้นหากลุ่ม..." 
                           style="width:100%;padding:0.75rem;border-radius:8px;margin-bottom:1rem;border:1px solid var(--border-color);background:var(--bg-secondary);"
                           oninput="app.filterGroupOptions(this.value)">
                    <div id="groupOptions" style="max-height:350px;overflow-y:auto;display:flex;flex-direction:column;gap:0.5rem;">
                        ${groups.length === 0 ? '<div class="text-muted text-center">ยังไม่มีกลุ่มสินค้า</div>' :
                groups.map(g => `
                            <div class="group-option" data-name="${(g.master_name || '').toLowerCase()}" 
                                 onclick="app.quickMapProduct(${productId}, ${g.id})"
                                 style="padding:1rem;background:var(--bg-secondary);border-radius:8px;cursor:pointer;border:2px solid transparent;transition:all 0.2s;">
                                <div style="font-weight:600;">${this.escHtml(g.master_name)}</div>
                                <div style="font-size:0.85rem;color:var(--text-muted);">
                                    รหัส: ${this.escHtml(g.master_code)} | ${g.product_count || 0} สินค้า
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(popup);
    }

    filterGroupOptions(query) {
        const q = query.toLowerCase();
        document.querySelectorAll('.group-option').forEach(opt => {
            const name = opt.dataset.name || '';
            opt.style.display = name.includes(q) ? '' : 'none';
        });
    }

    async quickMapProduct(productId, groupId) {
        try {
            await api.mapProducts([productId], groupId);
            document.getElementById('quickGroupPopup')?.remove();
            this.showToast('จัดกลุ่มสำเร็จ!', 'success');
            // Remove the card from UI without full reload
            document.querySelector(`.mapping-card[data-id="${productId}"]`)?.remove();
            // Update count
            const countBadge = document.querySelector('.badge-warning');
            if (countBadge) {
                const remaining = document.querySelectorAll('.mapping-card').length;
                countBadge.innerHTML = `<i class="fas fa-box-open"></i> ${remaining} สินค้ายังไม่จัดกลุ่ม`;
                if (remaining === 0) {
                    this.loadMapping(); // Reload to show success message
                }
            }
        } catch (err) {
            this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
        }
    }

    showCreateGroupFromProducts() {
        this.showModal('สร้างกลุ่มสินค้าใหม่', `
            <form id="createGroupForm">
                <div class="form-group">
                    <label>รหัสกลุ่ม *</label>
                    <input type="text" name="master_code" required placeholder="เช่น GRP-001">
                </div>
                <div class="form-group">
                    <label>ชื่อกลุ่ม *</label>
                    <input type="text" name="master_name" required placeholder="เช่น น็อตสแตนเลส M10">
                </div>
            </form>
        `, async () => {
            const form = document.getElementById('createGroupForm');
            const data = Object.fromEntries(new FormData(form));
            await api.createProductGroup(data);
            this.hideModal();
            this.showToast('สร้างกลุ่มสำเร็จ!', 'success');
            this.loadMapping();
        });
    }

    async showMappingSuggestions() {
        try {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay active';
            overlay.id = 'suggestionsModal';
            overlay.innerHTML = `
                <div class="modal" style="max-width:800px;max-height:85vh;">
                    <div class="modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2);">
                        <h3><i class="fas fa-magic"></i> AI คำแนะนำจับคู่สินค้า</h3>
                        <button class="modal-close" onclick="document.getElementById('suggestionsModal').remove()">&times;</button>
                    </div>
                    <div class="modal-body" style="padding:1.5rem;">
                        <div style="text-align:center;padding:2rem;"><i class="fas fa-spinner fa-spin" style="font-size:2rem;color:#667eea;"></i><p style="margin-top:1rem;color:var(--text-muted);">กำลังวิเคราะห์ความคล้ายคลึงของชื่อสินค้า...</p></div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const { suggestions } = await api.getMappingSuggestions();

            const body = overlay.querySelector('.modal-body');
            if (!suggestions || suggestions.length === 0) {
                body.innerHTML = `
                    <div style="text-align:center;padding:2rem;">
                        <i class="fas fa-check-circle" style="font-size:3rem;color:#28a745;"></i>
                        <h3 style="margin-top:1rem;color:#28a745;">ไม่พบคำแนะนำ</h3>
                        <p class="text-muted">ไม่มีสินค้าที่มีชื่อคล้ายกลุ่มสินค้าเพียงพอ หรือจัดกลุ่มครบหมดแล้ว</p>
                    </div>
                `;
                return;
            }

            body.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                    <span class="badge badge-info" style="font-size:0.95rem;padding:0.5rem 1rem;">
                        <i class="fas fa-lightbulb"></i> พบ ${suggestions.length} คำแนะนำ
                    </span>
                    <button class="btn btn-success btn-sm" onclick="app.acceptAllSuggestions()" id="acceptAllBtn">
                        <i class="fas fa-check-double"></i> ยอมรับทั้งหมด
                    </button>
                </div>
                <div style="max-height:55vh;overflow-y:auto;" id="suggestionsList">
                    ${suggestions.map((s, i) => `
                        <div class="suggestion-item" data-index="${i}" data-product-id="${s.product_id}" data-group-id="${s.group_id}"
                             style="display:flex;align-items:center;gap:1rem;padding:1rem;margin-bottom:0.5rem;background:var(--bg-secondary);border-radius:10px;border-left:4px solid ${s.similarity >= 80 ? '#28a745' : s.similarity >= 60 ? '#ffc107' : '#6c757d'};">
                            <div style="flex:1;">
                                <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
                                    <strong>${this.escHtml(s.product_name)}</strong>
                                    <span class="badge badge-secondary" style="font-size:0.7rem;">${this.escHtml(s.supplier_name)}</span>
                                </div>
                                <div style="font-size:0.85rem;color:var(--text-muted);">
                                    <i class="fas fa-arrow-right" style="color:#667eea;"></i> ${this.escHtml(s.group_name)}
                                </div>
                            </div>
                            <div style="text-align:center;min-width:60px;">
                                <div style="font-size:1.2rem;font-weight:700;color:${s.similarity >= 80 ? '#28a745' : s.similarity >= 60 ? '#ffc107' : '#6c757d'};">${s.similarity}%</div>
                                <div style="font-size:0.7rem;color:var(--text-muted);">คล้ายกัน</div>
                            </div>
                            <div style="display:flex;gap:0.5rem;">
                                <button class="btn btn-success btn-sm" onclick="app.acceptSuggestion(${s.product_id}, ${s.group_id}, this)" title="ยอมรับ">
                                    <i class="fas fa-check"></i>
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="this.closest('.suggestion-item').remove(); app.updateSuggestionCount()" title="ข้าม">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (err) {
            this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
        }
    }

    async acceptSuggestion(productId, groupId, btn) {
        try {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            await api.mapProducts([productId], groupId);
            const item = btn.closest('.suggestion-item');
            item.style.background = 'rgba(40,167,69,0.1)';
            item.style.borderLeftColor = '#28a745';
            item.innerHTML = `<div style="flex:1;color:#28a745;"><i class="fas fa-check-circle"></i> จัดกลุ่มสำเร็จ</div>`;
            // Remove the card from the mapping page too
            document.querySelector(`.mapping-card[data-id="${productId}"]`)?.remove();
            this.updateSuggestionCount();
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i>';
            this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
        }
    }

    async acceptAllSuggestions() {
        const items = document.querySelectorAll('.suggestion-item[data-product-id]');
        const acceptBtn = document.getElementById('acceptAllBtn');
        if (items.length === 0) return;

        acceptBtn.disabled = true;
        acceptBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังดำเนินการ...';

        let success = 0;
        for (const item of items) {
            const productId = parseInt(item.dataset.productId);
            const groupId = parseInt(item.dataset.groupId);
            if (!productId || !groupId) continue;
            try {
                await api.mapProducts([productId], groupId);
                item.style.background = 'rgba(40,167,69,0.1)';
                item.style.borderLeftColor = '#28a745';
                item.innerHTML = `<div style="flex:1;color:#28a745;"><i class="fas fa-check-circle"></i> จัดกลุ่มสำเร็จ</div>`;
                item.removeAttribute('data-product-id');
                document.querySelector(`.mapping-card[data-id="${productId}"]`)?.remove();
                success++;
            } catch (e) { /* skip failed */ }
        }

        this.showToast(`จัดกลุ่มสำเร็จ ${success} รายการ`, 'success');
        acceptBtn.innerHTML = '<i class="fas fa-check-double"></i> เสร็จสิ้น';
        this.updateSuggestionCount();
    }

    updateSuggestionCount() {
        const remaining = document.querySelectorAll('.suggestion-item[data-product-id]').length;
        const badge = document.querySelector('#suggestionsModal .badge-info');
        if (badge) badge.innerHTML = `<i class="fas fa-lightbulb"></i> เหลือ ${remaining} คำแนะนำ`;
        // Also update the main mapping count
        const mainBadge = document.querySelector('.badge-warning');
        const mappingCards = document.querySelectorAll('.mapping-card');
        if (mainBadge && mappingCards) {
            mainBadge.innerHTML = `<i class="fas fa-box-open"></i> ${mappingCards.length} สินค้ายังไม่จัดกลุ่ม`;
        }
    }

    async mapSelectedProducts() {
        // Legacy function - kept for compatibility
        const checked = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(c => parseInt(c.value));
        const groupId = document.getElementById('targetGroup')?.value;
        if (!checked.length || !groupId) { this.showAlert('กรุณาเลือกสินค้าและกลุ่ม', 'warning'); return; }
        await api.mapProducts(checked, parseInt(groupId));
        this.loadMapping();
    }

    // Comparison page
    async loadComparison() {
        const wrapper = document.getElementById('contentWrapper');
        const [compData, { categories }] = await Promise.all([api.getPriceComparison(), api.getCategories()]);

        // Calculate summary stats
        const totalGroups = compData.comparison.length;
        const totalProducts = compData.comparison.reduce((sum, c) => sum + c.stats.count, 0);

        wrapper.innerHTML = `
            <div class="page-header" style="margin-bottom:1.5rem;">
                <div class="toolbar" style="flex-wrap:wrap;gap:1rem;">
                    <div class="toolbar-left" style="flex:1;min-width:300px;">
                        <div class="universal-search-container">
                            <div class="universal-search-box">
                                <i class="fas fa-search search-icon"></i>
                                <input type="text" id="universalSearch" placeholder="ค้นหาสินค้า, Supplier, กลุ่มสินค้า..." autocomplete="off">
                                <span class="search-shortcut">⌘K</span>
                            </div>
                            <div class="universal-search-dropdown" id="universalSearchDropdown">
                                <!-- Results will be populated here -->
                            </div>
                        </div>
                    </div>
                    <div class="toolbar-right" style="display:flex;gap:0.75rem;align-items:center;">
                        <select id="filterCategory" class="filter-select" onchange="app.filterComparison(this.value)">
                            <option value="">📦 ทุกหมวดหมู่</option>
                            ${categories.map(c => `<option value="${c.id}">${this.escHtml(c.name)}</option>`).join('')}
                        </select>
                        <button class="btn btn-success" onclick="api.exportPriceComparison()">
                            <i class="fas fa-file-excel"></i> Export Excel
                        </button>
                    </div>
                </div>
            </div>

            <!-- Summary Stats -->
            <div class="stats-grid" style="margin-bottom:1.5rem;">
                <div class="stat-card">
                    <div class="stat-icon blue"><i class="fas fa-layer-group"></i></div>
                    <div class="stat-content">
                        <div class="stat-value">${totalGroups}</div>
                        <div class="stat-label">กลุ่มสินค้า</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon green"><i class="fas fa-building"></i></div>
                    <div class="stat-content">
                        <div class="stat-value">${compData.suppliers.length}</div>
                        <div class="stat-label">Supplier ทั้งหมด</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon orange"><i class="fas fa-box-open"></i></div>
                    <div class="stat-content">
                        <div class="stat-value">${totalProducts}</div>
                        <div class="stat-label">สินค้าที่จัดกลุ่ม</div>
                    </div>
                </div>
            </div>

            <!-- Comparison Cards -->
            <div class="comparison-grid" id="comparisonGrid">
                ${compData.comparison.map(c => {
            // Only get suppliers that have prices for this group
            const activeSuppliers = c.supplierPrices.filter(sp => sp.price > 0);
            const priceDiffPercent = c.stats.min > 0 ? ((c.stats.max - c.stats.min) / c.stats.min * 100).toFixed(1) : 0;

            // Find min and max supplier details
            const minSupplier = activeSuppliers.find(sp => sp.price === c.stats.min);
            const maxSupplier = activeSuppliers.find(sp => sp.price === c.stats.max);
            const formatDate = (d) => d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-';

            return `
                        <div class="comparison-card" data-name="${c.master_name.toLowerCase()}" data-category="${c.category_id || ''}" data-group-id="${c.id}">
                            <div class="comparison-card-header">
                                <div class="product-info">
                                    <span class="product-code">${c.master_code}</span>
                                    <span class="product-divider">|</span>
                                    <span class="product-name">${c.master_name}</span>
                                </div>
                                <button class="btn btn-sm btn-primary" onclick="app.showComparisonChart(${c.group_id})">
                                    <i class="fas fa-chart-line"></i> กราฟ
                                </button>
                            </div>
                            
                            <div class="comparison-stats-row">
                                <div class="stat-mini stat-min">
                                    <span class="stat-label">ต่ำสุด ${minSupplier ? `<small>(${minSupplier.supplier_name})</small>` : ''}</span>
                                    <span class="stat-value">${c.stats.min.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</span>
                                    ${minSupplier?.effective_date ? `<span class="stat-date">${formatDate(minSupplier.effective_date)}</span>` : ''}
                                </div>
                                <div class="stat-mini stat-max">
                                    <span class="stat-label">สูงสุด ${maxSupplier ? `<small>(${maxSupplier.supplier_name})</small>` : ''}</span>
                                    <span class="stat-value">${c.stats.max.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</span>
                                    ${maxSupplier?.effective_date ? `<span class="stat-date">${formatDate(maxSupplier.effective_date)}</span>` : ''}
                                </div>
                                <div class="stat-mini stat-diff">
                                    <span class="stat-label">ส่วนต่าง</span>
                                    <span class="stat-value ${parseFloat(priceDiffPercent) > 20 ? 'text-danger' : 'text-success'}">${priceDiffPercent}%</span>
                                </div>
                                <div class="stat-mini stat-count">
                                    <span class="stat-label">Suppliers</span>
                                    <span class="stat-value">${activeSuppliers.length}</span>
                                </div>
                            </div>

                            <div class="supplier-prices-list">
                                ${activeSuppliers.sort((a, b) => a.price - b.price).map((sp, idx) => {
                const isMin = sp.price === c.stats.min;
                const isMax = sp.price === c.stats.max;
                const rank = idx + 1;
                return `
                                        <div class="supplier-price-row ${isMin ? 'is-lowest' : ''} ${isMax ? 'is-highest' : ''}">
                                            <span class="rank">#${rank}</span>
                                            <span class="supplier-name">${sp.supplier_name}</span>
                                            <span class="price">${sp.price.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</span>
                                            ${isMin ? '<span class="badge badge-success">ต่ำสุด</span>' : ''}
                                            ${isMax ? '<span class="badge badge-danger">สูงสุด</span>' : ''}
                                        </div>
                                    `;
            }).join('')}
                                ${activeSuppliers.length === 0 ? '<div class="no-data">ไม่มีข้อมูลราคา</div>' : ''}
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>

            <style>
                .comparison-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
                    gap: 2rem;
                }
                .comparison-card {
                    background: var(--card-bg);
                    border-radius: 16px;
                    border: 2px solid var(--border-color);
                    overflow: hidden;
                    transition: transform 0.2s, box-shadow 0.2s;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .comparison-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 12px 30px rgba(0,0,0,0.2);
                    border-color: var(--primary-color);
                }
                .comparison-card-header {
                    padding: 1.25rem 1.5rem;
                    background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .comparison-card-header .product-info {
                    display: flex;
                    align-items: center;
                    gap: clamp(0.3rem, 1vw, 0.75rem);
                    flex-wrap: nowrap;
                    white-space: nowrap;
                    overflow: hidden;
                }
                .comparison-card-header .product-code {
                    color: #1e3a5f;
                    font-size: clamp(0.7rem, 1.5vw, 0.95rem);
                    font-weight: 700;
                    background: rgba(255,255,255,0.9);
                    padding: clamp(0.2rem, 0.5vw, 0.3rem) clamp(0.4rem, 1vw, 0.75rem);
                    border-radius: 6px;
                    flex-shrink: 0;
                }
                .comparison-card-header .product-divider {
                    color: rgba(255,255,255,0.7);
                    font-size: clamp(0.9rem, 1.5vw, 1.2rem);
                    font-weight: 300;
                    flex-shrink: 0;
                }
                .comparison-card-header .product-name {
                    color: #1e3a5f;
                    font-size: clamp(0.75rem, 1.5vw, 1.1rem);
                    font-weight: 700;
                    background: rgba(255,255,255,0.9);
                    padding: clamp(0.2rem, 0.5vw, 0.3rem) clamp(0.4rem, 1vw, 0.75rem);
                    border-radius: 6px;
                }
                .comparison-stats-row {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    background: var(--card-bg);
                    padding: 1rem;
                    gap: 1rem;
                    border-bottom: 1px solid var(--border-color);
                }
                .stat-mini {
                    text-align: center;
                    padding: 0.5rem;
                    border-radius: 8px;
                    background: var(--card-bg);
                    border: 1px solid var(--border-color);
                    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
                }
                .stat-mini .stat-label {
                    display: block;
                    font-size: 0.7rem;
                    color: var(--text-secondary);
                    margin-bottom: 0.25rem;
                }
                .stat-mini .stat-label small {
                    color: var(--primary-color);
                    font-size: 0.65rem;
                }
                .stat-mini .stat-value {
                    font-weight: 600;
                    font-size: 0.9rem;
                }
                .stat-mini .stat-date {
                    display: block;
                    font-size: 0.65rem;
                    color: var(--text-muted);
                    margin-top: 0.15rem;
                }
                .stat-min .stat-value { color: #10b981; }
                .stat-max .stat-value { color: #ef4444; }
                .stat-count .stat-value { color: #6366f1; }
                .supplier-prices-list {
                    padding: 1rem;
                    background: var(--card-bg);
                }
                .supplier-price-row {
                    display: flex;
                    align-items: center;
                    padding: 0.6rem 0.75rem;
                    border-radius: 8px;
                    margin-bottom: 0.5rem;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    transition: background 0.2s, border-color 0.2s;
                }
                .supplier-price-row:hover {
                    background: rgba(59,130,246,0.1);
                    border-color: var(--primary-color);
                }
                .supplier-price-row .rank {
                    width: 30px;
                    font-weight: 600;
                    color: var(--text-secondary);
                }
                .supplier-price-row .supplier-name {
                    flex: 1;
                    font-size: 0.9rem;
                }
                .supplier-price-row .price {
                    font-weight: 600;
                    margin-right: 0.5rem;
                }
                .supplier-price-row.is-lowest {
                    background: rgba(16,185,129,0.1);
                    border-left: 3px solid #10b981;
                }
                .supplier-price-row.is-highest {
                    background: rgba(239,68,68,0.1);
                    border-left: 3px solid #ef4444;
                }
                .no-data {
                    text-align: center;
                    color: var(--text-secondary);
                    padding: 1rem;
                }
                .text-danger { color: #ef4444; }
                .text-success { color: #10b981; }
            </style>
        `;

        // Universal search functionality
        this.setupUniversalSearch(compData.comparison, compData.suppliers);
    }

    setupUniversalSearch(groups, suppliers) {
        const searchInput = document.getElementById('universalSearch');
        const dropdown = document.getElementById('universalSearchDropdown');
        if (!searchInput || !dropdown) return;

        let debounceTimer;

        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const query = e.target.value.toLowerCase().trim();

                if (query.length < 2) {
                    dropdown.classList.remove('active');
                    // Also filter cards
                    document.querySelectorAll('.comparison-card').forEach(card => {
                        card.style.display = '';
                    });
                    return;
                }

                // Search in product groups
                const matchedGroups = groups.filter(g =>
                    g.master_name.toLowerCase().includes(query)
                ).slice(0, 5);

                // Search in suppliers
                const matchedSuppliers = suppliers.filter(s =>
                    (s.name && s.name.toLowerCase().includes(query)) ||
                    (s.company_name && s.company_name.toLowerCase().includes(query))
                ).slice(0, 5);

                // Also filter visible cards
                document.querySelectorAll('.comparison-card').forEach(card => {
                    const name = card.dataset.name;
                    card.style.display = name.includes(query) ? '' : 'none';
                });

                // Build dropdown HTML
                let html = '';

                if (matchedGroups.length > 0) {
                    html += `<div class="search-category"><i class="fas fa-layer-group"></i> กลุ่มสินค้า</div>`;
                    matchedGroups.forEach(g => {
                        html += `
                            <div class="search-result-item" onclick="app.scrollToGroup(${g.id})">
                                <div class="search-result-icon group"><i class="fas fa-cubes"></i></div>
                                <div class="search-result-content">
                                    <div class="search-result-title">${this.escHtml(g.master_name)}</div>
                                    <div class="search-result-subtitle">${g.product_count || 0} สินค้า</div>
                                </div>
                                <span class="search-result-badge badge-info">กลุ่มสินค้า</span>
                            </div>
                        `;
                    });
                }

                if (matchedSuppliers.length > 0) {
                    html += `<div class="search-category"><i class="fas fa-building"></i> Supplier</div>`;
                    matchedSuppliers.forEach(s => {
                        html += `
                            <div class="search-result-item" onclick="app.navigateTo('suppliers')">
                                <div class="search-result-icon supplier"><i class="fas fa-store"></i></div>
                                <div class="search-result-content">
                                    <div class="search-result-title">${s.name || s.company_name}</div>
                                    <div class="search-result-subtitle">${this.escHtml(s.email) || '-'}</div></div>
                                </div>
                                <span class="search-result-badge badge-success">Supplier</span>
                            </div>
                        `;
                    });
                }

                if (!html) {
                    html = `
                        <div class="search-no-results">
                            <i class="fas fa-search"></i>
                            <p>ไม่พบผลลัพธ์สำหรับ "${query}"</p>
                        </div>
                    `;
                }

                dropdown.innerHTML = html;
                dropdown.classList.add('active');
            }, 200);
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });

        // Keyboard shortcut (Cmd+K or Ctrl+K)
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchInput.focus();
            }
        });
    }

    scrollToGroup(groupId) {
        const card = document.querySelector(`.comparison-card[data-group-id="${groupId}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.animation = 'pulse 0.5s ease-out';
            setTimeout(() => card.style.animation = '', 500);
        }
        document.getElementById('universalSearchDropdown')?.classList.remove('active');
    }

    async exportAllToExcel() {
        try {
            const btn = event.target.closest('button');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลัง Export...';
            btn.disabled = true;

            const token = localStorage.getItem('token');
            const response = await fetch('/api/procurement/export-all', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Export_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

            btn.innerHTML = originalText;
            btn.disabled = false;
            alert('Export สำเร็จ!');
        } catch (err) {
            console.error('Export error:', err);
            alert('เกิดข้อผิดพลาดในการ Export');
            const btn = event.target.closest('button');
            btn.innerHTML = '<i class="fas fa-file-excel"></i> Export to Excel';
            btn.disabled = false;
        }
    }

    renderDashboardCharts(chartData) {
        // Destroy existing charts before re-rendering (fixes "canvas already in use" error)
        const chartIds = ['supplierChart', 'priceRangeChart', 'topPricesChart', 'supplierActivityChart',
            'mappingStatusChart', 'lowestPricesChart', 'monthlyChart', 'categoryChart',
            'avgPriceTrendChart', 'recentPriceSparkline'];
        chartIds.forEach(id => {
            const canvas = document.getElementById(id);
            if (canvas) {
                const existing = Chart.getChart(canvas);
                if (existing) existing.destroy();
            }
        });

        const chartTheme = this.getChartColors();
        const colors = chartTheme.lineColors;

        // 1. Products by Supplier (Doughnut Chart)
        const supplierCtx = document.getElementById('supplierChart');
        if (supplierCtx && chartData.productsBySupplier?.length) {
            new Chart(supplierCtx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: chartData.productsBySupplier.map(s => s.supplier_name),
                    datasets: [{
                        data: chartData.productsBySupplier.map(s => s.product_count),
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: chartTheme.bgColor
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { color: chartTheme.tickColor, boxWidth: 12, padding: 8 }
                        }
                    }
                }
            });
        }

        // 2. Monthly Price Updates (Line Chart)
        const monthlyCtx = document.getElementById('monthlyChart');
        if (monthlyCtx && chartData.monthlyUpdates?.length) {
            new Chart(monthlyCtx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: chartData.monthlyUpdates.map(m => m.month),
                    datasets: [{
                        label: 'จำนวนอัพเดต',
                        data: chartData.monthlyUpdates.map(m => m.update_count),
                        borderColor: colors[0],
                        backgroundColor: colors[0] + '30',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: chartTheme.gridColor }, ticks: { color: chartTheme.tickColor } },
                        x: { grid: { display: false }, ticks: { color: chartTheme.tickColor } }
                    }
                }
            });
        }

        // 3. Price Range Distribution (Bar Chart)
        const priceRangeCtx = document.getElementById('priceRangeChart');
        if (priceRangeCtx && chartData.priceRanges?.length) {
            new Chart(priceRangeCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: chartData.priceRanges.map(r => r.price_range + ' บาท'),
                    datasets: [{
                        label: 'จำนวนสินค้า',
                        data: chartData.priceRanges.map(r => r.count),
                        backgroundColor: [colors[1], colors[2], colors[3], colors[4], colors[5]],
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: chartTheme.gridColor }, ticks: { color: chartTheme.tickColor } },
                        x: { grid: { display: false }, ticks: { color: chartTheme.tickColor } }
                    }
                }
            });
        }

        // 4. Top 5 Highest Prices (Horizontal Bar Chart)
        const topPricesCtx = document.getElementById('topPricesChart');
        if (topPricesCtx && chartData.topPrices?.length) {
            new Chart(topPricesCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: chartData.topPrices.map(p => p.product_name.substring(0, 20) + (p.product_name.length > 20 ? '...' : '')),
                    datasets: [{
                        label: 'ราคา (บาท)',
                        data: chartData.topPrices.map(p => p.price),
                        backgroundColor: colors[0],
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, grid: { color: chartTheme.gridColor }, ticks: { color: chartTheme.tickColor } },
                        y: { grid: { display: false }, ticks: { color: chartTheme.tickColor } }
                    }
                }
            });
        }

        // 5. Average Price Trend (Area Chart with min/max)
        const avgPriceCtx = document.getElementById('avgPriceTrendChart');
        if (avgPriceCtx && chartData.avgPriceTrend?.length) {
            new Chart(avgPriceCtx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: chartData.avgPriceTrend.map(m => m.month),
                    datasets: [
                        {
                            label: 'ราคาเฉลี่ย',
                            data: chartData.avgPriceTrend.map(m => m.avg_price?.toFixed(2)),
                            borderColor: colors[0],
                            backgroundColor: colors[0] + '40',
                            fill: true,
                            tension: 0.4
                        },
                        {
                            label: 'ราคาสูงสุด',
                            data: chartData.avgPriceTrend.map(m => m.max_price),
                            borderColor: colors[3],
                            borderDash: [5, 5],
                            fill: false,
                            tension: 0.4
                        },
                        {
                            label: 'ราคาต่ำสุด',
                            data: chartData.avgPriceTrend.map(m => m.min_price),
                            borderColor: colors[2],
                            borderDash: [5, 5],
                            fill: false,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: chartTheme.tickColor, boxWidth: 12 } } },
                    scales: {
                        y: { beginAtZero: false, grid: { color: chartTheme.gridColor }, ticks: { color: chartTheme.tickColor } },
                        x: { grid: { display: false }, ticks: { color: chartTheme.tickColor } }
                    }
                }
            });
        }

        // 6. Supplier Activity (Bar Chart)
        const supplierActivityCtx = document.getElementById('supplierActivityChart');
        if (supplierActivityCtx && chartData.supplierActivity?.length) {
            new Chart(supplierActivityCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: chartData.supplierActivity.map(s => s.supplier_name.substring(0, 15) + (s.supplier_name.length > 15 ? '...' : '')),
                    datasets: [{
                        label: 'จำนวนอัพเดต',
                        data: chartData.supplierActivity.map(s => s.update_count),
                        backgroundColor: colors.slice(0, chartData.supplierActivity.length),
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: chartTheme.gridColor }, ticks: { color: chartTheme.tickColor } },
                        x: { grid: { display: false }, ticks: { color: chartTheme.tickColor, maxRotation: 45 } }
                    }
                }
            });
        }

        // 7. Mapping Status (Pie Chart)
        const mappingStatusCtx = document.getElementById('mappingStatusChart');
        if (mappingStatusCtx && chartData.mappingStatus?.length) {
            new Chart(mappingStatusCtx.getContext('2d'), {
                type: 'pie',
                data: {
                    labels: chartData.mappingStatus.map(m => m.status),
                    datasets: [{
                        data: chartData.mappingStatus.map(m => m.count),
                        backgroundColor: [colors[2], colors[4]],
                        borderWidth: 2,
                        borderColor: chartTheme.bgColor
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { color: chartTheme.tickColor, boxWidth: 12, padding: 10 }
                        }
                    }
                }
            });
        }

        // 8. Lowest Prices (Horizontal Bar Chart)
        const lowestPricesCtx = document.getElementById('lowestPricesChart');
        if (lowestPricesCtx && chartData.lowestPrices?.length) {
            new Chart(lowestPricesCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: chartData.lowestPrices.map(p => p.product_name.substring(0, 20) + (p.product_name.length > 20 ? '...' : '')),
                    datasets: [{
                        label: 'ราคา (บาท)',
                        data: chartData.lowestPrices.map(p => p.price),
                        backgroundColor: colors[2],
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, grid: { color: chartTheme.gridColor }, ticks: { color: chartTheme.tickColor } },
                        y: { grid: { display: false }, ticks: { color: chartTheme.tickColor } }
                    }
                }
            });
        }
    }

    setupDashboardSearch(groups, suppliers) {
        const searchInput = document.getElementById('dashboardSearch');
        const dropdown = document.getElementById('dashboardSearchDropdown');
        if (!searchInput || !dropdown) return;

        let debounceTimer;

        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const query = e.target.value.toLowerCase().trim();

                if (query.length < 2) {
                    dropdown.classList.remove('active');
                    return;
                }

                // Search in product groups
                const matchedGroups = groups.filter(g =>
                    (g.master_name && g.master_name.toLowerCase().includes(query)) ||
                    (g.master_code && g.master_code.toLowerCase().includes(query))
                ).slice(0, 5);

                // Search in individual products (inside supplierPrices)
                const matchedProducts = [];
                groups.forEach(g => {
                    (g.supplierPrices || []).forEach(sp => {
                        if (matchedProducts.length >= 8) return;
                        const nameMatch = sp.product_name && sp.product_name.toLowerCase().includes(query);
                        const codeMatch = sp.product_code && sp.product_code.toLowerCase().includes(query);
                        const supplierMatch = sp.supplier_name && sp.supplier_name.toLowerCase().includes(query);
                        if (nameMatch || codeMatch || supplierMatch) {
                            matchedProducts.push({ ...sp, group_name: g.master_name });
                        }
                    });
                });

                // Search in suppliers
                const matchedSuppliers = suppliers.filter(s =>
                    (s.name && s.name.toLowerCase().includes(query)) ||
                    (s.company_name && s.company_name.toLowerCase().includes(query)) ||
                    (s.code && s.code.toLowerCase().includes(query))
                ).slice(0, 5);

                // Build dropdown HTML
                let html = '';

                if (matchedGroups.length > 0) {
                    html += `<div class="search-category"><i class="fas fa-layer-group"></i> กลุ่มสินค้า</div>`;
                    matchedGroups.forEach(g => {
                        html += `
                            <div class="search-result-item" onclick="app.goToComparison('${this.escHtml(g.master_name)}')">
                                <div class="search-result-icon group"><i class="fas fa-cubes"></i></div>
                                <div class="search-result-content">
                                    <div class="search-result-title">${this.escHtml(g.master_name)}</div>
                                    <div class="search-result-subtitle">${g.master_code || ''} · ${g.supplierPrices?.length || 0} สินค้า</div>
                                </div>
                                <span class="search-result-badge badge-info">กลุ่มสินค้า</span>
                            </div>
                        `;
                    });
                }

                if (matchedProducts.length > 0) {
                    html += `<div class="search-category"><i class="fas fa-box"></i> สินค้า</div>`;
                    matchedProducts.forEach(p => {
                        html += `
                            <div class="search-result-item" onclick="app.navigateTo('all-products')">
                                <div class="search-result-icon" style="background:#3b82f6;"><i class="fas fa-tag"></i></div>
                                <div class="search-result-content">
                                    <div class="search-result-title">${this.escHtml(p.product_name)}</div>
                                    <div class="search-result-subtitle">${this.escHtml(p.supplier_name)} · ${p.price?.toLocaleString() || '-'} ฿</div>
                                </div>
                                <span class="search-result-badge badge-primary">${this.escHtml(p.group_name)}</span>
                            </div>
                        `;
                    });
                }

                if (matchedSuppliers.length > 0) {
                    html += `<div class="search-category"><i class="fas fa-building"></i> Supplier</div>`;
                    matchedSuppliers.forEach(s => {
                        html += `
                            <div class="search-result-item" onclick="app.navigateTo('suppliers')">
                                <div class="search-result-icon supplier"><i class="fas fa-store"></i></div>
                                <div class="search-result-content">
                                    <div class="search-result-title">${s.name || s.company_name}</div>
                                    <div class="search-result-subtitle">${this.escHtml(s.email) || '-'}</div>
                                </div>
                                <span class="search-result-badge badge-success">Supplier</span>
                            </div>
                        `;
                    });
                }

                if (!html) {
                    html = `
                        <div class="search-no-results">
                            <i class="fas fa-search"></i>
                            <p>ไม่พบผลลัพธ์สำหรับ "${query}"</p>
                        </div>
                    `;
                }

                dropdown.innerHTML = html;
                dropdown.classList.add('active');
            }, 200);
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });

        // Keyboard shortcut (Cmd+K or Ctrl+K)
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchInput.focus();
            }
        });
    }

    goToComparison(searchTerm) {
        // Navigate to comparison page and search for the term
        this.navigateTo('comparison');
        // After a brief delay to let the page load, trigger the search
        setTimeout(() => {
            const searchInput = document.getElementById('universalSearch');
            if (searchInput) {
                searchInput.value = searchTerm;
                searchInput.dispatchEvent(new Event('input'));
            }
        }, 500);
    }

    filterComparison(categoryId) {
        document.querySelectorAll('.comparison-card').forEach(card => {
            if (!categoryId || card.dataset.category === categoryId) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    }

    async showComparisonChart(groupId) {
        const { group, chartData } = await api.getPriceComparisonChart(groupId);
        const chartTheme = this.getChartColors();
        const colors = chartTheme.lineColors;
        const colorNames = ['ฟ้า', 'เขียว', 'ส้ม', 'แดง', 'ม่วง', 'ชมพู', 'ฟ้าเข้ม', 'เขียวเข้ม'];

        // Calculate stats from chartData - use LATEST month prices only
        const latestPrices = chartData.map(d => {
            const latestEntry = d.history[d.history.length - 1];
            return {
                supplier: d.supplier,
                price: latestEntry ? latestEntry.price : null,
                date: latestEntry ? latestEntry.effective_date : null
            };
        }).filter(p => p.price !== null);

        const latestPriceValues = latestPrices.map(p => p.price);
        const minLatest = latestPriceValues.length > 0 ? Math.min(...latestPriceValues) : 0;
        const maxLatest = latestPriceValues.length > 0 ? Math.max(...latestPriceValues) : 0;
        const avgLatest = latestPriceValues.length > 0
            ? latestPriceValues.reduce((a, b) => a + b, 0) / latestPriceValues.length
            : 0;

        // Find supplier with min/max latest prices
        const minSupplier = latestPrices.find(p => p.price === minLatest)?.supplier || '-';
        const maxSupplier = latestPrices.find(p => p.price === maxLatest)?.supplier || '-';

        // For historical stats (all time) - find the lowest price ever with supplier and date
        const allPricesWithInfo = chartData.flatMap(d =>
            d.history.map(h => ({
                price: h.price,
                supplier: d.supplier,
                date: h.effective_date
            }))
        );
        const minPriceInfo = allPricesWithInfo.reduce((min, p) =>
            (!min || p.price < min.price) ? p : min, null);
        const minPrice = minPriceInfo?.price || 0;
        const minPriceSupplier = minPriceInfo?.supplier || '-';
        const minPriceDate = minPriceInfo?.date || null;
        const maxPrice = allPricesWithInfo.length > 0 ? Math.max(...allPricesWithInfo.map(p => p.price)) : 0;
        const avgPrice = allPricesWithInfo.length > 0 ? allPricesWithInfo.reduce((a, b) => a + b.price, 0) / allPricesWithInfo.length : 0;

        // Get all unique dates and sort
        const allDates = [...new Set(chartData.flatMap(d => d.history.map(h => h.effective_date)))].sort();

        // Remove duplicate month-year labels (keep only unique months)
        const uniqueMonthDates = [];
        const seenMonths = new Set();
        allDates.forEach(dateStr => {
            const d = new Date(dateStr);
            const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
            if (!seenMonths.has(monthKey)) {
                seenMonths.add(monthKey);
                uniqueMonthDates.push(dateStr);
            }
        });

        // Format dates to D/M/YYYY (CE year)
        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            const d = new Date(dateStr);
            const year = d.getFullYear();
            if (isNaN(d.getTime()) || year < 1900 || year > 2100) {
                return '-';
            }
            return `${d.getDate()}/${d.getMonth() + 1}/${year}`;
        };

        // Get latest month name for display
        const latestMonth = latestPrices[0]?.date ? formatDate(latestPrices[0].date) : 'ล่าสุด';

        // Get current year for display
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();

        // Store chart data for filter updates
        this.comparisonChartData = chartData;
        this.comparisonGroupId = groupId;
        this.comparisonColors = colors;
        this.comparisonChartTheme = chartTheme;

        // Render full comparison page
        const wrapper = document.getElementById('contentWrapper');
        document.getElementById('pageTitle').innerHTML = `เปรียบเทียบราคา: <span style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:0.25rem 0.75rem;border-radius:6px;font-weight:700;">${group.master_name}</span>`;

        wrapper.innerHTML = `
            <div class="toolbar mb-4">
                <div class="toolbar-left">
                    <button class="btn btn-secondary" onclick="app.loadComparison()">
                        <i class="fas fa-arrow-left"></i> กลับ
                    </button>
                    <span class="ml-4" style="font-size:1.1rem;font-weight:700;background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:0.4rem 1rem;border-radius:8px;box-shadow:0 2px 8px rgba(102,126,234,0.3);">
                        <i class="fas fa-layer-group" style="margin-right:0.5rem;"></i>${group.master_name}
                    </span>
                </div>
                <div class="toolbar-right" style="display:flex;gap:0.5rem;align-items:center;">
                    <button class="btn btn-danger btn-sm" onclick="app.exportComparisonPDF()" title="Export PDF">
                        <i class="fas fa-file-pdf"></i> Export PDF
                    </button>
                    <select id="yearSelect" class="filter-select" onchange="app.updateComparisonChart(this.value)">
                        <option value="all">ทั้งหมด</option>
                        <option value="${currentYear}" selected>${currentYear}</option>
                        <option value="${currentYear - 1}">${currentYear - 1}</option>
                        <option value="${currentYear - 2}">${currentYear - 2}</option>
                    </select>
                </div>
            </div>

            <!-- Stats Cards - Using LATEST month prices -->
            <div class="comparison-stats-grid">
                <div class="comparison-stat-card green">
                    <div class="stat-badge"><i class="fas fa-arrow-down"></i> ราคาต่ำสุด (${latestMonth})</div>
                    <div class="stat-price">${minLatest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</div>
                    <div class="stat-supplier">${minSupplier}</div>
                </div>
                <div class="comparison-stat-card blue">
                    <div class="stat-badge"><i class="fas fa-arrow-up"></i> ราคาสูงสุด (${latestMonth})</div>
                    <div class="stat-price">${maxLatest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</div>
                    <div class="stat-supplier">${maxSupplier}</div>
                </div>
                <div class="comparison-stat-card purple">
                    <div class="stat-badge"><i class="fas fa-chart-bar"></i> ราคาเฉลี่ย (${latestMonth})</div>
                    <div class="stat-price">${avgLatest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</div>
                    <div class="stat-supplier">จาก ${chartData.length} Supplier</div>
                </div>
                <div class="comparison-stat-card orange">
                    <div class="stat-badge"><i class="fas fa-trophy"></i> ราคาที่เคยถูกที่สุด</div>
                    <div class="stat-price">${minPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</div>
                    <div class="stat-supplier">${minPriceSupplier}${minPriceDate ? ` (${formatDate(minPriceDate)})` : ''}</div>
                </div>
            </div>

            <!-- Chart -->
            <div class="card mt-4">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-chart-line"></i> กราฟเปรียบเทียบราคารายเดือน ปี ${currentYear}</h3>
                </div>
                <div class="card-body">
                    <div class="chart-container" style="height:350px">
                        <canvas id="compChart"></canvas>
                    </div>
                    <div class="chart-legend">
                        ${chartData.map((d, i) => `
                            <span class="legend-item ${d.isOutdated ? 'legend-outdated' : ''}">
                                <span class="legend-color" style="background:${colors[i % colors.length]}${d.isOutdated ? ';opacity:0.5' : ''}"></span>
                                ${d.supplier}
                                ${d.isOutdated ? `<span style="color:#ffc107;font-size:0.75rem;"> (${d.daysSinceUpdate.toLocaleString()} วันที่แล้ว)</span>` : ''}
                            </span>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- Supplier Table -->
            <div class="card mt-4">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-building"></i> รายละเอียด Supplier</h3>
                </div>
                <div class="card-body">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>SUPPLIER</th>
                                <th>รหัสสินค้า</th>
                                <th>ราคาล่าสุด</th>
                                <th>อัพเดทล่าสุด</th>
                                <th>สถานะ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${chartData.map((d, i) => {
            const latest = d.history[d.history.length - 1];
            const isLowest = latest && latest.price === minPrice;
            return `
                                    <tr class="${d.isOutdated ? 'row-outdated' : ''}">
                                        <td>
                                            <span class="supplier-dot" style="background:${colors[i % colors.length]}"></span>
                                            ${d.supplier}
                                        </td>
                                        <td>
                                            <span id="productCode_${d.productId}">${d.productCode || '-'}</span>
                                            <button class="btn btn-xs btn-ghost" onclick="app.editProductCode(${d.productId}, '${(d.productCode || '').replace(/'/g, "\\'")}', '${d.supplier.replace(/'/g, "\\'")}')" title="แก้ไขรหัสสินค้า">
                                                <i class="fas fa-pencil-alt"></i>
                                            </button>
                                        </td>
                                        <td class="${isLowest ? 'price-lowest' : ''}">
                                            ${latest ? latest.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'} บาท
                                            ${d.isOutdated ? '<br><small style="color:#ffc107;">(ไม่ใช่ราคาปัจจุบัน)</small>' : ''}
                                        </td>
                                        <td>
                                            ${d.lastUpdateDate ? formatDate(d.lastUpdateDate) : '-'}
                                            ${d.isOutdated ? `<br><small style="color:#ffc107;">${d.daysSinceUpdate.toLocaleString()} วันที่แล้ว</small>` : '<br><small style="color:#28a745;">ปัจจุบัน</small>'}
                                        </td>
                                        <td>
                                            ${d.isOutdated
                    ? '<span class="badge badge-warning"><i class="fas fa-clock"></i> ราคาเก่า</span>'
                    : (isLowest
                        ? '<span class="badge badge-success"><i class="fas fa-check"></i> แนะนำ</span>'
                        : '<span class="badge badge-default">ปกติ</span>')}
                                        </td>
                                    </tr>
                                `;
        }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Render chart with initial filter (current year)
        this.updateComparisonChart(currentYear.toString());
    }

    updateComparisonChart(yearFilter) {
        const chartData = this.comparisonChartData;
        const colors = this.comparisonColors;
        const chartTheme = this.comparisonChartTheme;

        if (!chartData) return;

        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth();

        // Generate monthly labels based on filter
        let monthLabels = [];
        if (yearFilter === 'all') {
            // Get all dates from data and extend to current month
            const allDates = chartData.flatMap(d => d.history.map(h => new Date(h.effective_date)));
            const minDate = allDates.length > 0 ? new Date(Math.min(...allDates)) : new Date(currentYear, 0, 1);
            let d = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
            while (d <= currentDate) {
                monthLabels.push(new Date(d));
                d.setMonth(d.getMonth() + 1);
            }
        } else {
            const year = parseInt(yearFilter);
            const endMonth = year === currentYear ? currentMonth : 11;
            for (let m = 0; m <= endMonth; m++) {
                monthLabels.push(new Date(year, m, 1));
            }
        }

        const formatMonthLabel = (date) => {
            const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            return `${months[date.getMonth()]} ${date.getFullYear()}`;
        };

        // Build datasets with extended prices
        const datasets = chartData.map((d, i) => {
            let lastKnownPrice = null;
            let lastPriceMonth = null;

            const data = monthLabels.map((monthDate, idx) => {
                // Find price for this month
                const found = d.history.find(h => {
                    const hDate = new Date(h.effective_date);
                    return hDate.getFullYear() === monthDate.getFullYear() &&
                        hDate.getMonth() === monthDate.getMonth();
                });

                if (found) {
                    lastKnownPrice = found.price;
                    lastPriceMonth = idx;
                    return found.price;
                }

                // If no price for this month, use last known price (extend line)
                if (lastKnownPrice !== null) {
                    return lastKnownPrice;
                }

                return null;
            });

            // Determine if this supplier has outdated data
            const borderDash = d.isOutdated ? [5, 5] : [];

            return {
                label: d.supplier + (d.isOutdated ? ` (${d.daysSinceUpdate.toLocaleString()} วันที่แล้ว)` : ''),
                data: data,
                borderColor: colors[i % colors.length],
                backgroundColor: colors[i % colors.length] + '20',
                tension: 0.4,
                fill: false,
                pointRadius: 4,
                pointHoverRadius: 6,
                borderWidth: d.isOutdated ? 2 : 3,
                borderDash: borderDash
            };
        });

        // Update chart title
        const chartTitle = document.querySelector('.card-title i.fa-chart-line')?.parentElement;
        if (chartTitle) {
            chartTitle.innerHTML = `<i class="fas fa-chart-line"></i> กราฟเปรียบเทียบราคารายเดือน ${yearFilter === 'all' ? '(ทั้งหมด)' : `ปี ${yearFilter}`}`;
        }

        // Destroy existing chart if any
        const canvas = document.getElementById('compChart');
        if (!canvas) return;

        if (this.comparisonChart) {
            this.comparisonChart.destroy();
        }

        const ctx = canvas.getContext('2d');
        this.comparisonChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: monthLabels.map(formatMonthLabel),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
                        titleFont: { size: 14 },
                        bodyFont: { size: 13 },
                        callbacks: {
                            label: (ctx) => {
                                const price = ctx.parsed.y?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '-';
                                const isOutdated = chartData[ctx.datasetIndex]?.isOutdated;
                                return `${ctx.dataset.label.split(' (')[0]}: ${price} บาท${isOutdated ? ' (ราคาเก่า)' : ''}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { color: chartTheme.gridColor },
                        ticks: { color: chartTheme.tickColor }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: chartTheme.tickColor }
                    }
                }
            }
        });
    }

    editProductCode(productId, currentCode, supplierName) {
        this.showModal(`แก้ไขรหัสสินค้า - ${supplierName}`, `
            <form id="editProductCodeForm">
                <div class="form-group">
                    <label>รหัสสินค้า</label>
                    <input type="text" name="product_code" value="${currentCode}" required autofocus>
                </div>
            </form>
        `, async () => {
            const form = document.getElementById('editProductCodeForm');
            const newCode = form.product_code.value.trim();
            if (!newCode) {
                this.showAlert('กรุณากรอกรหัสสินค้า', 'warning');
                return;
            }
            try {
                await api.updateProductCode(productId, newCode);
                this.hideModal();
                this.showToast('บันทึกรหัสสินค้าสำเร็จ!', 'success');
                // Update display
                const codeSpan = document.getElementById(`productCode_${productId}`);
                if (codeSpan) codeSpan.textContent = newCode;
                // Update stored data
                if (this.comparisonChartData) {
                    const item = this.comparisonChartData.find(d => d.productId === productId);
                    if (item) item.productCode = newCode;
                }
            } catch (err) {
                this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
            }
        });
    }

    // ==================== Price History Page ====================
    async loadAllPriceHistory(page = 1, pageSize = 20, supplierId = '') {
        const wrapper = document.getElementById('contentWrapper');
        this.currentHistorySupplierId = supplierId; // Store current filter
        const [{ products, total, totalPages }, { suppliers }] = await Promise.all([
            api.getAllPriceHistory({ page, limit: pageSize, supplier_id: supplierId }),
            api.getProcurementSuppliers()
        ]);

        const startItem = (page - 1) * pageSize + 1;
        const endItem = Math.min(page * pageSize, total);

        wrapper.innerHTML = `
            <div class="page-subtitle">ดูประวัติราคาย้อนหลังจากทุกซัพพลายเออร์</div>
            <div class="toolbar">
                <div class="toolbar-left">
                    <div class="search-input">
                        <i class="fas fa-search"></i>
                        <input type="text" id="searchHistory" placeholder="ค้นหาสินค้า..."><button class="btn btn-primary btn-sm" onclick="document.getElementById('searchHistory').dispatchEvent(new Event('input'))" style="border-radius:8px;padding:0.4rem 0.8rem;white-space:nowrap;margin-left:0.5rem;"><i class="fas fa-search"></i> ค้นหา</button>
                    </div>
                    <select id="filterSupplier" class="filter-select">
                        <option value="">ทุก Supplier</option>
                        ${suppliers.map(s => `<option value="${s.id}" ${String(s.id) === String(supplierId) ? 'selected' : ''}>${this.escHtml(s.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="toolbar-right">
                    <span class="pagination-info">แสดง ${startItem}-${endItem} จาก ${total} รายการ</span>
                    <select id="pageSizeSelect" class="filter-select" style="width:auto">
                        <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 ต่อหน้า</option>
                        <option value="20" ${pageSize === 20 ? 'selected' : ''}>20 ต่อหน้า</option>
                        <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 ต่อหน้า</option>
                        <option value="100" ${pageSize === 100 ? 'selected' : ''}>100 ต่อหน้า</option>
                    </select>
                </div>
            </div>
            <div class="card">
                <div class="card-body">
                    <div class="table-container">
                        <table class="data-table" id="historyTable">
                            <thead>
                                <tr>
                                    <th style="width:60px;text-align:center;">อันดับ</th>
                                    <th>SUPPLIER</th>
                                    <th>รหัสสินค้า</th>
                                    <th>ชื่อสินค้า</th>
                                    <th>ราคาล่าสุด</th>
                                    <th>อัพเดตราคาล่าสุด</th>
                                    <th>จำนวนประวัติ</th>
                                    <th>ดูรายละเอียด</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${products.map((p, index) => `
                                    <tr data-supplier="${p.supplier_id}">
                                        <td style="text-align:center;font-weight:600;color:var(--text-muted);">${startItem + index}</td>
                                        <td>${this.escHtml(p.supplier_name)}</td>
                                        <td>${this.escHtml(p.product_code)}</td>
                                        <td>${this.escHtml(p.product_name)}</td>
                                        <td class="price-cell">${p.price ? p.price.toFixed(2) + ' บาท' : '-'}</td>
                                        <td>${this.formatDate(p.effective_date)}</td>
                                        <td><span class="badge badge-info">${p.history_count} รายการ</span></td>
                                        <td>
                                            <button class="btn btn-primary btn-sm" onclick="app.showProductHistoryModal(${p.id})">
                                                <i class="fas fa-chart-line"></i> ดูกราฟ
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Pagination -->
                    <div class="pagination-container" style="margin-top:1rem;display:flex;justify-content:center;gap:0.5rem;align-items:center;">
                        <button class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="app.loadAllPriceHistory(1, ${pageSize}, '${supplierId}')">
                            <i class="fas fa-angle-double-left"></i>
                        </button>
                        <button class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="app.loadAllPriceHistory(${page - 1}, ${pageSize}, '${supplierId}')">
                            <i class="fas fa-angle-left"></i>
                        </button>
                        <span class="pagination-current" style="padding:0.5rem 1rem;background:var(--primary-color);color:white;border-radius:6px;font-weight:600;">
                            หน้า ${page} / ${totalPages || 1}
                        </span>
                        <button class="btn btn-secondary btn-sm" ${page >= totalPages ? 'disabled' : ''} onclick="app.loadAllPriceHistory(${page + 1}, ${pageSize}, '${supplierId}')">
                            <i class="fas fa-angle-right"></i>
                        </button>
                        <button class="btn btn-secondary btn-sm" ${page >= totalPages ? 'disabled' : ''} onclick="app.loadAllPriceHistory(${totalPages}, ${pageSize}, '${supplierId}')">
                            <i class="fas fa-angle-double-right"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Search filter (client-side for current page)
        document.getElementById('searchHistory').addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            let visibleIndex = 1;
            document.querySelectorAll('#historyTable tbody tr').forEach(tr => {
                if (tr.textContent.toLowerCase().includes(term)) {
                    tr.style.display = '';
                    const numCell = tr.querySelector('td:first-child');
                    if (numCell) numCell.textContent = visibleIndex++;
                } else {
                    tr.style.display = 'none';
                }
            });
        });


        // Supplier filter (reload with filter from server)
        document.getElementById('filterSupplier').addEventListener('change', (e) => {
            const supplierId = e.target.value;
            const currentPageSize = parseInt(document.getElementById('pageSizeSelect').value);
            this.loadAllPriceHistory(1, currentPageSize, supplierId);
        });

        // Page size change (preserve supplier filter)
        document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
            const supplierId = this.currentHistorySupplierId || '';
            this.loadAllPriceHistory(1, parseInt(e.target.value), supplierId);
        });
    }

    async showProductHistoryModal(productId) {
        const { product, history, stats } = await api.getProductPriceHistoryDetail(productId);

        // Format dates to D/M/YYYY (CE year) with validation
        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            const d = new Date(dateStr);
            const year = d.getFullYear();
            // Validate year is within reasonable range (1900-2100)
            if (isNaN(d.getTime()) || year < 1900 || year > 2100) {
                return '-';
            }
            return `${d.getDate()}/${d.getMonth() + 1}/${year}`;
        };

        const modalContent = `
            <div class="history-modal-content">
                <!-- Product Info -->
                <div class="product-info mb-4">
                    <div><strong>Supplier:</strong> ${product.supplier_name}</div>
                    <div><strong>รหัสสินค้า:</strong> ${this.escHtml(product.product_code)}</div>
                    <div><strong>หน่วย:</strong> ${product.unit || 'N/A'}</div>
                </div>

                <!-- Stats Cards -->
                <div class="comparison-stats-grid mb-4">
                    <div class="comparison-stat-card green">
                        <div class="stat-badge"><i class="fas fa-arrow-down"></i> ราคาถูกสุด</div>
                        <div class="stat-price">${stats.min.toFixed(2)} บาท</div>
                    </div>
                    <div class="comparison-stat-card blue">
                        <div class="stat-badge"><i class="fas fa-arrow-up"></i> ราคาแพงสุด</div>
                        <div class="stat-price">${stats.max.toFixed(2)} บาท</div>
                    </div>
                    <div class="comparison-stat-card purple">
                        <div class="stat-badge"><i class="fas fa-chart-bar"></i> ราคาเฉลี่ย</div>
                        <div class="stat-price">${stats.average.toFixed(2)} บาท</div>
                    </div>
                    <div class="comparison-stat-card orange">
                        <div class="stat-badge"><i class="fas fa-tag"></i> ราคาล่าสุด</div>
                        <div class="stat-price">${stats.current.toFixed(2)} บาท</div>
                    </div>
                </div>

                <!-- Chart -->
                <div class="chart-container mb-4" style="height:300px">
                    <canvas id="historyDetailChart"></canvas>
                </div>

                <!-- History Table -->
                <div class="table-container" style="max-height:250px;overflow-y:auto">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>วันที่</th>
                                <th>ราคา</th>
                                <th>หมายเหตุ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${history.slice(0, 20).map(h => `
                                <tr>
                                    <td>${formatDate(h.effective_date)}</td>
                                    <td class="price-cell">${h.price.toFixed(2)} บาท</td>
                                    <td>${h.remark || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.showModal(`ประวัติราคา: ${this.escHtml(product.product_name)}`, modalContent);

        // Render chart after modal is shown
        setTimeout(() => {
            const chartHistory = [...history].reverse(); // Oldest first for chart
            const ctx = document.getElementById('historyDetailChart').getContext('2d');
            const chartTheme = app.getChartColors();
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartHistory.map(h => formatDate(h.effective_date)),
                    datasets: [{
                        label: 'ราคา',
                        data: chartHistory.map(h => h.price),
                        borderColor: chartTheme.lineColors[0],
                        backgroundColor: chartTheme.lineColors[0] + '20',
                        tension: 0.4,
                        fill: true,
                        pointRadius: 5,
                        pointHoverRadius: 8,
                        borderWidth: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: chartTheme.tooltipBg,
                            padding: 12,
                            callbacks: {
                                label: (ctx) => `ราคา: ${ctx.parsed.y.toFixed(2)} บาท`
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            grid: { color: chartTheme.gridColor },
                            ticks: { color: chartTheme.tickColor }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: chartTheme.tickColor, maxRotation: 45 }
                        }
                    }
                }
            });
        }, 150);
    }

    // Admin: Users
    async loadUsers() {
        const wrapper = document.getElementById('contentWrapper');
        const { users } = await api.getUsers();

        wrapper.innerHTML = `
            <div class="toolbar"><div class="toolbar-left"><div class="search-input" style="display:flex;align-items:center;gap:0.5rem;"><i class="fas fa-search"></i><input type="text" id="searchUsers" placeholder="ค้นหาผู้ใช้..."><button class="btn btn-primary btn-sm" onclick="document.getElementById('searchUsers').dispatchEvent(new Event('input'))" style="border-radius:8px;padding:0.4rem 0.8rem;white-space:nowrap;"><i class="fas fa-search"></i> ค้นหา</button></div></div>
            <div class="toolbar-right"><button class="btn btn-primary" onclick="app.showAddUserModal()"><i class="fas fa-plus"></i> เพิ่มผู้ใช้</button></div></div>
            <div class="card"><div class="card-body"><div class="table-container">
                <table class="data-table" id="usersTable"><thead><tr><th>Username</th><th>ชื่อ</th><th>Email</th><th>Role</th><th>สถานะ</th><th>Login ล่าสุด</th><th>จัดการ</th></tr></thead>
                <tbody>${users.map(u => `
                    <tr><td>${this.escHtml(u.username)}</td><td>${this.escHtml(u.full_name)}</td><td>${this.escHtml(u.email) || '-'}</td>
                    <td><span class="badge ${u.role === 'admin' ? 'badge-danger' : u.role === 'buyer' ? 'badge-info' : 'badge-success'}">${this.escHtml(u.role)}</span></td>
                    <td><span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-default'}">${u.status}</span></td>
                    <td>${u.last_login ? new Date(u.last_login).toLocaleString('th-TH') : '-'}</td>
                    <td class="actions"><button class="action-btn" onclick="app.showEditUserModal(${u.id})"><i class="fas fa-edit"></i></button><button class="action-btn" onclick="app.showResetPasswordModal(${u.id})"><i class="fas fa-key"></i></button><button class="action-btn danger" onclick="app.deleteUser(${u.id})"><i class="fas fa-trash"></i></button></td></tr>
                `).join('')}</tbody></table>
            </div></div></div>
        `;
    }

    async showAddUserModal() {
        const { suppliers } = await api.getAdminSuppliers();
        this.showModal('เพิ่มผู้ใช้ใหม่', `
            <form id="addUserForm">
                <div class="form-group"><label>Username *</label><input type="text" name="username" required></div>
                <div class="form-group"><label>Password *</label><input type="password" name="password" required minlength="6"></div>
                <div class="form-group"><label>ชื่อ-นามสกุล *</label><input type="text" name="full_name" required></div>
                <div class="form-group"><label>Email</label><input type="email" name="email"></div>
                <div class="form-group"><label>Role *</label><select name="role" id="roleSelect" required><option value="buyer">Buyer</option><option value="supplier">Supplier</option><option value="admin">Admin</option></select></div>
                <div class="form-group" id="supplierField" style="display:none"><label>Supplier</label><select name="supplier_id">${suppliers.map(s => `<option value="${s.id}">${this.escHtml(s.name)}</option>`).join('')}</select></div>
            </form>
        `, async () => {
            const form = document.getElementById('addUserForm');
            const data = Object.fromEntries(new FormData(form));
            await api.createUser(data);
            this.hideModal();
            this.loadUsers();
        });

        document.getElementById('roleSelect').onchange = (e) => {
            document.getElementById('supplierField').style.display = e.target.value === 'supplier' ? 'block' : 'none';
        };
    }

    showResetPasswordModal(userId) {
        this.showModal('รีเซ็ตรหัสผ่าน', `
            <form id="resetPwForm"><div class="form-group"><label>รหัสผ่านใหม่ *</label><input type="password" name="password" required minlength="6"></div></form>
        `, async () => {
            const pw = document.querySelector('#resetPwForm input').value;
            await api.resetPassword(userId, pw);
            this.hideModal();
            this.showAlert('รีเซ็ตรหัสผ่านเรียบร้อย', 'success');
        });
    }

    async showEditUserModal(id) {
        const [{ user }, { suppliers }] = await Promise.all([
            api.getUser(id),
            api.getAdminSuppliers()
        ]);

        this.showModal('แก้ไขผู้ใช้', `
            <form id="editUserForm">
                <div class="form-group"><label>Username</label><input type="text" value="${user.username}" disabled></div>
                <div class="form-group"><label>ชื่อ-นามสกุล *</label><input type="text" name="full_name" value="${user.full_name || ''}" required></div>
                <div class="form-group"><label>Email</label><input type="email" name="email" value="${user.email || ''}"></div>
                <div class="form-group"><label>Role *</label><select name="role" id="editRoleSelect" required>
                    <option value="buyer" ${user.role === 'buyer' ? 'selected' : ''}>Buyer</option>
                    <option value="supplier" ${user.role === 'supplier' ? 'selected' : ''}>Supplier</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select></div>
                <div class="form-group" id="editSupplierField" style="display:${user.role === 'supplier' ? 'block' : 'none'}">
                    <label>Supplier</label>
                    <select name="supplier_id">${suppliers.map(s => `<option value="${s.id}" ${user.supplier_id == s.id ? 'selected' : ''}>${this.escHtml(s.name)}</option>`).join('')}</select>
                </div>
                <div class="form-group"><label>สถานะ</label><select name="status">
                    <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
                    <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                </select></div>
            </form>
        `, async () => {
            const form = document.getElementById('editUserForm');
            await api.updateUser(id, Object.fromEntries(new FormData(form)));
            this.hideModal();
            this.loadUsers();
        });

        setTimeout(() => {
            const roleSelect = document.getElementById('editRoleSelect');
            if (roleSelect) {
                roleSelect.onchange = (e) => {
                    document.getElementById('editSupplierField').style.display = e.target.value === 'supplier' ? 'block' : 'none';
                };
            }
        }, 100);
    }

    async deleteUser(id) {
        this.showConfirm('ยืนยันการลบผู้ใช้นี้?', async () => {
            await api.deleteUser(id);
            this.showAlert('ลบผู้ใช้เรียบร้อย', 'success');
            this.loadUsers();
        });
    }

    // Admin: Supplier Companies
    async loadSupplierCompanies() {
        const wrapper = document.getElementById('contentWrapper');
        const { suppliers } = await api.getAdminSuppliers();

        wrapper.innerHTML = `
            <div class="toolbar"><div class="toolbar-right"><button class="btn btn-primary" onclick="app.showAddSupplierModal()"><i class="fas fa-plus"></i> เพิ่ม Supplier</button></div></div>
            <div class="card"><div class="card-body"><div class="table-container">
                <table class="data-table"><thead><tr><th>รหัส</th><th>ชื่อบริษัท</th><th>ผู้ติดต่อ</th><th>โทร</th><th>Email</th><th>ผู้ใช้</th><th>สินค้า</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
                <tbody>${suppliers.map(s => `
                    <tr><td>${this.escHtml(s.code)}</td><td>${this.escHtml(s.name)}</td><td>${this.escHtml(s.contact_person) || '-'}</td><td>${this.escHtml(s.tel) || '-'}</td><td>${this.escHtml(s.email) || '-'}</td>
                    <td><span class="badge badge-info">${s.user_count}</span></td><td><span class="badge badge-success">${s.product_count}</span></td>
                    <td><span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-default'}">${s.status}</span></td>
                    <td class="actions"><button class="action-btn" onclick="app.showEditSupplierModal(${s.id})"><i class="fas fa-edit"></i></button><button class="action-btn danger" onclick="app.deleteSupplier(${s.id})"><i class="fas fa-trash"></i></button></td></tr>
                `).join('')}</tbody></table>
            </div></div></div>
        `;
    }

    showAddSupplierModal() {
        this.showModal('เพิ่ม Supplier', `
            <form id="addSupplierForm">
                <div class="form-group"><label>รหัส Supplier *</label><input type="text" name="code" required></div>
                <div class="form-group"><label>ชื่อบริษัท *</label><input type="text" name="name" required></div>
                <div class="form-group"><label>ที่อยู่</label><textarea name="address" rows="2"></textarea></div>
                <div class="form-group"><label>ผู้ติดต่อ</label><input type="text" name="contact_person"></div>
                <div class="form-group"><label>โทรศัพท์</label><input type="text" name="tel"></div>
                <div class="form-group"><label>Email</label><input type="email" name="email"></div>
                <div class="form-group"><label>เลขผู้เสียภาษี</label><input type="text" name="tax_id"></div>
            </form>
        `, async () => {
            const form = document.getElementById('addSupplierForm');
            await api.createSupplier(Object.fromEntries(new FormData(form)));
            this.hideModal();
            this.loadSupplierCompanies();
        });
    }

    async showEditSupplierModal(id) {
        const { supplier } = await api.getAdminSupplier(id);
        this.showModal('แก้ไข Supplier', `
            <form id="editSupplierForm">
                <div class="form-group"><label>รหัส Supplier</label><input type="text" value="${supplier.code}" disabled></div>
                <div class="form-group"><label>ชื่อบริษัท *</label><input type="text" name="name" value="${supplier.name}" required></div>
                <div class="form-group"><label>ที่อยู่</label><textarea name="address" rows="2">${supplier.address || ''}</textarea></div>
                <div class="form-group"><label>ผู้ติดต่อ</label><input type="text" name="contact_person" value="${supplier.contact_person || ''}"></div>
                <div class="form-group"><label>โทรศัพท์</label><input type="text" name="tel" value="${supplier.tel || ''}"></div>
                <div class="form-group"><label>Email</label><input type="email" name="email" value="${supplier.email || ''}"></div>
                <div class="form-group"><label>เลขผู้เสียภาษี</label><input type="text" name="tax_id" value="${supplier.tax_id || ''}"></div>
                <div class="form-group"><label>สถานะ</label><select name="status">
                    <option value="active" ${supplier.status === 'active' ? 'selected' : ''}>Active</option>
                    <option value="inactive" ${supplier.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                </select></div>
            </form>
        `, async () => {
            const form = document.getElementById('editSupplierForm');
            await api.updateSupplier(id, Object.fromEntries(new FormData(form)));
            this.hideModal();
            this.loadSupplierCompanies();
        });
    }

    async deleteSupplier(id) {
        this.showConfirm('ยืนยันการลบ Supplier นี้?', async () => {
            try {
                await api.deleteSupplier(id);
                this.showAlert('ลบ Supplier เรียบร้อย', 'success');
                this.loadSupplierCompanies();
            } catch (err) { this.showAlert(err.message, 'error'); }
        });
    }

    // Admin: Categories
    async loadCategories() {
        const wrapper = document.getElementById('contentWrapper');
        const { categories } = await api.getAdminCategories();

        wrapper.innerHTML = `
            <div class="toolbar"><div class="toolbar-right"><button class="btn btn-primary" onclick="app.showAddCategoryModal()"><i class="fas fa-plus"></i> เพิ่มหมวดหมู่</button></div></div>
            <div class="card"><div class="card-body"><div class="table-container">
                <table class="data-table"><thead><tr><th>ชื่อหมวดหมู่</th><th>คำอธิบาย</th><th>จำนวนสินค้า</th><th>จัดการ</th></tr></thead>
                <tbody>${categories.map(c => `
                    <tr><td>${this.escHtml(c.name)}</td><td>${this.escHtml(c.description) || '-'}</td><td><span class="badge badge-info">${c.product_count}</span></td>
                    <td class="actions"><button class="action-btn" onclick="app.showEditCategoryModal(${c.id},'${this.escHtml(c.name)}','${c.description || ''}')"><i class="fas fa-edit"></i></button><button class="action-btn danger" onclick="app.deleteCategory(${c.id})"><i class="fas fa-trash"></i></button></td></tr>
                `).join('')}</tbody></table>
            </div></div></div>
        `;
    }

    showAddCategoryModal() {
        this.showModal('เพิ่มหมวดหมู่', `<form id="catForm"><div class="form-group"><label>ชื่อ *</label><input type="text" name="name" required></div><div class="form-group"><label>คำอธิบาย</label><textarea name="description" rows="2"></textarea></div></form>`, async () => {
            await api.createCategory(Object.fromEntries(new FormData(document.getElementById('catForm'))));
            this.hideModal();
            this.loadCategories();
        });
    }

    showEditCategoryModal(id, name, description) {
        this.showModal('แก้ไขหมวดหมู่', `
            <form id="editCatForm">
                <div class="form-group"><label>ชื่อ *</label><input type="text" name="name" value="${name}" required></div>
                <div class="form-group"><label>คำอธิบาย</label><textarea name="description" rows="2">${description || ''}</textarea></div>
            </form>
        `, async () => {
            await api.updateCategory(id, Object.fromEntries(new FormData(document.getElementById('editCatForm'))));
            this.hideModal();
            this.loadCategories();
        });
    }

    async deleteCategory(id) {
        this.showConfirm('ยืนยันการลบหมวดหมู่นี้?', async () => {
            try {
                await api.deleteCategory(id);
                this.showAlert('ลบหมวดหมู่เรียบร้อย', 'success');
                this.loadCategories();
            } catch (err) { this.showAlert(err.message, 'error'); }
        });
    }

    // Admin: Export
    async loadExport() {
        const wrapper = document.getElementById('contentWrapper');
        wrapper.innerHTML = `
            <div class="grid-2">
                <div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-database"></i> Export SQL Backup</h3></div>
                <div class="card-body"><p class="mb-4">Backup ฐานข้อมูลทั้งหมดเป็นไฟล์ SQL</p><button class="btn btn-primary w-full" onclick="api.exportSQL()"><i class="fas fa-download"></i> Download SQL Backup</button></div></div>
                <div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-file-excel"></i> Export to Excel</h3></div>
                <div class="card-body"><p class="mb-4">Export ข้อมูลทั้งหมดเป็นไฟล์ Excel</p><button class="btn btn-success w-full" onclick="api.exportExcel()"><i class="fas fa-download"></i> Download Excel</button></div></div>
            </div>
        `;
    }

    // Admin: Logs
    async loadLogs() {
        const wrapper = document.getElementById('contentWrapper');
        const { logs, actions } = await api.getLogs({ limit: 100 });

        wrapper.innerHTML = `
            <div class="toolbar"><div class="toolbar-left"><select id="filterAction" class="filter-select"><option value="">ทุก Action</option>${actions.map(a => `<option value="${a}">${a}</option>`).join('')}</select></div></div>
            <div class="card"><div class="card-body"><div class="table-container">
                <table class="data-table"><thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>Action</th><th>ประเภท</th><th>รายละเอียด</th></tr></thead>
                <tbody>${logs.map(l => `
                    <tr><td>${new Date(l.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td><td>${l.username || 'System'}</td>
                    <td><span class="badge badge-info">${l.action}</span></td><td>${l.entity_type || '-'}</td><td>${l.details || '-'}</td></tr>
                `).join('')}</tbody></table>
            </div></div></div>
        `;
    }

    // Admin: Delete All Data
    async loadDeleteAllData() {
        const wrapper = document.getElementById('contentWrapper');

        wrapper.innerHTML = `
            <div class="card" style="max-width:600px;margin:2rem auto;">
                <div class="card-header" style="background: linear-gradient(135deg, #dc3545, #c82333);">
                    <h3 class="card-title"><i class="fas fa-exclamation-triangle"></i> ลบข้อมูลทั้งหมด</h3>
                </div>
                <div class="card-body" style="text-align:center;padding:2rem;">
                    <div style="margin-bottom:2rem;">
                        <i class="fas fa-database" style="font-size:4rem;color:#dc3545;opacity:0.5;"></i>
                    </div>
                    <h2 style="color:#dc3545;margin-bottom:1rem;">⚠️ คำเตือน!</h2>
                    <p style="font-size:1.1rem;margin-bottom:1.5rem;">
                        การดำเนินการนี้จะ<strong>ลบข้อมูลทั้งหมด</strong>ในระบบ รวมถึง:
                    </p>
                    <ul style="text-align:left;display:inline-block;margin-bottom:2rem;color:#dc3545;">
                        <li>สินค้าทั้งหมด</li>
                        <li>ประวัติราคาทั้งหมด</li>
                        <li>กลุ่มสินค้า และการ Mapping</li>
                        <li>ประวัติการ Import</li>
                    </ul>
                    <p style="color:#6c757d;margin-bottom:2rem;">
                        <i class="fas fa-info-circle"></i> ข้อมูล Supplier, หมวดหมู่ และผู้ใช้จะไม่ถูกลบ
                    </p>
                    <div class="form-group" style="max-width:300px;margin:0 auto 1.5rem;">
                        <label style="font-weight:700;color:#dc3545;">กรุณาใส่รหัสยืนยัน</label>
                        <input type="text" id="deleteConfirmCode" class="form-control" 
                               placeholder="ใส่รหัส 4 หลัก" maxlength="4"
                               style="text-align:center;font-size:1.5rem;letter-spacing:0.5rem;font-weight:700;">
                        <small style="color:#6c757d;">รหัสยืนยัน: <strong>1221</strong></small>
                    </div>
                    <button class="btn btn-danger btn-lg" onclick="app.confirmDeleteAllData()" style="min-width:200px;">
                        <i class="fas fa-trash-alt"></i> ลบข้อมูลทั้งหมด
                    </button>
                </div>
            </div>
        `;
    }

    async confirmDeleteAllData() {
        const code = document.getElementById('deleteConfirmCode').value;

        if (code !== '1221') {
            this.showToast('รหัสยืนยันไม่ถูกต้อง กรุณาใส่รหัส 1221', 'error');
            return;
        }

        this.showConfirmDialog({
            title: 'ยืนยันการลบข้อมูลทั้งหมด',
            message: 'คุณแน่ใจหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้!',
            warning: 'ข้อมูลสินค้า ราคา และประวัติทั้งหมดจะถูกลบถาวร',
            onConfirm: async () => {
                try {
                    await api.request('/admin/delete-all-data', { method: 'DELETE' });
                    this.showToast('ลบข้อมูลทั้งหมดสำเร็จ', 'success');
                    await this.loadDashboard();
                    this.navigate('dashboard');
                } catch (err) {
                    this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
                }
            }
        });
    }

    // Modal helpers
    showModal(title, content, onConfirm, size) {
        const existing = document.querySelector('.modal-overlay');
        if (existing) existing.remove();

        const sizeClass = size ? ` ${size}` : '';
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal${sizeClass}"><div class="modal-header"><h3 class="modal-title">${title}</h3><button class="modal-close" onclick="app.hideModal()">&times;</button></div>
            <div class="modal-body">${content}</div>
            ${onConfirm ? `<div class="modal-footer"><button class="btn btn-secondary" onclick="app.hideModal()">ยกเลิก</button><button class="btn btn-primary" id="modalConfirm">ตกลง</button></div>` : ''}</div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('active'), 10);

        if (onConfirm) {
            document.getElementById('modalConfirm').onclick = async () => {
                try { await onConfirm(); } catch (err) { this.showAlert(err.message, 'error'); }
            };
        }
    }

    hideModal() {
        const modal = document.querySelector('.modal-overlay');
        if (modal) { modal.classList.remove('active'); setTimeout(() => modal.remove(), 300); }
    }

    // Custom Confirm Popup (replaces browser confirm)
    showConfirm(message, onConfirm, onCancel = null) {
        const existing = document.querySelector('.confirm-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-popup">
                <div class="confirm-icon">
                    <i class="fas fa-question-circle"></i>
                </div>
                <div class="confirm-message">${message.replace(/\n/g, '<br>')}</div>
                <div class="confirm-buttons">
                    <button class="btn btn-secondary" id="confirmCancel">ยกเลิก</button>
                    <button class="btn btn-danger" id="confirmOk">ยืนยัน</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('active'), 10);

        document.getElementById('confirmOk').onclick = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
            if (onConfirm) onConfirm();
        };

        document.getElementById('confirmCancel').onclick = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
            if (onCancel) onCancel();
        };
    }

    // Custom Alert Popup (replaces browser alert)
    showAlert(message, type = 'info') {
        const existing = document.querySelector('.alert-overlay');
        if (existing) existing.remove();

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const overlay = document.createElement('div');
        overlay.className = 'alert-overlay';
        overlay.innerHTML = `
            <div class="alert-popup alert-${type}">
                <div class="alert-icon">
                    <i class="fas ${icons[type] || icons.info}"></i>
                </div>
                <div class="alert-message">${message}</div>
                <button class="btn btn-primary" id="alertOk">ตกลง</button>
            </div>
        `;
        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('active'), 10);

        document.getElementById('alertOk').onclick = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        };
    }

    // ==================== REPORTS PAGE ====================
    async loadReports() {
        const wrapper = document.getElementById('contentWrapper');
        wrapper.innerHTML = this.getLoadingSkeleton();

        try {
            const [reportData, anomalyData] = await Promise.all([
                api.getReportsSummary(),
                api.getPriceAnomalies(10)
            ]);

            const { groupSummary, supplierRanking, anomalyCount, overallStats } = reportData;

            wrapper.innerHTML = `
                <!-- Overview Stats -->
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-layer-group"></i></div><div class="stat-content"><div class="stat-label">กลุ่มสินค้า</div><div class="stat-value">${overallStats.total_groups}</div></div></div>
                    <div class="stat-card"><div class="stat-icon green"><i class="fas fa-building"></i></div><div class="stat-content"><div class="stat-label">Suppliers</div><div class="stat-value">${overallStats.total_suppliers}</div></div></div>
                    <div class="stat-card"><div class="stat-icon purple"><i class="fas fa-box"></i></div><div class="stat-content"><div class="stat-label">สินค้าทั้งหมด</div><div class="stat-value">${overallStats.total_products}</div></div></div>
                    <div class="stat-card"><div class="stat-icon orange"><i class="fas fa-exclamation-triangle"></i></div><div class="stat-content"><div class="stat-label">ราคาผิดปกติ (30 วัน)</div><div class="stat-value">${anomalyCount}</div></div></div>
                </div>

                <div class="toolbar mt-4" style="justify-content:flex-end;">
                    <button class="btn btn-danger" onclick="app.exportReportsPDF()">
                        <i class="fas fa-file-pdf"></i> Export PDF
                    </button>
                </div>

                <!-- Supplier Ranking -->
                <div class="card mt-4" id="reportSupplierRanking">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fas fa-trophy"></i> Supplier Ranking</h3>
                    </div>
                    <div class="card-body">
                        <div class="chart-container" style="height:280px;">
                            <canvas id="supplierRankingChart"></canvas>
                        </div>
                        <table class="data-table mt-4">
                            <thead>
                                <tr>
                                    <th>อันดับ</th>
                                    <th>Supplier</th>
                                    <th>รหัส</th>
                                    <th>จำนวนสินค้า</th>
                                    <th>ราคาเฉลี่ย</th>
                                    <th>ราคาถูกสุด</th>
                                    <th>Win Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${supplierRanking.map((s, i) => `
                                    <tr>
                                        <td>
                                            ${i === 0 ? '<span style="font-size:1.2rem;">🥇</span>' :
                    i === 1 ? '<span style="font-size:1.2rem;">🥈</span>' :
                        i === 2 ? '<span style="font-size:1.2rem;">🥉</span>' : `#${i + 1}`}
                                        </td>
                                        <td><strong>${this.escHtml(s.name)}</strong></td>
                                        <td><span class="badge badge-secondary">${this.escHtml(s.code)}</span></td>
                                        <td>${s.product_count}</td>
                                        <td>${s.avg_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</td>
                                        <td>${s.lowest_count} รายการ</td>
                                        <td>
                                            <div class="win-rate-bar">
                                                <div class="win-rate-fill" style="width:${Math.min(s.win_rate || 0, 100)}%"></div>
                                                <span class="win-rate-text">${s.win_rate || 0}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Group Price Comparison -->
                <div class="card mt-4" id="reportGroupPrices">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fas fa-balance-scale"></i> เปรียบเทียบราคาตามกลุ่มสินค้า</h3>
                    </div>
                    <div class="card-body">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>รหัส</th>
                                    <th>กลุ่มสินค้า</th>
                                    <th>หมวดหมู่</th>
                                    <th>Suppliers</th>
                                    <th>ราคาต่ำสุด</th>
                                    <th>ราคาสูงสุด</th>
                                    <th>ราคาเฉลี่ย</th>
                                    <th>ส่วนต่าง</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${groupSummary.map(g => `
                                    <tr>
                                        <td><span class="badge badge-secondary">${this.escHtml(g.master_code)}</span></td>
                                        <td><strong>${this.escHtml(g.master_name)}</strong></td>
                                        <td>${this.escHtml(g.category_name) || '-'}</td>
                                        <td class="text-center">${g.supplier_count}</td>
                                        <td class="price" style="color:#10b981;">${g.min_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</td>
                                        <td class="price" style="color:#ef4444;">${g.max_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</td>
                                        <td class="price">${g.avg_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</td>
                                        <td>
                                            <span class="badge ${g.spread_percent > 10 ? 'badge-danger' : g.spread_percent > 5 ? 'badge-warning' : 'badge-success'}">
                                                ${g.spread_percent || 0}%
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Anomaly Detail -->
                <div class="card mt-4" id="reportAnomalies">
                    <div class="card-header">
                        <h3 class="card-title" style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> รายละเอียดราคาผิดปกติ</h3>
                    </div>
                    <div class="card-body">
                        ${anomalyData.anomalies.length === 0 ? `
                            <div class="empty-state" style="padding:2rem;text-align:center;">
                                <i class="fas fa-check-circle" style="font-size:3rem;color:#10b981;"></i>
                                <h3>ไม่พบราคาผิดปกติ</h3>
                                <p class="text-muted">ราคาสินค้าทั้งหมดอยู่ในเกณฑ์ปกติ</p>
                            </div>
                        ` : `
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>สินค้า</th>
                                        <th>Supplier</th>
                                        <th>ราคาเดิม</th>
                                        <th>ราคาใหม่</th>
                                        <th>เปลี่ยนแปลง</th>
                                        <th>วันที่</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${anomalyData.anomalies.map(a => `
                                        <tr>
                                            <td><strong>${a.product_name}</strong><br><small class="text-muted">${a.product_code}</small></td>
                                            <td>${a.supplier_name}</td>
                                            <td class="price">${a.old_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</td>
                                            <td class="price">${a.new_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</td>
                                            <td>
                                                <span class="badge ${a.direction === 'increase' ? 'badge-danger' : 'badge-success'}">
                                                    <i class="fas fa-arrow-${a.direction === 'increase' ? 'up' : 'down'}"></i>
                                                    ${a.change_percent}%
                                                </span>
                                            </td>
                                            <td>${this.formatDate(a.effective_date)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        `}
                    </div>
                </div>
            `;

            // Render supplier ranking chart
            if (supplierRanking.length > 0) {
                const isDark = document.body.dataset.theme !== 'light';
                const ctx = document.getElementById('supplierRankingChart').getContext('2d');
                const chartColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: supplierRanking.map(s => s.name),
                        datasets: [{
                            label: 'Win Rate (%)',
                            data: supplierRanking.map(s => s.win_rate || 0),
                            backgroundColor: supplierRanking.map((_, i) => chartColors[i % chartColors.length] + '80'),
                            borderColor: supplierRanking.map((_, i) => chartColors[i % chartColors.length]),
                            borderWidth: 2,
                            borderRadius: 8
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => `Win Rate: ${ctx.parsed.y}%`
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100,
                                ticks: { color: isDark ? '#94a3b8' : '#475569', callback: v => v + '%' },
                                grid: { color: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.05)' }
                            },
                            x: {
                                ticks: { color: isDark ? '#94a3b8' : '#475569' },
                                grid: { display: false }
                            }
                        }
                    }
                });
            }
        } catch (err) {
            wrapper.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error loading reports</h3><p>${err.message}</p></div>`;
        }
    }

    // ==================== PDF EXPORT ====================
    exportComparisonPDF() {
        window.print();
    }

    exportReportsPDF() {
        window.print();
    }

    // ==================== LOADING SKELETON ====================
    getLoadingSkeleton() {
        return `
            <div class="skeleton-container">
                <div class="skeleton-grid">
                    <div class="skeleton-card"><div class="skeleton-line w-40"></div><div class="skeleton-line w-60 tall"></div></div>
                    <div class="skeleton-card"><div class="skeleton-line w-40"></div><div class="skeleton-line w-60 tall"></div></div>
                    <div class="skeleton-card"><div class="skeleton-line w-40"></div><div class="skeleton-line w-60 tall"></div></div>
                    <div class="skeleton-card"><div class="skeleton-line w-40"></div><div class="skeleton-line w-60 tall"></div></div>
                </div>
                <div class="skeleton-card mt-4" style="padding:1.5rem;">
                    <div class="skeleton-line w-30"></div>
                    <div class="skeleton-line w-full mt-2"></div>
                    <div class="skeleton-line w-full mt-2"></div>
                    <div class="skeleton-line w-80 mt-2"></div>
                    <div class="skeleton-line w-full mt-2"></div>
                    <div class="skeleton-line w-60 mt-2"></div>
                </div>
            </div>
        `;
    }

    // ==================== KEYBOARD SHORTCUTS ====================
    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger if typing in input/textarea/select
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
                if (e.key === 'Escape') {
                    active.blur();
                    e.preventDefault();
                }
                return;
            }

            // Ctrl/Cmd + / : Show keyboard shortcuts help
            if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                e.preventDefault();
                this.showKeyboardShortcutsHelp();
                return;
            }

            // Ctrl/Cmd + F : Focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                const searchInput = document.getElementById('dashboardSearch') || document.getElementById('globalSearch');
                if (searchInput) {
                    e.preventDefault();
                    searchInput.focus();
                }
                return;
            }

            // Escape: Close modals
            if (e.key === 'Escape') {
                const modal = document.getElementById('modalOverlay');
                if (modal && !modal.classList.contains('hidden')) {
                    this.hideModal();
                    return;
                }
                const confirm = document.querySelector('.confirm-overlay');
                if (confirm) {
                    confirm.remove();
                    return;
                }
                const shortcutsHelp = document.getElementById('shortcutsHelpOverlay');
                if (shortcutsHelp) {
                    shortcutsHelp.remove();
                    return;
                }
            }

            // Ctrl/Cmd + Number: Navigate
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
                const navMap = {
                    '1': 'dashboard',
                    '2': 'all-products',
                    '3': 'product-groups',
                    '4': 'comparison',
                    '5': 'reports',
                    '6': 'mapping'
                };
                if (navMap[e.key]) {
                    e.preventDefault();
                    this.navigateTo(navMap[e.key]);
                }
            }
        });
    }

    showKeyboardShortcutsHelp() {
        const existing = document.getElementById('shortcutsHelpOverlay');
        if (existing) { existing.remove(); return; }

        const overlay = document.createElement('div');
        overlay.id = 'shortcutsHelpOverlay';
        overlay.className = 'shortcuts-overlay';
        overlay.innerHTML = `
            <div class="shortcuts-modal">
                <div class="shortcuts-header">
                    <h3><i class="fas fa-keyboard"></i> Keyboard Shortcuts</h3>
                    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('shortcutsHelpOverlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="shortcuts-body">
                    <div class="shortcut-group">
                        <h4>นำทาง</h4>
                        <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>1</kbd> <span>Dashboard</span></div>
                        <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>2</kbd> <span>สินค้าทั้งหมด</span></div>
                        <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>3</kbd> <span>กลุ่มสินค้า</span></div>
                        <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>4</kbd> <span>เปรียบเทียบราคา</span></div>
                        <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>5</kbd> <span>รายงานสรุป</span></div>
                        <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>6</kbd> <span>จัดกลุ่มสินค้า</span></div>
                    </div>
                    <div class="shortcut-group">
                        <h4>ทั่วไป</h4>
                        <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>F</kbd> <span>ค้นหา</span></div>
                        <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>/</kbd> <span>แสดง Shortcuts</span></div>
                        <div class="shortcut-item"><kbd>Esc</kbd> <span>ปิด Modal / ยกเลิก</span></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('active'), 10);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    // ==================== BULK SELECT (Products) ====================
    initBulkSelect() {
        this._selectedProductIds = new Set();
    }

    toggleSelectAll(checked) {
        const checkboxes = document.querySelectorAll('.product-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = checked;
            const id = parseInt(cb.dataset.id);
            if (checked) this._selectedProductIds.add(id);
            else this._selectedProductIds.delete(id);
        });
        this.updateBulkToolbar();
    }

    toggleSelectProduct(id, checked) {
        if (checked) this._selectedProductIds.add(id);
        else this._selectedProductIds.delete(id);

        // Update select-all state
        const all = document.querySelectorAll('.product-checkbox');
        const allChecked = Array.from(all).every(cb => cb.checked);
        const selectAll = document.getElementById('selectAllProducts');
        if (selectAll) selectAll.checked = allChecked;

        this.updateBulkToolbar();
    }

    updateBulkToolbar() {
        const toolbar = document.getElementById('bulkToolbar');
        if (!toolbar) return;
        const count = this._selectedProductIds.size;
        if (count > 0) {
            toolbar.classList.add('show');
            toolbar.innerHTML = `
                <span><i class="fas fa-check-square"></i> เลือก ${count} รายการ</span>
                <button class="btn btn-danger btn-sm" onclick="app.bulkDeleteSelected()">
                    <i class="fas fa-trash"></i> ลบที่เลือก
                </button>
                <button class="btn btn-secondary btn-sm" onclick="app.toggleSelectAll(false)">
                    ยกเลิก
                </button>
            `;
        } else {
            toolbar.classList.remove('show');
            toolbar.innerHTML = '';
        }
    }

    async bulkDeleteSelected() {
        const ids = Array.from(this._selectedProductIds);
        if (ids.length === 0) return;

        this.showConfirm(`ต้องการลบสินค้า ${ids.length} รายการ หรือไม่?\n\nข้อมูลราคาและการจับคู่ที่เกี่ยวข้องจะถูกลบด้วย`, async () => {
            try {
                await api.bulkDeleteProducts(ids);
                this._selectedProductIds.clear();
                this.showAlert(`ลบสินค้า ${ids.length} รายการเรียบร้อย`, 'success');
                this.loadAllProducts();
            } catch (err) {
                this.showAlert(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
            }
        });
    }

    // ==================== Purchase History Import ====================
    async loadPurchaseImport() {
        const wrapper = document.getElementById('contentWrapper');
        wrapper.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-file-upload"></i> Import ประวัติการซื้อจาก Excel</h3>
                    <button class="btn btn-secondary btn-sm" onclick="app.downloadPurchaseTemplate()"><i class="fas fa-download"></i> Download Template</button>
                </div>
                <div class="card-body">
                    <div class="alert alert-info" style="margin-bottom:1rem;">
                        <i class="fas fa-info-circle"></i>
                        รูปแบบ: รหัสเจ้าหนี้, ชื่อเจ้าหนี้, วันที่สั่งซื้อ, เลขที่ PF, เลขที่สั่งซื้อ, รหัสสินค้า, ชื่อสินค้า, หน่วยนับ, จำนวนสั่งซื้อ, ราคา/หน่วย, รวมราคา, กำหนดส่ง, หมายเหตุ
                    </div>
                    <div class="upload-zone" id="purchaseUploadZone">
                        <i class="fas fa-cloud-upload-alt"></i>
                        <h4>ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</h4>
                        <p>รองรับไฟล์ .xlsx, .xls (ฟอร์มประวัติการซื้อ)</p>
                        <input type="file" id="purchaseFileInput" accept=".xlsx,.xls" style="display:none">
                    </div>
                    <div id="purchasePreviewContainer" class="hidden mt-4"></div>
                </div>
            </div>
        `;

        const zone = document.getElementById('purchaseUploadZone');
        const input = document.getElementById('purchaseFileInput');
        zone.onclick = () => input.click();
        zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('dragover'); };
        zone.ondragleave = () => zone.classList.remove('dragover');
        zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('dragover'); if (e.dataTransfer.files.length) this.handlePurchaseUpload(e.dataTransfer.files[0]); };
        input.onchange = (e) => { if (e.target.files.length) this.handlePurchaseUpload(e.target.files[0]); };
    }

    async downloadPurchaseTemplate() {
        try {
            const blob = await api.downloadPurchaseTemplate();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'purchase_history_template.xlsx'; a.click();
            URL.revokeObjectURL(url);
        } catch (err) { this.showAlert('Error: ' + err.message, 'error'); }
    }

    async handlePurchaseUpload(file) {
        try {
            this.showAlert('กำลังวิเคราะห์ไฟล์...', 'info');
            const result = await api.uploadPurchasePreview(file);

            if (result.error) {
                this.showAlert(result.error, 'error');
                return;
            }

            const container = document.getElementById('purchasePreviewContainer');
            container.classList.remove('hidden');

            const newSupInfo = result.newSuppliers && result.newSuppliers.length > 0
                ? `<div class="alert alert-warning" style="margin-bottom:1rem;"><i class="fas fa-exclamation-triangle"></i> สร้าง Supplier ใหม่อัตโนมัติ: ${result.newSuppliers.map(s => s.name).join(', ')}</div>` : '';

            const rows = result.preview.slice(0, 100).map(r => `
                <tr class="${r.isValid ? '' : 'error'}">
                    <td>${r.row}</td>
                    <td>${r.supplier_code}</td>
                    <td title="${r.supplier_name}">${r.supplier_name.substring(0, 25)}${r.supplier_name.length > 25 ? '...' : ''}</td>
                    <td>${r.purchase_date}</td>
                    <td>${r.po_number}</td>
                    <td>${r.product_code}</td>
                    <td title="${r.product_name}">${r.product_name.substring(0, 20)}${r.product_name.length > 20 ? '...' : ''}</td>
                    <td>${r.unit}</td>
                    <td class="text-right">${r.quantity}</td>
                    <td class="text-right price-cell">${r.unit_price?.toLocaleString() || '-'}</td>
                    <td class="text-right price-cell">${r.total_price?.toLocaleString() || '-'}</td>
                    <td>${r.delivery_date}</td>
                    <td>${r.isValid
                    ? (r.product_matched ? '<span class="badge badge-success">Match</span>' : '<span class="badge badge-info">ใหม่</span>')
                    : '<span class="badge badge-danger">' + r.errors.join(', ') + '</span>'}</td>
                </tr>
            `).join('');

            container.innerHTML = `
                ${newSupInfo}
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Preview: ${result.filename}</h3>
                        <span>รวม ${result.totalRows} | สำเร็จ ${result.validRows} | ผิดพลาด ${result.errorRows}</span>
                    </div>
                    <div class="card-body" style="overflow-x:auto;">
                        <table class="data-table" style="font-size:0.85rem;">
                            <thead><tr>
                                <th>แถว</th><th>รหัส Sup</th><th>ชื่อ Supplier</th><th>วันสั่งซื้อ</th>
                                <th>PO No.</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>หน่วย</th>
                                <th>จำนวน</th><th>ราคา/หน่วย</th><th>รวม</th><th>กำหนดส่ง</th><th>สถานะ</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                    <div class="card-footer">
                        <button class="btn btn-success" onclick="app.confirmPurchaseImport()" ${result.validRows === 0 ? 'disabled' : ''}>
                            <i class="fas fa-check"></i> ยืนยัน Import (${result.validRows} รายการ)
                        </button>
                    </div>
                </div>
            `;

            this.pendingPurchaseImport = result.preview;
            this.showAlert(`วิเคราะห์เสร็จ: ${result.validRows} รายการพร้อม import`, 'success');
        } catch (err) {
            this.showAlert('Error: ' + err.message, 'error');
        }
    }

    async confirmPurchaseImport() {
        if (!this.pendingPurchaseImport) return;
        try {
            const result = await api.confirmPurchaseImport(this.pendingPurchaseImport);
            this.showAlert(result.message, 'success');
            this.pendingPurchaseImport = null;
            this.navigateTo('purchase-history');
        } catch (err) {
            this.showAlert('Error: ' + err.message, 'error');
        }
    }

    // ==================== Purchase History View ====================
    async loadPurchaseHistory() {
        const wrapper = document.getElementById('contentWrapper');
        wrapper.innerHTML = this.getLoadingSkeleton();

        try {
            const [historyData, summaryData] = await Promise.all([
                api.getPurchaseHistory({ page: 1, limit: 30 }),
                api.getPurchaseSummary()
            ]);

            const overall = summaryData.overall || {};

            wrapper.innerHTML = `
                <!-- Stats -->
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-receipt"></i></div><div class="stat-content"><div class="stat-label">รายการซื้อทั้งหมด</div><div class="stat-value">${overall.total_records || 0}</div></div></div>
                    <div class="stat-card"><div class="stat-icon green"><i class="fas fa-box"></i></div><div class="stat-content"><div class="stat-label">สินค้าที่ซื้อ</div><div class="stat-value">${overall.unique_products || 0}</div></div></div>
                    <div class="stat-card"><div class="stat-icon purple"><i class="fas fa-building"></i></div><div class="stat-content"><div class="stat-label">Suppliers</div><div class="stat-value">${overall.unique_suppliers || 0}</div></div></div>
                    <div class="stat-card"><div class="stat-icon orange"><i class="fas fa-coins"></i></div><div class="stat-content"><div class="stat-label">มูลค่ารวม</div><div class="stat-value">${(overall.total_value || 0).toLocaleString()} ฿</div></div></div>
                </div>

                <!-- Filters -->
                <div class="card mt-4">
                    <div class="card-body">
                        <div class="toolbar" style="flex-wrap:wrap;gap:0.5rem;">
                            <div class="toolbar-left" style="gap:0.5rem;flex-wrap:wrap;">
                                <div class="search-input" style="display:flex;align-items:center;gap:0.5rem;"><i class="fas fa-search"></i><input type="text" id="phSearch" placeholder="ค้นหาสินค้า, PO..."><button class="btn btn-primary btn-sm" onclick="document.getElementById('phSearch').dispatchEvent(new Event('input'))" style="border-radius:8px;padding:0.4rem 0.8rem;white-space:nowrap;"><i class="fas fa-search"></i> ค้นหา</button></div>
                                <select id="phSupplierFilter" class="filter-select">
                                    <option value="">-- ทุก Supplier --</option>
                                    ${(historyData.suppliers || []).map(s => '<option value="' + s.id + '">' + s.name + '</option>').join('')}
                                </select>
                                <input type="date" id="phDateFrom" class="filter-select" placeholder="จาก">
                                <input type="date" id="phDateTo" class="filter-select" placeholder="ถึง">
                                <button class="btn btn-primary btn-sm" onclick="app.filterPurchaseHistory()"><i class="fas fa-filter"></i> กรอง</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Monthly Chart -->
                ${summaryData.monthlyTrend && summaryData.monthlyTrend.length > 0 ? `
                <div class="card mt-4">
                    <div class="card-header"><h3 class="card-title"><i class="fas fa-chart-bar"></i> แนวโน้มการซื้อรายเดือน</h3></div>
                    <div class="card-body"><div class="chart-container" style="height:250px"><canvas id="monthlyPurchaseChart"></canvas></div></div>
                </div>` : ''}

                <!-- Table -->
                <div class="card mt-4">
                    <div class="card-header"><h3 class="card-title"><i class="fas fa-list"></i> รายการซื้อ</h3></div>
                    <div class="card-body" style="overflow-x:auto;"><div id="purchaseTableContainer"></div></div>
                </div>

                <!-- Top Products -->
                ${summaryData.topProducts && summaryData.topProducts.length > 0 ? `
                <div class="card mt-4">
                    <div class="card-header"><h3 class="card-title"><i class="fas fa-trophy"></i> สินค้าที่ซื้อบ่อย (Top 20)</h3></div>
                    <div class="card-body" style="overflow-x:auto;">
                        <table class="data-table">
                            <thead><tr><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>หน่วย</th><th>สั่งซื้อ (ครั้ง)</th><th>จำนวนรวม</th><th>ราคาเฉลี่ย</th><th>ราคาต่ำสุด</th><th>ราคาสูงสุด</th><th>มูลค่ารวม</th><th></th></tr></thead>
                            <tbody>${summaryData.topProducts.map(p => `
                                <tr>
                                    <td>${this.escHtml(p.product_code)}</td>
                                    <td>${this.escHtml(p.product_name)}</td>
                                    <td>${this.escHtml(p.unit) || '-'}</td>
                                    <td>${p.order_count}</td>
                                    <td>${p.total_qty?.toLocaleString() || '-'}</td>
                                    <td class="price-cell">${p.avg_price?.toLocaleString() || '-'}</td>
                                    <td class="price-cell price-lowest">${p.min_price?.toLocaleString() || '-'}</td>
                                    <td class="price-cell price-highest">${p.max_price?.toLocaleString() || '-'}</td>
                                    <td class="price-cell">${p.total_value?.toLocaleString() || '-'} ฿</td>
                                    <td><button class="btn btn-sm btn-primary" onclick="app.showPurchaseDetail('${this.escHtml(p.product_code)}')"><i class="fas fa-chart-line"></i></button></td>
                                </tr>
                            `).join('')}</tbody>
                        </table>
                    </div>
                </div>` : ''}
            `;

            // Render purchase table
            this.renderPurchaseTable(historyData);

            // Render monthly chart
            if (summaryData.monthlyTrend && summaryData.monthlyTrend.length > 0) {
                this.renderMonthlyPurchaseChart(summaryData.monthlyTrend);
            }

            // Filter events
            document.getElementById('phSearch')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.filterPurchaseHistory();
            });
        } catch (err) {
            wrapper.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error</h3><p>' + err.message + '</p></div>';
        }
    }

    renderPurchaseTable(data) {
        const container = document.getElementById('purchaseTableContainer');
        if (!data.rows || data.rows.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><h3>ยังไม่มีประวัติการซื้อ</h3><p>Import ข้อมูลจากเมนู "Import ประวัติการซื้อ"</p></div>';
            return;
        }

        container.innerHTML = `
            <table class="data-table" style="font-size:0.85rem;">
                <thead><tr>
                    <th>วันที่สั่งซื้อ</th><th>PO No.</th><th>Supplier</th>
                    <th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>หน่วย</th>
                    <th>จำนวน</th><th>ราคา/หน่วย</th><th>รวม</th><th>กำหนดส่ง</th><th></th>
                </tr></thead>
                <tbody>${data.rows.map(r => `
                    <tr>
                        <td>${this.formatDate(r.purchase_date)}</td>
                        <td><span class="badge badge-default">${r.po_number || '-'}</span></td>
                        <td title="${r.supplier_display_name || r.supplier_code || ''}">${(r.supplier_display_name || r.supplier_code || '-').substring(0, 20)}</td>
                        <td>${r.product_code || '-'}</td>
                        <td title="${r.product_name || ''}">${(r.product_name || '-').substring(0, 25)}</td>
                        <td>${r.unit || '-'}</td>
                        <td class="text-right">${r.quantity || '-'}</td>
                        <td class="text-right price-cell">${r.unit_price?.toLocaleString() || '-'}</td>
                        <td class="text-right price-cell">${r.total_price?.toLocaleString() || '-'}</td>
                        <td>${this.formatDate(r.delivery_date)}</td>
                        <td><button class="btn btn-sm btn-primary" onclick="app.showPurchaseDetail('${r.product_code}', ${r.supplier_id})" title="ดูประวัติราคา"><i class="fas fa-chart-line"></i></button></td>
                    </tr>
                `).join('')}</tbody>
            </table>
            ${data.totalPages > 1 ? `
            <div class="pagination mt-4" style="display:flex;gap:0.5rem;justify-content:center;align-items:center;">
                ${data.page > 1 ? '<button class="btn btn-sm btn-secondary" onclick="app.loadPurchaseHistoryPage(' + (data.page - 1) + ')"><i class="fas fa-chevron-left"></i></button>' : ''}
                <span>หน้า ${data.page} / ${data.totalPages} (${data.total} รายการ)</span>
                ${data.page < data.totalPages ? '<button class="btn btn-sm btn-secondary" onclick="app.loadPurchaseHistoryPage(' + (data.page + 1) + ')"><i class="fas fa-chevron-right"></i></button>' : ''}
            </div>` : ''}
        `;
    }

    async loadPurchaseHistoryPage(page) {
        const search = document.getElementById('phSearch')?.value || '';
        const supplier_id = document.getElementById('phSupplierFilter')?.value || '';
        const date_from = document.getElementById('phDateFrom')?.value || '';
        const date_to = document.getElementById('phDateTo')?.value || '';
        const data = await api.getPurchaseHistory({ page, limit: 30, search, supplier_id, date_from, date_to });
        this.renderPurchaseTable(data);
    }

    async filterPurchaseHistory() {
        await this.loadPurchaseHistoryPage(1);
    }

    renderMonthlyPurchaseChart(monthlyTrend) {
        const ctx = document.getElementById('monthlyPurchaseChart');
        if (!ctx) return;
        const colors = this.getChartColors();
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: monthlyTrend.map(m => m.month),
                datasets: [{
                    label: 'มูลค่าการซื้อ (฿)',
                    data: monthlyTrend.map(m => m.total_value),
                    backgroundColor: colors.lineColors[0] + '80',
                    borderColor: colors.lineColors[0],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: colors.gridColor }, ticks: { color: colors.tickColor, callback: v => v >= 1000 ? (v / 1000) + 'K' : v } },
                    x: { grid: { display: false }, ticks: { color: colors.tickColor, maxRotation: 45 } }
                }
            }
        });
    }

    async showPurchaseDetail(productCode, supplierId) {
        try {
            const data = await api.getProductPurchaseDetail(productCode, supplierId);
            const s = data.stats;

            // Calculate price change
            let priceChange = '';
            if (data.history.length >= 2) {
                const first = data.history[0].unit_price;
                const last = data.history[data.history.length - 1].unit_price;
                const diff = last - first;
                const pct = first > 0 ? ((diff / first) * 100).toFixed(1) : 0;
                if (diff > 0) priceChange = `<span style="color:#ef4444;font-size:0.85rem;"><i class="fas fa-arrow-up"></i> +${pct}%</span>`;
                else if (diff < 0) priceChange = `<span style="color:#10b981;font-size:0.85rem;"><i class="fas fa-arrow-down"></i> ${pct}%</span>`;
                else priceChange = `<span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fas fa-minus"></i> 0%</span>`;
            }

            // Build table rows with price change indicators
            const tableRows = data.history.map((h, i) => {
                let changeIcon = '';
                if (i > 0) {
                    const prev = data.history[i - 1].unit_price;
                    const curr = h.unit_price;
                    if (curr > prev) changeIcon = '<i class="fas fa-caret-up price-up" style="margin-left:4px;"></i>';
                    else if (curr < prev) changeIcon = '<i class="fas fa-caret-down price-down" style="margin-left:4px;"></i>';
                }
                return `
                    <tr>
                        <td>${this.formatDate(h.purchase_date)}</td>
                        <td><span class="badge badge-default">${h.po_number || '-'}</span></td>
                        <td>${h.pf_number || '-'}</td>
                        <td style="text-align:right;">${h.quantity?.toLocaleString() || '-'} ${h.unit || ''}</td>
                        <td style="text-align:right;font-weight:600;">${h.unit_price?.toLocaleString() || '-'}${changeIcon}</td>
                        <td style="text-align:right;font-weight:600;color:var(--primary-color);">${h.total_price?.toLocaleString() || '-'}</td>
                        <td>${this.formatDate(h.delivery_date)}</td>
                        <td style="color:var(--text-secondary);">${h.remark || '-'}</td>
                    </tr>`;
            }).join('');

            this.showModal(`📦 ประวัติการซื้อ`, `
                <div style="max-height:75vh;overflow-y:auto;">
                    <!-- Product Header -->
                    <div class="purchase-detail-header">
                        <div class="product-icon"><i class="fas fa-box-open"></i></div>
                        <div class="product-info-text">
                            <h2>${this.escHtml(s.productName)}</h2>
                            <p><i class="fas fa-barcode"></i> ${this.escHtml(s.productCode) || '-'} &nbsp;|&nbsp; <i class="fas fa-building"></i> ${this.escHtml(s.supplierName) || '-'} &nbsp;|&nbsp; <i class="fas fa-calendar"></i> ${this.formatDate(s.firstDate)} — ${this.formatDate(s.lastDate)}</p>
                        </div>
                    </div>

                    <!-- Stats Cards -->
                    <div class="purchase-detail-stats">
                        <div class="pd-stat blue">
                            <div class="pd-stat-icon"><i class="fas fa-shopping-cart"></i></div>
                            <div><div class="pd-stat-label">สั่งซื้อทั้งหมด</div><div class="pd-stat-value">${s.totalOrders} <small style="font-size:0.7em;font-weight:400;">ครั้ง</small></div></div>
                        </div>
                        <div class="pd-stat green">
                            <div class="pd-stat-icon"><i class="fas fa-calculator"></i></div>
                            <div><div class="pd-stat-label">ราคาเฉลี่ย</div><div class="pd-stat-value">${s.avgPrice?.toLocaleString()} <small style="font-size:0.7em;font-weight:400;">฿</small></div></div>
                        </div>
                        <div class="pd-stat orange">
                            <div class="pd-stat-icon"><i class="fas fa-coins"></i></div>
                            <div><div class="pd-stat-label">มูลค่ารวม</div><div class="pd-stat-value">${s.totalValue?.toLocaleString()} <small style="font-size:0.7em;font-weight:400;">฿</small></div></div>
                        </div>
                        <div class="pd-stat teal">
                            <div class="pd-stat-icon"><i class="fas fa-arrow-down"></i></div>
                            <div><div class="pd-stat-label">ราคาต่ำสุด</div><div class="pd-stat-value" style="color:#10b981;">${s.minPrice?.toLocaleString()} <small style="font-size:0.7em;font-weight:400;">฿</small></div></div>
                        </div>
                        <div class="pd-stat red">
                            <div class="pd-stat-icon"><i class="fas fa-arrow-up"></i></div>
                            <div><div class="pd-stat-label">ราคาสูงสุด</div><div class="pd-stat-value" style="color:#ef4444;">${s.maxPrice?.toLocaleString()} <small style="font-size:0.7em;font-weight:400;">฿</small></div></div>
                        </div>
                        <div class="pd-stat purple">
                            <div class="pd-stat-icon"><i class="fas fa-tag"></i></div>
                            <div><div class="pd-stat-label">ราคาล่าสุด</div><div class="pd-stat-value">${s.latestPrice?.toLocaleString()} <small style="font-size:0.7em;font-weight:400;">฿</small> ${priceChange}</div></div>
                        </div>
                    </div>

                    <!-- Chart -->
                    <div class="purchase-detail-section">
                        <div class="section-title"><i class="fas fa-chart-line"></i> แนวโน้มราคา</div>
                        <div class="chart-container" style="height:280px;"><canvas id="purchaseDetailChart"></canvas></div>
                    </div>

                    <!-- History Table -->
                    <div class="purchase-detail-section">
                        <div class="section-title"><i class="fas fa-list-alt"></i> รายการสั่งซื้อ (${data.history.length} รายการ)</div>
                        <table class="purchase-detail-table">
                            <thead><tr>
                                <th>วันที่สั่งซื้อ</th><th>PO No.</th><th>PF No.</th><th style="text-align:right;">จำนวน</th>
                                <th style="text-align:right;">ราคา/หน่วย</th><th style="text-align:right;">รวมราคา</th><th>กำหนดส่ง</th><th>หมายเหตุ</th>
                            </tr></thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                    </div>
                </div>
            `, null, 'modal-xl');

            // Draw chart after modal is visible
            setTimeout(() => {
                const ctx = document.getElementById('purchaseDetailChart');
                if (!ctx) return;
                const colors = this.getChartColors();
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.history.map(h => this.formatDate(h.purchase_date)),
                        datasets: [{
                            label: 'ราคา/หน่วย (฿)',
                            data: data.history.map(h => h.unit_price),
                            borderColor: '#6366f1',
                            backgroundColor: 'rgba(99,102,241,0.1)',
                            fill: true, tension: 0.3, pointRadius: 5, pointHoverRadius: 8,
                            pointBackgroundColor: '#6366f1',
                            pointBorderColor: '#fff', pointBorderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: 'rgba(0,0,0,0.8)',
                                padding: 12,
                                titleFont: { size: 13 },
                                bodyFont: { size: 12 },
                                callbacks: {
                                    label: ctx => `ราคา: ${ctx.parsed.y?.toLocaleString()} ฿`
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: false,
                                grid: { color: colors.gridColor },
                                ticks: { color: colors.tickColor, callback: v => v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v }
                            },
                            x: { grid: { display: false }, ticks: { color: colors.tickColor, maxRotation: 45 } }
                        }
                    }
                });
            }, 300);
        } catch (err) {
            this.showAlert('Error: ' + err.message, 'error');
        }
    }
}

// Initialize app
const app = new App();
