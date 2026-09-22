const fs = require('fs');
let file = fs.readFileSync('app/(shell)/payroll/page.tsx', 'utf8');

const oldDesktopBtn = `<button
                        onClick={() => openRateModal(employee)}
                        className="text-blue-600 hover:text-blue-900"
                      >`;
const newDesktopBtn = `<button
                        onClick={() => handleRegisterFingerprint(employee)}
                        disabled={fingerprintLoading === employee.id}
                        className="text-purple-600 hover:text-purple-900 disabled:opacity-50"
                      >
                        {fingerprintLoading === employee.id ? 'Registering...' : 'Register Fingerprint'}
                      </button>
                      <button
                        onClick={() => openRateModal(employee)}
                        className="text-blue-600 hover:text-blue-900"
                      >`;

const oldMobileBtn = `<button
                        onClick={(e) => { e.stopPropagation(); openRateModal(employee); }}
                        className="flex-1 py-2 bg-blue-50 text-blue-700 font-medium rounded-lg text-sm"
                      >`;
const newMobileBtn = `<div className="flex-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRegisterFingerprint(employee); }}
                          disabled={fingerprintLoading === employee.id}
                          className="w-full py-2 bg-purple-50 text-purple-700 font-medium rounded-lg text-sm disabled:opacity-50"
                        >
                          {fingerprintLoading === employee.id ? 'Registering...' : 'Register Fingerprint'}
                        </button>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); openRateModal(employee); }}
                        className="flex-1 py-2 bg-blue-50 text-blue-700 font-medium rounded-lg text-sm"
                      >`;

file = file.replace(oldDesktopBtn, newDesktopBtn);
file = file.replace(oldMobileBtn, newMobileBtn);

fs.writeFileSync('app/(shell)/payroll/page.tsx', file, 'utf8');
