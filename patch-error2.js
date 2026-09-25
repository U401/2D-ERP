const fs = require('fs');
let code = fs.readFileSync('app/(shell)/pos/page.tsx', 'utf8');

code = code.replace(
`                  {checkoutError && (
                    <div className="w-full bg-red-100 text-red-700 p-3 rounded-lg text-sm font-medium text-center border border-red-200">
                      {checkoutError}
                    </div>
                  )}

                  {isProcessing ? 'Processing...' : \`Charge ₱\${total.toFixed(2)}\`}
                </button>`,
`                  {isProcessing ? 'Processing...' : \`Charge ₱\${total.toFixed(2)}\`}
                </button>`
);

code = code.replace(
`<button
                  onClick={async () => {
                      setCheckoutError(null)
                    if (!session) {`,
`{checkoutError && (
                    <div className="w-full bg-red-100 text-red-700 p-3 rounded-lg text-sm font-medium text-center border border-red-200 mb-2">
                      {checkoutError}
                    </div>
                  )}
                  <button
                  onClick={async () => {
                      setCheckoutError(null)
                    if (!session) {`
);

fs.writeFileSync('app/(shell)/pos/page.tsx', code, 'utf8');
