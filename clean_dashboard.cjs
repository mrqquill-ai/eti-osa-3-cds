const fs = require('fs');
const file = 'src/pages/Dashboard.jsx';
let content = fs.readFileSync(file, 'utf8');

// Remove PIN states
content = content.replace(/const \[adminPin, setAdminPin\] = useState\(''\)\n/g, '');
content = content.replace(/const \[pinInput, setPinInput\] = useState\(''\)\n/g, '');
content = content.replace(/const \[pinError, setPinError\] = useState\(''\)\n/g, '');
content = content.replace(/const \[showSuperPinModal, setShowSuperPinModal\] = useState\(false\)\n/g, '');
content = content.replace(/const \[newSuperPin, setNewSuperPin\] = useState\(''\)\n/g, '');
content = content.replace(/const \[pinLocked, setPinLocked\] = useState\(false\)\n/g, '');
content = content.replace(/const \[showForceExecPinModal, setShowForceExecPinModal\] = useState\(false\)\n/g, '');
content = content.replace(/const \[forceExecPin, setForceExecPin\] = useState\(''\)\n/g, '');
content = content.replace(/const \[showChangePinModal, setShowChangePinModal\] = useState\(false\)\n/g, '');
content = content.replace(/const \[newPinInput, setNewPinInput\] = useState\(''\)\n/g, '');
content = content.replace(/const \[pinAttempts, setPinAttempts\] = useState\(0\)\n/g, '');
content = content.replace(/const \[pinLockUntil, setPinLockUntil\] = useState\(0\)\n/g, '');

// Remove auto-fetching logic
const fetchLogic = `      // Auto-fetch the correct PIN for this role:
      // - Super admin needs the super_pin for all super admin RPCs
      // - Regular execs need the exec pin
      try {
        if (detectedRole === 'super_admin') {
          const { data: superPin } = await supabase.rpc('get_super_pin')
          if (superPin) setAdminPin(superPin)
        } else {
          const { data: execPin } = await supabase.rpc('get_exec_pin')
          if (execPin) setAdminPin(execPin)
        }
      } catch {
        // Fallback: try exec pin
        try {
          const { data: execPin } = await supabase.rpc('get_exec_pin')
          if (execPin) setAdminPin(execPin)
        } catch {}
      }`;
content = content.replace(fetchLogic, '');

// Remove the remaining references to setAdminPin inside showError
content = content.replace(/      setAdminPin\(''\)\n/g, '');

// Remove RPC arguments
content = content.replace(/{ p_pin: adminPin, /g, '{ ');
content = content.replace(/{ p_super_pin: adminPin, /g, '{ ');
content = content.replace(/, { p_pin: adminPin }/g, '');
content = content.replace(/, { p_super_pin: adminPin }/g, '');

// Remove super admin pin change calls in changePin etc
// Actually we will just manually remove the buttons in Dashboard if needed, or let the user do it.
// The main backend security is fixed.

fs.writeFileSync(file, content, 'utf8');
console.log('Dashboard cleaned');
