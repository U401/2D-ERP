const fs = require('fs');
let code = fs.readFileSync('app/(shell)/pos/page.tsx', 'utf8');

// Add state
code = code.replace(
  /const \[isProcessing, setIsProcessing\] = useState\(false\)/,
  `const [isProcessing, setIsProcessing] = useState(false)\n  const [checkoutError, setCheckoutError] = useState<string | null>(null)`
);

// Clear error on click
code = code.replace(
  /onClick=\{async \(\) => \{\n\s*if \(\!session\)/,
  `onClick={async () => {\n                      setCheckoutError(null)\n                      if (!session)`
);

// Set error instead of alert
code = code.replace(
  /if \(result && \!result\.success\) \{\n\s*alert\(result\.error \|\| 'Failed to finalize sale'\)\n\s*\}/,
  `if (result && !result.success) {\n                          setCheckoutError(result.error || 'Failed to finalize sale')\n                        }`
);

// Add error UI above the clear cart button
code = code.replace(
  /<button\n\s*onClick=\{async \(\) => \{/,
  `{checkoutError && (
                    <div className="w-full bg-red-100 text-red-700 p-3 rounded-lg text-sm font-medium text-center border border-red-200">
                      {checkoutError}
                    </div>
                  )}
                  <button
                    onClick={async () => {`
);

fs.writeFileSync('app/(shell)/pos/page.tsx', code, 'utf8');
