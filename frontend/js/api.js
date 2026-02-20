// API Client for Supplier Price Comparison System
const API_BASE = `${window.location.origin}/api`;

class ApiClient {
    constructor() {
        this.baseUrl = API_BASE;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            ...options,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        if (options.body && !(options.body instanceof FormData)) {
            config.body = JSON.stringify(options.body);
        } else if (options.body instanceof FormData) {
            delete config.headers['Content-Type'];
            config.body = options.body;
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'เกิดข้อผิดพลาด');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Authentication
    async login(username, password) {
        return this.request('/auth/login', {
            method: 'POST',
            body: { username, password }
        });
    }

    async logout() {
        return this.request('/auth/logout', { method: 'POST' });
    }

    async getCurrentUser() {
        return this.request('/auth/me');
    }

    async changePassword(currentPassword, newPassword) {
        return this.request('/auth/change-password', {
            method: 'POST',
            body: { currentPassword, newPassword }
        });
    }

    // Supplier Portal
    async getSupplierDashboard() {
        return this.request('/supplier/dashboard');
    }

    async getSupplierProducts() {
        return this.request('/supplier/products');
    }

    async getSupplierProduct(id) {
        return this.request(`/supplier/products/${id}`);
    }

    async createSupplierProduct(data) {
        return this.request('/supplier/products', {
            method: 'POST',
            body: data
        });
    }

    async updateSupplierProduct(id, data) {
        return this.request(`/supplier/products/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    async deleteSupplierProduct(id) {
        return this.request(`/supplier/products/${id}`, {
            method: 'DELETE'
        });
    }

    async downloadTemplate() {
        const response = await fetch(`${this.baseUrl}/supplier/template`, {
            credentials: 'include'
        });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'supplier_price_template.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
    }

    async uploadPreview(file) {
        const formData = new FormData();
        formData.append('file', file);
        return this.request('/supplier/import/preview', {
            method: 'POST',
            body: formData
        });
    }

    async confirmImport(items) {
        return this.request('/supplier/import/confirm', {
            method: 'POST',
            body: { items }
        });
    }

    async getPriceHistory(productId) {
        return this.request(`/supplier/price-history/${productId}`);
    }

    // Admin/Buyer Import
    async downloadAdminTemplate() {
        const response = await fetch('/api/procurement/import/template');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'admin_import_template.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
    }

    async uploadAdminPreview(file) {
        const formData = new FormData();
        formData.append('file', file);
        return this.request('/procurement/import/preview', {
            method: 'POST',
            body: formData
        });
    }

    async confirmAdminImport(items) {
        return this.request('/procurement/import/confirm', {
            method: 'POST',
            body: { items }
        });
    }

    // Procurement Portal
    async getProcurementDashboard() {
        return this.request('/procurement/dashboard');
    }

    async getDashboardCharts(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/procurement/dashboard-charts${query ? '?' + query : ''}`);
    }

    async getProcurementSuppliers() {
        return this.request('/procurement/suppliers');
    }

    async getAllProducts(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/procurement/all-products${query ? '?' + query : ''}`);
    }

    async getProductGroups() {
        return this.request('/procurement/product-groups');
    }

    async getProductGroup(id) {
        return this.request(`/procurement/product-groups/${id}`);
    }

    async createProductGroup(data) {
        return this.request('/procurement/product-groups', {
            method: 'POST',
            body: data
        });
    }

    async updateProductGroup(id, data) {
        return this.request(`/procurement/product-groups/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    async deleteProductGroup(id) {
        return this.request(`/procurement/product-groups/${id}`, {
            method: 'DELETE'
        });
    }

    async getCategories() {
        return this.request('/procurement/categories');
    }

    async getUnmappedProducts() {
        return this.request('/procurement/unmapped-products');
    }

    async mapProducts(productIds, productGroupId) {
        return this.request('/procurement/mapping', {
            method: 'POST',
            body: { product_ids: productIds, product_group_id: productGroupId }
        });
    }

    async removeMapping(productId) {
        return this.request(`/procurement/mapping/${productId}`, {
            method: 'DELETE'
        });
    }

    async updateProductCode(productId, productCode) {
        return this.request(`/procurement/products/${productId}/code`, {
            method: 'PUT',
            body: { product_code: productCode }
        });
    }

    async getPriceComparison(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/procurement/price-comparison${query ? '?' + query : ''}`);
    }

    async getPriceComparisonChart(groupId) {
        return this.request(`/procurement/price-comparison/${groupId}/chart`);
    }

    async getMappingSuggestions() {
        return this.request('/procurement/mapping-suggestions');
    }

    async exportPriceComparison(categoryId) {
        const query = categoryId ? `?category_id=${categoryId}` : '';
        const response = await fetch(`${this.baseUrl}/procurement/export${query}`, {
            credentials: 'include'
        });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `price_comparison_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    // Price History (Procurement)
    async getAllPriceHistory(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/procurement/price-history${query ? '?' + query : ''}`);
    }

    async getProductPriceHistoryDetail(productId) {
        return this.request(`/procurement/price-history/${productId}`);
    }

    // Admin Portal
    async getAdminDashboard() {
        return this.request('/admin/dashboard');
    }

    async getUsers() {
        return this.request('/admin/users');
    }

    async getUser(id) {
        return this.request(`/admin/users/${id}`);
    }

    async createUser(data) {
        return this.request('/admin/users', {
            method: 'POST',
            body: data
        });
    }

    async updateUser(id, data) {
        return this.request(`/admin/users/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    async deleteUser(id) {
        return this.request(`/admin/users/${id}`, {
            method: 'DELETE'
        });
    }

    async resetPassword(userId, newPassword) {
        return this.request(`/admin/users/${userId}/reset-password`, {
            method: 'POST',
            body: { new_password: newPassword }
        });
    }

    async getAdminSuppliers() {
        // Try procurement endpoint (admin + buyer), fallback to admin-only
        try {
            return await this.request('/procurement/manage-suppliers');
        } catch {
            return this.request('/admin/suppliers');
        }
    }

    async getAdminSupplier(id) {
        return this.request(`/admin/suppliers/${id}`);
    }

    async createSupplier(data) {
        try {
            return await this.request('/procurement/manage-suppliers', {
                method: 'POST',
                body: data
            });
        } catch {
            return this.request('/admin/suppliers', {
                method: 'POST',
                body: data
            });
        }
    }

    async updateSupplier(id, data) {
        try {
            return await this.request(`/procurement/manage-suppliers/${id}`, {
                method: 'PUT',
                body: data
            });
        } catch {
            return this.request(`/admin/suppliers/${id}`, {
                method: 'PUT',
                body: data
            });
        }
    }

    async deleteSupplier(id) {
        try {
            return await this.request(`/procurement/manage-suppliers/${id}`, {
                method: 'DELETE'
            });
        } catch {
            return this.request(`/admin/suppliers/${id}`, {
                method: 'DELETE'
            });
        }
    }

    async uploadProductImage(productId, file) {
        const formData = new FormData();
        formData.append('image', file);
        return this.request(`/admin/products/${productId}/image`, {
            method: 'POST',
            body: formData
        });
    }

    async deleteProductImage(productId) {
        return this.request(`/admin/products/${productId}/image`, {
            method: 'DELETE'
        });
    }

    async getAdminCategories() {
        return this.request('/admin/categories');
    }

    async createCategory(data) {
        return this.request('/admin/categories', {
            method: 'POST',
            body: data
        });
    }

    async updateCategory(id, data) {
        return this.request(`/admin/categories/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    async deleteCategory(id) {
        return this.request(`/admin/categories/${id}`, {
            method: 'DELETE'
        });
    }

    async exportSQL() {
        const response = await fetch(`${this.baseUrl}/admin/export/sql`, {
            credentials: 'include'
        });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_${new Date().toISOString().split('T')[0]}.sql`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    async exportExcel(tables) {
        const query = tables ? `?tables=${tables.join(',')}` : '';
        const response = await fetch(`${this.baseUrl}/admin/export/excel${query}`, {
            credentials: 'include'
        });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `data_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    async getLogs(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/admin/logs${query ? '?' + query : ''}`);
    }

    // Report & Analytics
    async getPriceAnomalies(threshold = 15) {
        return this.request(`/procurement/price-anomalies?threshold=${threshold}`);
    }

    async getReportsSummary() {
        return this.request('/procurement/reports/summary');
    }

    async getTopVolatile() {
        return this.request('/procurement/top-volatile');
    }

    // Bulk operations
    async bulkDeleteProducts(productIds) {
        return this.request('/procurement/bulk-delete-products', {
            method: 'POST',
            body: { productIds }
        });
    }

    // ===== Purchase History =====
    async downloadPurchaseTemplate() {
        const response = await fetch(`${this.baseUrl}/purchase/import/template`, { credentials: 'include' });
        return response.blob();
    }

    async uploadPurchasePreview(file) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`${this.baseUrl}/purchase/import/preview`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        return response.json();
    }

    async confirmPurchaseImport(items) {
        return this.request('/purchase/import/confirm', {
            method: 'POST',
            body: { items }
        });
    }

    async getPurchaseHistory(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/purchase/history${query ? '?' + query : ''}`);
    }

    async getProductPurchaseDetail(productCode, supplierId) {
        const query = supplierId ? `?supplier_id=${supplierId}` : '';
        return this.request(`/purchase/history/product/${encodeURIComponent(productCode)}${query}`);
    }

    async getPurchaseSummary() {
        return this.request('/purchase/summary');
    }
}

// Export singleton instance
const api = new ApiClient();
