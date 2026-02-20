// Authentication middleware

const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
    }
    next();
};

const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
        }

        if (!roles.includes(req.session.user.role)) {
            return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
        }
        next();
    };
};

const requireSupplier = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
    }

    if (req.session.user.role !== 'supplier' || !req.session.user.supplier_id) {
        return res.status(403).json({ error: 'คุณต้องเป็น Supplier เพื่อเข้าถึงส่วนนี้' });
    }
    next();
};

module.exports = {
    requireAuth,
    requireRole,
    requireSupplier
};
