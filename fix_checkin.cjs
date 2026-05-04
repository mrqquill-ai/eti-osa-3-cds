const fs = require('fs');
const file = 'src/pages/Manager.jsx';
let code = fs.readFileSync(file, 'utf8');

// The injected card text from line 463 to 536
const cardRegex = /          \{\/\* Check-in Link Card \*\/\}\n          <div className="bg-white rounded-2xl p-5" style=\{\{ border: `1px solid \$\{LINE\}` \}\}>[\s\S]*?          <\/div>\n/;
const match = code.match(cardRegex);
if (match) {
  const cardText = match[0];
  // Remove it from its current position
  code = code.replace(cardText, '');
  
  // Now we need to insert it AFTER the Lookup card.
  // The lookup card ends right before {/* Recent (mobile only – desktop has live feed on right) */}
  const targetRegex = /          \{\/\* Recent \(mobile only – desktop has live feed on right\) \*\/\}/;
  code = code.replace(targetRegex, cardText + '\n          {/* Recent (mobile only – desktop has live feed on right) */}');
  
  fs.writeFileSync(file, code, 'utf8');
  console.log('Fixed nesting of Check-in Link Card');
} else {
  console.log('Could not find Check-in Link Card');
}
