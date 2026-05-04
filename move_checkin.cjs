const fs = require('fs');

const settingsPath = 'src/pages/SettingsPage.jsx';
const managerPath = 'src/pages/Manager.jsx';

let settingsCode = fs.readFileSync(settingsPath, 'utf8');
let managerCode = fs.readFileSync(managerPath, 'utf8');

// 1. Extract functions from SettingsPage
const funcsRegex = /  const joinUrl = `\$\{window\.location\.origin\}\/join`\n\n  async function copyLink\(\) \{[\s\S]*?  \}\n\n  function downloadQR\(\) \{[\s\S]*?  \}\n/m;
const funcsMatch = settingsCode.match(funcsRegex);
const funcsText = funcsMatch[0];
settingsCode = settingsCode.replace(funcsText, '');

// 2. Extract Card from SettingsPage
const cardRegex = /          \{\/\* CHECK-IN LINK \*\/\}\n          <Card>\n            <CardHeader label="Check-in Link" \/>\n            <div className="px-5 py-5 space-y-4">[\s\S]*?            <\/div>\n          <\/Card>\n/m;
const cardMatch = settingsCode.match(cardRegex);
const cardText = cardMatch[0];
settingsCode = settingsCode.replace(cardText, '');

// 3. Remove state from SettingsPage
settingsCode = settingsCode.replace(/  const \[copied,\s+setCopied\]\s+= useState\(false\)\n  const qrRef = useRef\(null\)\n/, '');

// 4. Inject into Manager.jsx
// Add imports
if (!managerCode.includes('Link2')) {
  managerCode = managerCode.replace(/import {([^}]+)} from 'lucide-react'/, "import {$1, Link2, Copy, Download, Share2} from 'lucide-react'");
}

// Add state
managerCode = managerCode.replace(/  const \[lookupError,\s+setLookupError\]\s+= useState\(''\)\n/, `  const [lookupError,     setLookupError]     = useState('')\n  const [linkCopied,      setLinkCopied]      = useState(false)\n  const linkQrRef = useRef(null)\n`);

// Adjust funcsText to use linkCopied and linkQrRef
let adjustedFuncs = funcsText.replace(/copied/g, 'linkCopied').replace(/setCopied/g, 'setLinkCopied').replace(/qrRef/g, 'linkQrRef');
// Insert funcs before /* ── Live feed (desktop right panel) ── */
managerCode = managerCode.replace(/  \/\* ── Live feed \(desktop right panel\) ── \*\//, adjustedFuncs + '\n  /* ── Live feed (desktop right panel) ── */');

// Adjust cardText
let adjustedCard = cardText.replace(/qrRef/g, 'linkQrRef').replace(/copied/g, 'linkCopied');
// The card in Settings uses <Card> and <CardHeader>. Manager doesn't have these components.
// I will rewrite the card to match Manager's styling.
let newCard = `
          {/* Check-in Link Card */}
          <div className="bg-white rounded-2xl p-5" style={{ border: \`1px solid \${LINE}\` }}>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: MUTED }}>Check-in Link</h2>
            <p className="text-xs mb-4" style={{ color: MUTED }}>
              Share this link or QR code with corps members so they can join the queue from their phones.
            </p>

            {/* QR Code */}
            <div className="flex flex-col items-center gap-3">
              <div
                ref={linkQrRef}
                className="p-3 rounded-2xl inline-block"
                style={{ backgroundColor: '#fff', border: \`1.5px solid \${LINE}\`, boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}
              >
                <QRCodeCanvas
                  value={joinUrl}
                  size={160}
                  bgColor="#ffffff"
                  fgColor={INK}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <button
                onClick={downloadQR}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors active:opacity-70"
                style={{ backgroundColor: '#F1F5F9', color: MUTED }}
              >
                <Download className="w-3.5 h-3.5" />
                Download QR
              </button>
            </div>

            {/* URL row */}
            <div className="flex items-center gap-2 p-3 rounded-xl mt-4" style={{ backgroundColor: '#F8FAFC', border: \`1px solid \${LINE}\` }}>
              <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: MUTED }} />
              <span className="flex-1 text-xs font-mono truncate" style={{ color: INK }}>
                {joinUrl}
              </span>
            </div>

            {/* Share buttons */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <button
                onClick={copyLink}
                className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-semibold transition-colors active:opacity-70"
                style={{ backgroundColor: linkCopied ? 'rgba(27,107,58,0.08)' : '#F1F5F9', color: linkCopied ? G : MUTED, border: \`1px solid \${LINE}\` }}
              >
                <Copy className="w-4 h-4" />
                {linkCopied ? 'Copied!' : 'Copy'}
              </button>

              <button
                onClick={shareWhatsApp}
                className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-semibold transition-colors active:opacity-70"
                style={{ backgroundColor: 'rgba(37,211,102,0.08)', color: '#128C7E', border: '1px solid rgba(37,211,102,0.2)' }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.528 5.858L.057 23.571a.5.5 0 00.612.612l5.713-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.793 9.793 0 01-5.015-1.378l-.36-.214-3.733.961.982-3.617-.235-.374A9.793 9.793 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                </svg>
                WhatsApp
              </button>

              <button
                onClick={shareNative}
                className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-semibold transition-colors active:opacity-70"
                style={{ backgroundColor: 'rgba(27,107,58,0.08)', color: G, border: \`1px solid rgba(27,107,58,0.15)\` }}
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
            </div>
          </div>
`;

// Insert newCard into Manager.jsx below Lookup card
const lookupRegex = /          \{\/\* Lookup \*\/\}\n          <div className="bg-white rounded-2xl p-5" style=\{\{ border: `1px solid \$\{LINE\}` \}\}>[\s\S]*?          <\/div>\n/;
const lookupMatch = managerCode.match(lookupRegex);
managerCode = managerCode.replace(lookupMatch[0], lookupMatch[0] + newCard);

fs.writeFileSync(settingsPath, settingsCode, 'utf8');
fs.writeFileSync(managerPath, managerCode, 'utf8');
console.log('Moved Check-in Link to Manager');
