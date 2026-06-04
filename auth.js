const crypto = require('crypto');

let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
let SESSION_TOKEN = null;

function generateSessionToken() {
    SESSION_TOKEN = crypto.randomBytes(64).toString('hex');
    return SESSION_TOKEN;
}

function getSessionToken() {
    return SESSION_TOKEN;
}

function getAdminPassword() {
    return ADMIN_PASSWORD;
}

function verifyApiKey(req, res, next) {
    const token = req.headers['x-auth-token'] || req.query.token;
    if (!token || token !== SESSION_TOKEN) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    next();
}

module.exports = {
    generateSessionToken,
    getSessionToken,
    getAdminPassword,
    verifyApiKey
};