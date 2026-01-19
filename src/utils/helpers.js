// Format phone number
exports.formatPhoneNumber = (phone) => {
    return phone.replace(/[\s+\-()]/g, '');
};

// Generate random string
exports.generateRandomString = (length = 32) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Paginate helper
exports.paginate = (page = 1, limit = 20) => {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    return { skip, limit: parseInt(limit) };
};

// Response helper
exports.successResponse = (res, data, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data
    });
};

exports.errorResponse = (res, message = 'Error', statusCode = 500) => {
    return res.status(statusCode).json({
        success: false,
        error: message
    });
};