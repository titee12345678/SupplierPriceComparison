const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'history_chem.xlsx');
const outPath = path.join(__dirname, '..', 'xlsx_out.txt');
const lines = [];

try {
    lines.push('exists: ' + fs.existsSync(filePath));
    const wb = xlsx.readFile(filePath);
    lines.push('sheets: ' + JSON.stringify(wb.SheetNames));

    for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        lines.push('sheet: ' + name + ' ref: ' + (ws['!ref'] || 'nil'));
        const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
        lines.push('rows: ' + data.length);
        for (let i = 0; i < Math.min(20, data.length); i++) {
            lines.push(i + ':' + JSON.stringify(data[i]));
        }
        if (data.length > 20) {
            lines.push('...');
            for (let i = Math.max(20, data.length - 3); i < data.length; i++) {
                lines.push(i + ':' + JSON.stringify(data[i]));
            }
        }
    }
} catch (e) {
    lines.push('ERR: ' + e.message);
}

fs.writeFileSync(outPath, lines.join('\n'));
