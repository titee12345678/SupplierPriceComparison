const xlsx = require('./backend/node_modules/xlsx');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'history_chem.xlsx');
const lines = [];
lines.push('File exists: ' + fs.existsSync(filePath));

const wb = xlsx.readFile(filePath);
lines.push('Sheets: ' + JSON.stringify(wb.SheetNames));

for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    lines.push('\n=== Sheet: ' + name + ' ===');
    lines.push('Range: ' + ws['!ref']);

    const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    lines.push('Total rows: ' + data.length);

    // Print first 25 rows
    for (let i = 0; i < Math.min(25, data.length); i++) {
        lines.push('Row ' + i + ': ' + JSON.stringify(data[i]));
    }

    // Also print a middle section if many rows
    if (data.length > 50) {
        lines.push('\n... middle sample (row 30-35) ...');
        for (let i = 30; i < Math.min(35, data.length); i++) {
            lines.push('Row ' + i + ': ' + JSON.stringify(data[i]));
        }
    }

    // Last rows
    if (data.length > 25) {
        lines.push('\n... last 5 rows ...');
        for (let i = Math.max(25, data.length - 5); i < data.length; i++) {
            lines.push('Row ' + i + ': ' + JSON.stringify(data[i]));
        }
    }
}

fs.writeFileSync(path.join(__dirname, 'history_analysis_output.txt'), lines.join('\n'));
