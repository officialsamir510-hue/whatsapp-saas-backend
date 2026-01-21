const rateLimit = require('express-rate-limit');

// For dashboard routes (authenticated users)
const dashboardLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// For public API routes (API key authenticated)
const createApiLimiter = (requestsPerMinute = 60) => {
    return rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: requestsPerMinute,
        message: {
            success: false,
            error: 'Rate limit exceeded',
            message: `You can make ${requestsPerMinute} requests per minute on your current plan`
        },
        keyGenerator: (req) => {
            // Use user ID as key if authenticated
            return req.user?._id?.toString() || req.ip;
        },
        standardHeaders: true,
        legacyHeaders: false,
    });
};

// Dynamic rate limiter based on user's plan
const dynamicApiLimiter = (req, res, next) => {
    const limit = req.user?.planLimits?.apiCallsPerMinute || 10;
    
    const limiter = createApiLimiter(limit);
    return limiter(req, res, next);
};

module.exports = {
    dashboardLimiter,
    createApiLimiter,
    dynamicApiLimiter
};