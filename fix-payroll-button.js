const fs = require('fs');
let file = fs.readFileSync('app/(shell)/payroll/page.tsx', 'utf8');

// Desktop layout
file = file.replace(
  `                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => openRateModal(employee)}`,
  `                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleRegisterFingerprint(employee)}
                        disabled={fingerprintLoading === employee.id}
                        className="text-purple-600 hover:text-purple-900 disabled:opacity-50"
                      >
                        {fingerprintLoading === employee.id ? 'Registering...' : 'Register Fingerprint'}
                      </button>
                      <button
                        onClick={() => openRateModal(employee)}`
);

// Mobile layout
file = file.replace(
  `                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); openRateModal(employee); }}`,
  `                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRegisterFingerprint(employee); }}
                        disabled={fingerprintLoading === employee.id}
                        className="w-full py-2 bg-purple-50 text-purple-700 font-medium rounded-lg text-sm disabled:opacity-50"
                      >
                        {fingerprintLoading === employee.id ? 'Registering...' : 'Register Fingerprint'}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); openRateModal(employee); }}`
);

fs.writeFileSync('app/(shell)/payroll/page.tsx', file, 'utf8');
