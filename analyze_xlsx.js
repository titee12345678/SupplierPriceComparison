const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'history_chem.xlsx');
console.log('File exists:', fs.existsSync(filePath));

const wb = xlsx.readFile(filePath);
console.log('Sheets:', wb.SheetNames);

for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    console.log(`\n=== Sheet: ${name} ===`);
    console.log('Range:', ws['!ref']);

    const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    console.log('Total rows:', data.length);

    // Print first 25 rows
    for (let i = 0; i < Math.min(25, data.length); i++) {
        console.log(`Row ${i}:`, JSON.stringify(data[i]));
    }

    // Also print a middle section if many rows
    if (data.length > 50) {
        console.log('\n... middle sample (row 30-35) ...');
        for (let i = 30; i < Math.min(35, data.length); i++) {
            console.log(`Row ${i}:`, JSON.stringify(data[i]));
        }
    }
}
