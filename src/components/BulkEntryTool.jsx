import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, writeBatch, doc, query, orderBy, limit } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from '../firebase';

export default function BulkEntryTool() {
  const [step, setStep] = useState(1); // 1 = Upload, 2 = Data Entry
  const [loading, setLoading] = useState(false);
  
  // Sheet Data
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [sheetData, setSheetData] = useState({ date: '', event: '', sheetId: '' });
  
  // Entry Data
  const [members, setMembers] = useState([]);
  const [rows, setRows] = useState([{ memberId: '', hours: '', activity: '' }]);
  
useEffect(() => {
    const fetchMembers = async () => {
      setLoading(true);
      const allMembers = [];

      // 1. Fetch Active Members
      const activeSnap = await getDocs(collection(db, "members"));
      activeSnap.forEach(d => {
        allMembers.push({
          id: d.id,
          name: `${d.data().lastName}, ${d.data().firstName}`,
          type: 'active' // Mark as active
        });
      });

      // 2. Fetch Legacy Members
      const legacySnap = await getDocs(collection(db, "legacy_members"));
      legacySnap.forEach(d => {
        // Only add if they have a name (skip empties)
        if (d.data().lastName) {
          allMembers.push({
            id: d.id,
            name: `${d.data().lastName}, ${d.data().firstName} (Legacy)`,
            type: 'legacy' // Mark as legacy
          });
        }
      });

      // 3. Sort Alphabetically
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
      // Generate a random 4-digit ID for the physical paper
      const shortId = Math.floor(1000 + Math.random() * 9000);
      setSheetData(prev => ({ ...prev, sheetId: `#${shortId}` }));
    }
  };

  const handleStartEntry = async () => {
    if (!file || !sheetData.date) return alert("Please select a file and date.");
    setLoading(true);
    
    try {
      // 1. Upload Image
      const storageRef = ref(storage, `sheets/${sheetData.date}_${sheetData.sheetId}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      // 2. Create Sheet Record
      await addDoc(collection(db, "volunteer_sheets"), {
        ...sheetData,
        imageUrl: url,
        uploadedAt: new Date(),
        status: 'processing'
      });

      setSheetData(prev => ({ ...prev, imageUrl: url }));
      setStep(2); // Move to grid view
    } catch (err) {
      console.error(err);
      alert("Error uploading sheet: " + err.message);
    }
    setLoading(false);
  };

  // --- GRID LOGIC ---
  const updateRow = (index, field, value) => {
    const newRows = [...rows];
    newRows[index][field] = value;
    setRows(newRows);
  };

  const addRow = () => {
    setRows([...rows, { memberId: '', hours: '', activity: sheetData.event || '' }]); // Auto-fill activity
  };

  const removeRow = (index) => {
    setRows(rows.filter((_, i) => i !== index));
  };

const handleSubmitAll = async () => {
    if (!window.confirm(`Ready to submit ${rows.length} entries?`)) return;
    setLoading(true);
    
    const batch = writeBatch(db);
    
    rows.forEach(row => {
      if (!row.memberId || !row.hours) return; // Skip incomplete
      
      // Find the member info to know if they are Active or Legacy
      const memberInfo = members.find(m => m.id === row.memberId);
      if (!memberInfo) return;

      let logRef;

      if (memberInfo.type === 'legacy') {
        // ROUTE 1: Legacy Member -> Subcollection
        // db/legacy_members/{id}/legacyLogs/{newLogID}
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
        // ROUTE 2: Active Member -> Main Collection
        // db/logs/{newLogID}
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
    });

    await batch.commit();
    alert("Success! All entries logged.");
    
    // Reset Form
    setStep(1);
    setFile(null);
    setPreviewUrl(null);
    setRows([{ memberId: '', hours: '', activity: '' }]);
    setLoading(false);
  };

  return (
    <div className="p-6 bg-white rounded shadow mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 text-gray-800">Bulk Entry Tool (Handwritten Sheets)</h2>

      {/* STEP 1: UPLOAD */}
      {step === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="border-2 border-dashed border-gray-300 rounded p-8 text-center bg-gray-50">
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="max-h-64 mx-auto border shadow" />
            ) : (
              <div className="text-gray-400">No image selected</div>
            )}
            <input type="file" onChange={handleFileSelect} className="mt-4" accept="image/*" />
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase">Sheet Date</label>
              <input type="date" className="w-full p-2 border rounded" 
                onChange={e => setSheetData({...sheetData, date: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase">Default Activity Name</label>
              <input type="text" placeholder="e.g. Agility Trial Set Up" className="w-full p-2 border rounded"
                onChange={e => setSheetData({...sheetData, event: e.target.value})} />
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
              {loading ? "Uploading..." : "Start Data Entry →"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: DATA ENTRY */}
      {step === 2 && (
        <div className="flex flex-col md:flex-row gap-6 h-[600px]">
          {/* Left Pane: Image Reference */}
          <div className="w-full md:w-1/3 bg-gray-900 rounded flex items-center justify-center overflow-hidden relative group">
             <img src={sheetData.imageUrl} alt="Sheet" className="max-w-full max-h-full object-contain" />
             <a href={sheetData.imageUrl} target="_blank" rel="noreferrer" className="absolute bottom-4 right-4 bg-white px-3 py-1 rounded text-xs font-bold shadow">Open Full Size</a>
          </div>

          {/* Right Pane: Grid */}
          <div className="w-full md:w-2/3 flex flex-col">
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="p-2">Member</th>
                    <th className="p-2 w-20">Hours</th>
                    <th className="p-2">Activity</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">
                        <select 
                          className="w-full p-1 border rounded bg-white"
                          value={row.memberId}
                          onChange={e => updateRow(i, 'memberId', e.target.value)}
                        >
                          <option value="">Select Member...</option>
                          {members.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input type="number" className="w-full p-1 border rounded" 
                          value={row.hours} onChange={e => updateRow(i, 'hours', e.target.value)} />
                      </td>
                      <td className="p-2">
                        <input type="text" className="w-full p-1 border rounded" 
                          value={row.activity} onChange={e => updateRow(i, 'activity', e.target.value)} />
                      </td>
                      <td className="p-2 text-center">
                        <button onClick={() => removeRow(i)} className="text-red-500 hover:text-red-700">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addRow} className="mt-2 text-blue-600 text-sm font-bold hover:underline">+ Add Row</button>
            </div>

            <div className="pt-4 border-t mt-4 flex justify-between">
               <button onClick={() => setStep(1)} className="text-gray-500">Cancel</button>
               <button onClick={handleSubmitAll} disabled={loading} className="bg-green-600 text-white px-6 py-2 rounded font-bold hover:bg-green-700">
                 {loading ? "Saving..." : `Submit ${rows.length} Entries`}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}