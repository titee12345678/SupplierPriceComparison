// Start script with error logging - delegates to server.js
const fs = require('fs');
const logPath = require('path').join(__dirname, 'startup_log.txt');

// Clear log
fs.writeFileSync(logPath, '=== Server Startup Log ===\n' + new Date().toISOString() + '\n\n');

function log(msg) {
    fs.appendFileSync(logPath, msg + '\n');
    console.log(msg);
}

process.on('uncaughtException', (err) => {
    log('UNCAUGHT EXCEPTION: ' + err.message);
    log(err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    log('UNHANDLED REJECTION: ' + (err && err.message ? err.message : err));
    if (err && err.stack) log(err.stack);
});

try {
    log('Starting server via server.js...');
    require('./server');
    log('Server module loaded successfully.');
} catch (err) {
    log('STARTUP ERROR: ' + err.message);
    log(err.stack);
    process.exit(1);
}
