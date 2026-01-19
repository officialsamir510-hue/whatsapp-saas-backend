const app = require('./src/app');
require('dotenv').config();

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
    console.log(`\n✅ Server started successfully on port ${PORT}`);
    console.log(`📍 API URL: http://localhost:${PORT}/api`);
    console.log(`💡 Health Check: http://localhost:${PORT}/api/health\n`);
});