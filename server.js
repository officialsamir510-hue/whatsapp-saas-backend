// server.js

const app = require('./src/app');
require('dotenv').config();

const PORT = process.env.PORT || 5001;

// For Vercel Serverless
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`✅ Server started on port ${PORT}`);
        console.log(`📍 API URL: http://localhost:${PORT}/api`);
    });
}

// Export for Vercel
module.exports = app;