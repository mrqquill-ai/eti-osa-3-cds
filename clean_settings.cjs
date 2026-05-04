const fs = require('fs');

// 1. Clean SettingsPage.jsx
const spFile = 'src/pages/SettingsPage.jsx';
let sp = fs.readFileSync(spFile, 'utf8');

sp = sp.replace(/const \[adminPin,\s+setAdminPin\]\s+=\s+useState\(''\)\n/g, '');
const spFetch = `      try {
        const { data: pin } = await supabase.rpc('get_exec_pin')
        if (pin) setAdminPin(pin)
      } catch {}`;
sp = sp.replace(spFetch, '');

sp = sp.replace(/{ p_pin: adminPin }/g, '{}');
sp = sp.replace(/{ p_pin: adminPin, p_batch_size/g, '{ p_batch_size');
sp = sp.replace(/, { p_pin: adminPin }/g, '');

fs.writeFileSync(spFile, sp, 'utf8');

// 2. Clean Dashboard.jsx (multiline args)
const dbFile = 'src/pages/Dashboard.jsx';
let db = fs.readFileSync(dbFile, 'utf8');

// The multiline args look like:
// {
//   p_super_pin: adminPin, ...
// }
db = db.replace(/p_super_pin:\s*adminPin,\s*/g, '');
db = db.replace(/p_super_pin: adminPin, /g, '');
db = db.replace(/p_pin:\s*adminPin,\s*/g, '');

fs.writeFileSync(dbFile, db, 'utf8');

console.log('Cleaned SettingsPage and Dashboard');
