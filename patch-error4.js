const fs = require('fs');
let code = fs.readFileSync('app/(shell)/pos/page.tsx', 'utf8');

const target1 = `                  <button
                    onClick={async () => {
                      if (!session) {`;
const rep1 = `{checkoutError && (
                    <div className="w-full bg-red-100 text-red-700 p-3 rounded-lg text-sm font-medium text-center border border-red-200">
                      {checkoutError}
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      setCheckoutError(null)
                      if (!session) {`;
code = code.replace(target1, rep1);

const target2 = `                        if (result && !result.success) {
                          alert(result.error || 'Failed to finalize sale')
                        }`;
const rep2 = `                        if (result && !result.success) {
                          setCheckoutError(result.error || 'Failed to finalize sale')
                        }`;
code = code.replace(target2, rep2);

fs.writeFileSync('app/(shell)/pos/page.tsx', code, 'utf8');
