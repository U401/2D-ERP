const fs = require('fs');
let code = fs.readFileSync('app/(shell)/pos/page.tsx', 'utf8');
code = code.replace(/alert\((.*?)\)/g, 'alert($1); console.log("ALERT:", $1); if(window.__TAURI__) { try { window.__TAURI__.dialog.message($1) } catch(e){} }');
