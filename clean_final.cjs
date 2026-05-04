const fs = require('fs');

const dbFile = 'src/pages/Dashboard.jsx';
let db = fs.readFileSync(dbFile, 'utf8');

// Remove changePin logic from Dashboard.jsx
db = db.replace(/  async function changePin\(\) \{[\s\S]*?setShowChangePinModal\(false\)\n  \}/g, '');

// Remove superChangeSuperPin logic
db = db.replace(/  async function superChangeSuperPin\(\) \{[\s\S]*?setShowSuperPinModal\(false\); setNewSuperPin\(''\)\n    \} catch \(e\) \{ showError\(e\) \} finally \{ setBusy\(false\) \}\n  \}/g, '');

// Remove adminPin default warning
db = db.replace(/      \{\/\* ── Default PIN warning ── \*\/\}\n      \{adminPin === '2025' && \([\s\S]*?      \)\}\n\n/g, '');

fs.writeFileSync(dbFile, db, 'utf8');
console.log('Cleaned final adminPin references');
