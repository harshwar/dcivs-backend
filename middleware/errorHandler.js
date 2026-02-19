/**
 * Global Error Handler Middleware
 * Catches all unhandled errors and returns consistent JSON responses
 */

/**
 * Error handler middleware - must be registered LAST in Express
 */
function errorHandler(err, req, res, next) {
    // Log error for debugging (in production, use proper logging)
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(`❌ Error at ${req.method} ${req.path}`);
    console.error(`   Message: ${err.message}`);
    if (process.env.NODE_ENV !== 'production') {
        console.error(`   Stack: ${err.stack}`);
    }
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Determine status code
    const statusCode = err.statusCode || err.status || 500;

    // Build error response
    const response = {
        error: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    };

    res.status(statusCode).json(response);
}

/**
 * 404 Not Found handler - for undefined routes
 */
function notFoundHandler(req, res, next) {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} does not exist`
    });
}

/**
 * Async wrapper to catch errors in async route handlers
 * Usage: app.get('/route', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = { errorHandler, notFoundHandler, asyncHandler };
