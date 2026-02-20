const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

try {
    const filePath = path.join(__dirname, '..', 'history_chem.xlsx');
    const outPath = path.join(__dirname, '..', 'history_analysis_output.txt');
    const lines = [];
    lines.push('File exists: ' + fs.existsSync(filePath));

    const wb = xlsx.readFile(filePath);
    lines.push('Sheets: ' + JSON.stringify(wb.SheetNames));

    for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        lines.push('\n=== Sheet: ' + name + ' ===');
        lines.push('Range: ' + (ws['!ref'] || 'empty'));

        const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
        lines.push('Total rows: ' + data.length);

        for (let i = 0; i < Math.min(25, data.length); i++) {
            lines.push('Row ' + i + ': ' + JSON.stringify(data[i]));
        }

        if (data.length > 25) {
            lines.push('\n... last 5 rows ...');
            for (let i = Math.max(25, data.length - 5); i < data.length; i++) {
                lines.push('Row ' + i + ': ' + JSON.stringify(data[i]));
            }
        }
    }

    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
} catch (e) {
    const outPath = path.join(__dirname, '..', 'history_analysis_output.txt');
    fs.writeFileSync(outPath, 'ERROR: ' + e.message + '\n' + e.stack, 'utf8');
}
