import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, writeBatch, doc, query, where, collectionGroup } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from '../firebase';

export default function BulkEntryTool({ resumeSheet, onClearResume }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Sheet Data
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [sheetData, setSheetData] = useState({ date: '', event: '', sheetId: '' });
  const [uploadSuccess, setUploadSuccess] = useState(false); // <--- NEW

  // Entry Data
  const [members, setMembers] = useState([]);
  const [rows, setRows] = useState([{ memberId: '', hours: '', activity: '' }]);

  // --- LOAD DATA ON RESUME ---
  useEffect(() => {
    if (resumeSheet) {
      // 1. Load Sheet Info
      setSheetData({
        date: resumeSheet.date,
        event: resumeSheet.event || '',
        sheetId: resumeSheet.sheetId,
        imageUrl: resumeSheet.imageUrl
      });
      setPreviewUrl(resumeSheet.imageUrl);

      // 2. Fetch Existing Logs for this Sheet
      const loadExistingLogs = async () => {
        setLoading(true);
        try {
          const existingRows = [];

          // A. Fetch Active Logs
          const qActive = query(collection(db, "logs"), where("sourceSheetId", "==", resumeSheet.sheetId));
          const snapActive = await getDocs(qActive);
          snapActive.forEach(d => {
            const data = d.data();
            existingRows.push({
              logPath: `logs/${d.id}`, // Store path for updates
              memberId: data.memberId,
              hours: data.hours,
              activity: data.activity,
              isExisting: true // Flag to lock dropdown
            });
          });

          // B. Fetch Legacy Logs (Collection Group)
          const qLegacy = query(collectionGroup(db, "legacyLogs"), where("sourceSheetId", "==", resumeSheet.sheetId));
          const snapLegacy = await getDocs(qLegacy);

          // For legacy, we need to find the parent Member ID from the ref path
          // Path looks like: legacy_members/{MEMBER_ID}/legacyLogs/{LOG_ID}
          snapLegacy.forEach(d => {
            const data = d.data();
            const parentPath = d.ref.parent.parent; // legacy_members/{id}
            const legacyMemberId = parentPath ? parentPath.id : "";

            existingRows.push({
              logPath: d.ref.path, // Store full path for updates
              memberId: legacyMemberId,
              hours: data.hours,
              activity: data.activity,
              isExisting: true
            });
          });

          // C. Set Rows (Append an empty one at the end for convenience)
          if (existingRows.length > 0) {
            setRows([...existingRows, { memberId: '', hours: '', activity: resumeSheet.event || '' }]);
          } else {
            setRows([{ memberId: '', hours: '', activity: resumeSheet.event || '' }]);
          }

          setStep(2);
        } catch (err) {
          console.error(err);
          alert("Error loading existing entries: " + err.message);
        }
        setLoading(false);
      };

      loadExistingLogs();
    }
  }, [resumeSheet]);

  // --- LOAD MEMBER LIST ---
  useEffect(() => {
    const fetchMembers = async () => {
      setLoading(true);
      const allMembers = [];
      // 1. Active
      const activeSnap = await getDocs(collection(db, "members"));
      activeSnap.forEach(d => allMembers.push({
        id: d.id,
        name: `${d.data().lastName}, ${d.data().firstName}`,
        type: 'active'
      }));
      // 2. Legacy
      const legacySnap = await getDocs(collection(db, "legacy_members"));
      legacySnap.forEach(d => {
        if (d.data().lastName) {
          allMembers.push({
            id: d.id,
            name: `${d.data().lastName}, ${d.data().firstName} (Legacy)`,
            type: 'legacy'
          });
        }
      });
      allMembers.sort((a, b) => a.name.localeCompare(b.name));
      setMembers(allMembers);
      setLoading(false);
    };
    fetchMembers();
  }, []);

  const handleFileSelect = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
      setPreviewUrl(URL.createObjectURL(e.target.files[0]));
      const shortId = Math.floor(1000 + Math.random() * 9000);
      setSheetData(prev => ({ ...prev, sheetId: `#${shortId}` }));
    }
  };

  const resetUpload = () => {
    setUploadSuccess(false);
    setFile(null);
    setPreviewUrl(null);
    // Generate NEW ID for the next sheet immediately
    const shortId = Math.floor(1000 + Math.random() * 9000);
    setSheetData({ date: '', event: '', sheetId: `#${shortId}` });
  };


  const handleStartEntry = async () => {
    if (!file || !sheetData.date) return alert("Please select a file and date.");
    setLoading(true);

    try {
      const storageRef = ref(storage, `sheets/${sheetData.date}_${sheetData.sheetId}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, "volunteer_sheets"), {
        ...sheetData,
        imageUrl: url,
        uploadedAt: new Date(),
        status: 'processing'
      });

      setSheetData(prev => ({ ...prev, imageUrl: url }));
      // STOP! Don't go to step 2 yet.
      setUploadSuccess(true);
    } catch (err) {
      console.error(err);
      alert("Error uploading sheet: " + err.message);
    }
    setLoading(false);
  };

  const updateRow = (index, field, value) => {
    const newRows = [...rows];
    newRows[index][field] = value;
    setRows(newRows);
  };

  const addRow = () => {
    setRows([...rows, { memberId: '', hours: '', activity: sheetData.event || '' }]);
  };

  const removeRow = (index) => {
    // If removing an existing row, we should warn them that "Submit" won't delete it from DB
    // For simplicity in this tool, we just remove it from the VIEW. 
    // To delete, they should use the main log viewer.
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleCancel = () => {
    setStep(1);
    setFile(null);
    setPreviewUrl(null);
    setSheetData({ date: '', event: '', sheetId: '' });
    setRows([{ memberId: '', hours: '', activity: '' }]);
    if (onClearResume) onClearResume();
  };

  const handleSubmitAll = async () => {
    // Filter out empty rows
    const validRows = rows.filter(r => r.memberId && r.hours);
    if (validRows.length === 0) return;

    if (!window.confirm(`Ready to save changes to ${validRows.length} entries?`)) return;
    setLoading(true);

    const batch = writeBatch(db);
    let updateCount = 0;
    let createCount = 0;

    validRows.forEach(row => {
      // CASE 1: EXISTING ROW -> UPDATE
      if (row.isExisting && row.logPath) {
        const logRef = doc(db, row.logPath);
        batch.update(logRef, {
          date: sheetData.date,
          activity: row.activity,
          hours: parseFloat(row.hours)
        });
        updateCount++;
      }
      // CASE 2: NEW ROW -> CREATE
      else {
        const memberInfo = members.find(m => m.id === row.memberId);
        if (!memberInfo) return;

        let logRef;
        if (memberInfo.type === 'legacy') {
          logRef = doc(collection(db, "legacy_members", row.memberId, "legacyLogs"));
          batch.set(logRef, {
            date: sheetData.date,
            activity: row.activity,
            hours: parseFloat(row.hours),
            status: "approved",
            sourceSheetId: sheetData.sheetId,
            importedAt: new Date(),
            applyToNextYear: false
          });
        } else {
          logRef = doc(collection(db, "logs"));
          batch.set(logRef, {
            memberId: row.memberId,
            date: sheetData.date,
            activity: row.activity,
            hours: parseFloat(row.hours),
            status: "approved",
            submittedAt: new Date(),
            sourceSheetId: sheetData.sheetId,
            applyToNextYear: false
          });
        }
        createCount++;
      }
    });

    await batch.commit();
    alert(`Success! Created ${createCount} new entries and updated ${updateCount} existing entries.`);
    handleCancel();
    setLoading(false);
  };

  return (
    <div className="p-6 bg-white rounded shadow mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 text-gray-800">
        {resumeSheet ? `Resuming Entry for Sheet ${sheetData.sheetId}` : "Bulk Entry Tool (Handwritten Sheets)"}
      </h2>

      {step === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* LEFT SIDE: PREVIEW */}
          <div className="border-2 border-dashed border-gray-300 rounded p-8 text-center bg-gray-50 flex flex-col items-center justify-center">
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="max-h-64 border shadow" />
            ) : (
              <div className="text-gray-400">No image selected</div>
            )}

            {/* Hide file input if success, so they don't change it by accident */}
            {!uploadSuccess && (
              <input type="file" onChange={handleFileSelect} className="mt-4" accept="image/*" capture="environment" />
            )}
          </div>

          {/* RIGHT SIDE: FORM OR SUCCESS MESSAGE */}
          <div className="space-y-4">
            {uploadSuccess ? (
              // --- SUCCESS VIEW ---
              <div className="bg-green-50 border border-green-200 rounded p-6 text-center">
                <div className="text-4xl mb-2">✅</div>
                <h3 className="text-xl font-bold text-green-800 mb-2">Sheet Uploaded!</h3>
                <p className="text-green-700 mb-6">
                  Reference ID: <span className="font-mono font-black">{sheetData.sheetId}</span>
                </p>

                <div className="space-y-3">
                  <button
                    onClick={() => setStep(2)}
                    className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700"
                  >
                    Continue to Data Entry
                  </button>
                  <button
                    onClick={resetUpload}
                    className="w-full bg-white text-gray-700 border border-gray-300 py-3 rounded font-bold hover:bg-gray-50"
                  >
                    Upload Another Sheet
                  </button>
                </div>
              </div>
            ) : (
              // --- UPLOAD FORM VIEW ---
              <>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase">Sheet Date</label>
                  <input type="date" className="w-full p-2 border rounded"
                    value={sheetData.date}
                    onChange={e => setSheetData({ ...sheetData, date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase">Default Activity Name</label>
                  <input type="text" placeholder="e.g. Agility Trial Set Up" className="w-full p-2 border rounded"
                    value={sheetData.event}
                    onChange={e => setSheetData({ ...sheetData, event: e.target.value })} />
                </div>

                {sheetData.sheetId && (
                  <div className="bg-yellow-50 p-4 border border-yellow-200 rounded text-center">
                    <p className="text-sm text-yellow-800 font-bold">Write this ID on the paper sheet:</p>
                    <p className="text-4xl font-mono font-black text-gray-800 mt-2">{sheetData.sheetId}</p>
                  </div>
                )}

                <button
                  onClick={handleStartEntry}
                  disabled={!file || loading}
                  className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "Uploading..." : "Upload Sheet"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: DATA ENTRY (LANDSCAPE MODE) */}
      {step === 2 && (
        <div className="flex flex-col gap-6">

          {/* Top Pane: Image Reference (Landscape) */}
          <div className="w-full h-[400px] bg-gray-900 rounded flex items-center justify-center overflow-hidden relative group shrink-0">
            <img
              src={previewUrl}
              alt="Sheet"
              className="w-full h-full object-contain"
            />
            <div className="absolute bottom-4 right-4 flex gap-2">
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="bg-white px-3 py-1 rounded text-xs font-bold shadow hover:bg-gray-100"
              >
                Open Full Size
              </a>
            </div>
          </div>

          {/* Bottom Pane: Grid */}
          <div className="w-full flex flex-col bg-white border rounded p-4 shadow-sm">
            <h3 className="font-bold text-gray-700 mb-2">Log Entries</h3>

            {/* Scrollable Table Area */}
            <div className="max-h-[500px] overflow-y-auto border rounded">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="p-2">Member</th>
                    <th className="p-2 w-24">Hours</th>
                    <th className="p-2">Activity</th>
                    <th className="p-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className={`border-b ${row.isExisting ? 'bg-gray-50' : ''}`}>
                      <td className="p-2 relative">
                        <MemberSearchInput
                          members={members}
                          value={row.memberId}
                          onChange={(newId) => updateRow(i, 'memberId', newId)}
                          disabled={row.isExisting}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          className="w-full p-2 border rounded"
                          value={row.hours}
                          onChange={e => updateRow(i, 'hours', e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          className="w-full p-2 border rounded"
                          value={row.activity}
                          onChange={e => updateRow(i, 'activity', e.target.value)}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => removeRow(i)}
                          className="text-red-500 hover:text-red-700 font-bold text-lg px-2"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={addRow}
              className="mt-2 text-blue-600 text-sm font-bold hover:underline self-start"
            >
              + Add Row
            </button>

            <div className="pt-4 border-t mt-4 flex justify-between items-center">
              <button onClick={handleCancel} className="text-gray-500 px-4 py-2 hover:bg-gray-100 rounded">
                Cancel
              </button>
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-1 mr-1">
                  {rows.filter(r => r.memberId && r.hours).length} valid entries
                </p>
                <button
                  onClick={handleSubmitAll}
                  disabled={loading}
                  className="bg-green-600 text-white px-8 py-3 rounded font-bold hover:bg-green-700 shadow"
                >
                  {loading ? "Saving..." : `Submit Changes`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- HELPER COMPONENT: SEARCHABLE DROPDOWN ---
const MemberSearchInput = ({ members, value, onChange, disabled }) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // If a value is passed in (e.g. from existing data), display the name
  useEffect(() => {
    const selected = members.find(m => m.id === value);
    if (selected) {
      setQuery(selected.name);
    } else if (!value) {
      setQuery("");
    }
  }, [value, members]);

  // Filter the list based on what the user types
  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="relative">
      <input
        type="text"
        className={`w-full p-2 border rounded ${disabled ? 'bg-gray-100 text-gray-500' : 'bg-white'}`}
        placeholder={disabled ? "" : "Type to search..."}
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          // If they clear the box, clear the selection
          if (e.target.value === "") onChange("");
        }}
        onFocus={() => setIsOpen(true)}
        // Delay closing so the "Click" event on the list can fire first
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
      />

      {/* Dropdown List */}
      {isOpen && !disabled && filteredMembers.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto mt-1">
          {filteredMembers.map(m => (
            <li
              key={m.id}
              className="p-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100 last:border-0"
              onClick={() => {
                setQuery(m.name);
                onChange(m.id); // Send ID back to parent
                setIsOpen(false);
              }}
            >
              {m.name}
            </li>
          ))}
        </ul>
      )}

      {/* No results state */}
      {isOpen && !disabled && query && filteredMembers.length === 0 && (
        <div className="absolute z-50 w-full bg-white border border-gray-300 rounded shadow p-2 text-xs text-gray-500 mt-1">
          No matches found
        </div>
      )}
    </div>
  );
};