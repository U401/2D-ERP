const fs = require('fs');
let code = fs.readFileSync('components/Sidebar.tsx', 'utf8');

code = code.replace(
  /const \[isCollapsed, setIsCollapsed\] = useState\(false\)/,
  'const [isCollapsed, setIsCollapsed] = useState(true)'
);

fs.writeFileSync('components/Sidebar.tsx', code, 'utf8');
