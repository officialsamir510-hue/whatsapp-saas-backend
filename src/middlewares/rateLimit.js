const rateLimit = require('express-rate-limit');

exports.messageLimiter = rateLimit({
  windowMs: 1000,
  max: 10,
  message: { error: 'Message rate limit exceeded' }
});

exports.broadcastLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Broadcast rate limit exceeded' }
});