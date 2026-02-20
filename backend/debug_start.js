require('fs').writeFileSync('/Users/teejakkrit/Downloads/plan2/backend/_debug.txt', 'STEP1: script running\n');
try {
    require('fs').appendFileSync('/Users/teejakkrit/Downloads/plan2/backend/_debug.txt', 'STEP2: loading server\n');
    require('./server');
    require('fs').appendFileSync('/Users/teejakkrit/Downloads/plan2/backend/_debug.txt', 'STEP3: server loaded OK\n');
} catch (e) {
    require('fs').appendFileSync('/Users/teejakkrit/Downloads/plan2/backend/_debug.txt', 'ERROR: ' + e.message + '\n' + e.stack + '\n');
}
