'use client'

import React, { useState, useRef } from 'react'
import Papa from 'papaparse'
import { importTimesheets } from '@/app/actions/timesheets'

type User = {
  id: string
  username?: string | null
  full_name?: string | null
  profiles?: {
    username?: string | null
    full_name?: string | null
  }
}

type Props = {
  storeId: string
  storeName?: string
  users: User[]
  onSuccess: () => void
  onCancel: () => void
}

export default function BiometricImporter({ storeId, storeName, users, onSuccess, onCancel }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [fileData, setFileData] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [mapping, setMapping] = useState({
    employeeName: '',
    date: '',
    timeIn: '',
    timeOut: ''
  })

  const [matchedEvents, setMatchedEvents] = useState<any[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          setHeaders(Object.keys(results.data[0] as object))
          setFileData(results.data)
          setStep(2)
        } else {
          setError('File is empty or invalid')
        }
      },
      error: (err) => {
        setError('Error parsing CSV: ' + err.message)
      }
    })
  }

  const handleProcessData = () => {
    if (!mapping.employeeName || !mapping.date || !mapping.timeIn || !mapping.timeOut) {
      setError('Please map all required columns')
      return
    }
    setError(null)

    const events: any[] = []
    
    fileData.forEach((row, index) => {
      const empName = row[mapping.employeeName]
      const dateStr = row[mapping.date]
      const timeInStr = row[mapping.timeIn]
      const timeOutStr = row[mapping.timeOut]

      if (!empName || !dateStr) return

      // Find user
      const user = users.find(u => 
        (u.username || u.profiles?.username || '').toLowerCase() === empName.toLowerCase() ||
        (u.full_name || u.profiles?.full_name || '').toLowerCase() === empName.toLowerCase()
      )

      if (!user) {
        // We could handle manual matching here, but for now just skip unmatched
        return
      }

      // Convert to Date objects
      if (timeInStr && timeInStr !== '') {
        const inDate = new Date(`${dateStr} ${timeInStr}`)
        if (!isNaN(inDate.getTime())) {
          events.push({
              display_name: user.username || user.full_name || user.profiles?.username || user.profiles?.full_name || 'Unknown',
              user_id: user.id,
            event_type: 'clock_in',
            occurred_at: inDate.toISOString(),
            source: 'biometric'
          })
        }
      }

      if (timeOutStr && timeOutStr !== '') {
        const outDate = new Date(`${dateStr} ${timeOutStr}`)
        if (!isNaN(outDate.getTime())) {
          events.push({
              display_name: user.username || user.full_name || user.profiles?.username || user.profiles?.full_name || 'Unknown',
              user_id: user.id,
            event_type: 'clock_out',
            occurred_at: outDate.toISOString(),
            source: 'biometric'
          })
        }
      }
    })

    if (events.length === 0) {
      setError('No valid matching events found in the file.')
      return
    }

    setMatchedEvents(events)
    setStep(3)
  }

  const handleImport = async () => {
    setLoading(true)
    try {
      await importTimesheets(storeId, matchedEvents)
      onSuccess()
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-900 text-white">
          <h2 className="text-xl font-bold">Import Biometrics (CSV)</h2>
          <button onClick={onCancel} className="text-gray-300 hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-gray-600">Select a CSV file containing your biometric timesheet data.</p>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center hover:bg-gray-50 transition-colors">
                <input 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                >
                  Browse Files
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-gray-600">Map the columns from your CSV to the system fields.</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Employee Name</label>
                  <select 
                    className="w-full border p-2 rounded-lg"
                    value={mapping.employeeName}
                    onChange={e => setMapping({...mapping, employeeName: e.target.value})}
                  >
                    <option value="">Select column...</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <select 
                    className="w-full border p-2 rounded-lg"
                    value={mapping.date}
                    onChange={e => setMapping({...mapping, date: e.target.value})}
                  >
                    <option value="">Select column...</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Time In</label>
                  <select 
                    className="w-full border p-2 rounded-lg"
                    value={mapping.timeIn}
                    onChange={e => setMapping({...mapping, timeIn: e.target.value})}
                  >
                    <option value="">Select column...</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Time Out</label>
                  <select 
                    className="w-full border p-2 rounded-lg"
                    value={mapping.timeOut}
                    onChange={e => setMapping({...mapping, timeOut: e.target.value})}
                  >
                    <option value="">Select column...</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setStep(1)} className="px-4 py-2 border rounded-lg">Back</button>
                <button onClick={handleProcessData} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Preview Data</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-gray-600">Ready to import <strong>{matchedEvents.length}</strong> time clock events.</p>
              
              <div className="max-h-[300px] overflow-y-auto border rounded-lg p-4 bg-gray-50">
                {matchedEvents.slice(0, 10).map((ev, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                    <div className="flex flex-col">
                      <span className="font-semibold text-gray-800">{ev.display_name}</span>
                      <span className="font-mono text-xs text-gray-500">{new Date(ev.occurred_at).toLocaleString()} {storeName ? `- ${storeName}` : ''}</span>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${ev.event_type === 'clock_in' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {ev.event_type === 'clock_in' ? 'IN' : 'OUT'}
                    </span>
                  </div>
                ))}
                {matchedEvents.length > 10 && (
                  <div className="text-center text-gray-400 text-xs mt-2 italic">And {matchedEvents.length - 10} more...</div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setStep(2)} className="px-4 py-2 border rounded-lg">Back</button>
                <button 
                  onClick={handleImport} 
                  disabled={loading}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'Importing...' : 'Confirm Import'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
