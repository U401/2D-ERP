const fs = require('fs');

const filePath = 'app/(shell)/inventory/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
`        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1`,
`        const valA = aValue ?? ''
        const valB = bValue ?? ''
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1`
);

fs.writeFileSync(filePath, content, 'utf8');
