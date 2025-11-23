import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs, doc, deleteDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db, auth } from '../firebase';
import { calculateRewards } from '../utils';

export default function VolunteerLogs({ user, currentUserRole }) {
  const [logs, setLogs] = useState([]);
  const [date, setDate] = useState('');
  const [hours, setHours] = useState('');
  const [activity, setActivity] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sheetPreview, setSheetPreview] = useState(null);
  
  // History Viewer State
  const [viewingHistory, setViewingHistory] = useState(null);

  // --- HELPERS: DATE FORMATTING ---
  // Convert "10/24/2025" -> "2025-10-24" for inputs
  const toInputDate = (str) => {
    if (!str) return '';
    if (str.includes('/')) {
      const [m, d, y] = str.split('/');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return str;
  };

  // Convert "2025-10-24" -> "10/24/2025" for display
  const toDisplayDate = (str) => {
    if (!str) return '';
    if (str.includes('-')) {
      const [y, m, d] = str.split('-');
      return `${m}/${d}/${y}`;
    }
    return str;
  };

  const handleViewSheet = async (sheetId) => {
    try {
      // Query the volunteer_sheets collection for this specific visual ID (e.g. #4021)
      const q = query(collection(db, "volunteer_sheets"), where("sheetId", "==", sheetId));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        setSheetPreview(snap.docs[0].data());
      } else {
        alert("Original sheet record not found (it may have been deleted).");
      }
    } catch (err) {
      console.error(err);
      alert("Error fetching sheet: " + err.message);
    }
  };

  // --- DB REFS ---
  const getCollectionRef = () => {
    if (user.type === 'legacy') {
      return collection(db, "legacy_members", user.realId, "legacyLogs");
    } else {
      return collection(db, "logs");
    }
  };

  const getDocRef = (logId) => {
    if (user.type === 'legacy') {
      return doc(db, "legacy_members", user.realId, "legacyLogs", logId);
    } else {
      return doc(db, "logs", logId);
    }
  };

  const fetchLogs = async () => {
    if (!user) return;
    setLoading(true);
    setLogs([]);

    try {
      let data = [];
      if (user.type === 'legacy') {
        const snap = await getDocs(getCollectionRef());
        data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } else {
        const q = query(collection(db, "logs"), where("memberId", "==", user.uid));
        const snap = await getDocs(q);
        data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
      
      // Sort by date descending
      data.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setLogs(data);
    } catch (err) {
      console.error("Error fetching logs:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [user]);

  const toggleRollover = async (log) => {
    try {
      const newVal = !log.applyToNextYear;
      await updateDoc(getDocRef(log.id), {
        applyToNextYear: newVal
      });
      // Optimistic UI update
      setLogs(prev => prev.map(l => l.id === log.id ? { ...l, applyToNextYear: newVal } : l));
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date || !hours || !activity) return;
    
    const numHours = parseFloat(hours);
    let status = "approved"; // Default to approved

    // --- SAFETY CHECK: DAILY TOTAL ---
    // 1. Sum existing logs for this date (excluding the one being edited)
    const existingLogsForDate = logs.filter(l => 
      (l.date === date || toInputDate(l.date) === date) && l.id !== editingId
    );

    const dailySum = existingLogsForDate.reduce((sum, l) => sum + (parseFloat(l.hours) || 0), 0);
    const newDailyTotal = dailySum + numHours;

    // 2. If Total > 8, Flag it. 
    // (If Total <= 8, we skip this, so status stays "approved")
    if (newDailyTotal > 8) {
      const confirm = window.confirm(
        `Total hours for ${date} will be ${newDailyTotal} hours.\n(Existing: ${dailySum} + New: ${numHours})\n\nThis exceeds the 8-hour daily standard. Is this correct?`
      );
      if (!confirm) return;
      status = "pending"; 
    }

    try {
      if (editingId) {
         // --- EDIT MODE ---
         const logRef = getDocRef(editingId);
         // Admin edits are always approved; Members are subject to the check above
         const newStatus = currentUserRole === 'admin' ? 'approved' : status;
         
         // Snapshot for History
         const originalLog = logs.find(l => l.id === editingId);
         const historyEntry = {
            changedAt: new Date().toISOString(),
            changedBy: auth.currentUser.email,
            oldData: {
               date: originalLog.date,
               hours: originalLog.hours,
               activity: originalLog.activity
            }
         };

         await updateDoc(logRef, {
           date, 
           hours: numHours, 
           activity, 
           status: newStatus,
           history: arrayUnion(historyEntry)
         });
         setEditingId(null);
      } else {
         // --- CREATE MODE ---
         const finalStatus = currentUserRole === 'admin' ? 'approved' : status;

         const newLog = {
           date,
           hours: numHours,
           activity,
           status: finalStatus,
           submittedAt: new Date(),
           applyToNextYear: false,
           history: []
         };
         
         if (user.type !== 'legacy') {
           newLog.memberId = user.uid;
         }

         await addDoc(getCollectionRef(), newLog);
      }
      
      setDate(''); setHours(''); setActivity('');
      fetchLogs(); 
    } catch (err) {
      console.error("Error saving log:", err);
      alert("Failed to save log");
    }
  };

  const handleEdit = (log) => {
    setDate(toInputDate(log.date)); // Fix date picker format
    setHours(log.hours);
    setActivity(log.activity);
    setEditingId(log.id);
  };

  const handleDelete = async (id) => {
    if(window.confirm("Are you sure you want to delete this entry?")) {
      await deleteDoc(getDocRef(id));
      fetchLogs();
    }
  };

// Pass the user's membership type
const stats = calculateRewards(logs, user.membershipType);


  return (
    <div className="mt-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-indigo-600 text-white p-4 rounded shadow">
          <h4 className="text-indigo-200 text-xs font-bold uppercase">{stats.year} Fiscal Hours</h4>
          <p className="text-3xl font-bold">{stats.totalHours}</p>
          <p className="text-xs opacity-75 mt-1">(Oct 1 - Sep 30)</p>
        </div>
        <div className="bg-white p-4 rounded shadow border-l-4 border-green-500">
          <h4 className="text-gray-500 text-xs font-bold uppercase">Vouchers Earned</h4>
          <p className="text-3xl font-bold text-gray-800">{stats.vouchers}</p>
        </div>
        <div className="bg-white p-4 rounded shadow border-l-4 border-blue-500">
          <h4 className="text-gray-500 text-xs font-bold uppercase">Membership Status</h4>
          <p className="text-xl font-bold text-gray-800 mt-1">{stats.membershipStatus}</p>
        </div>
      </div>

      <h3 className="text-xl font-bold mb-4 text-gray-800">
         {editingId ? "Edit Entry" : "Log New Hours"}
      </h3>
      
      {/* Form */}
      <form onSubmit={handleSubmit} className={`p-4 rounded mb-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end ${editingId ? 'bg-yellow-50 border border-yellow-400' : 'bg-gray-100'}`}>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-gray-600 mb-1">Activity</label>
          <input type="text" value={activity} onChange={e => setActivity(e.target.value)} className="w-full p-2 border rounded" />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">Hours</label>
          <div className="flex gap-2">
            <input type="number" step="0.25" value={hours} onChange={e => setHours(e.target.value)} className="w-full p-2 border rounded" />
            <button type="submit" className={`${editingId ? 'bg-yellow-600' : 'bg-green-600'} text-white px-4 py-2 rounded hover:opacity-90`}>
              {editingId ? "Update" : "Add"}
            </button>
          </div>
        </div>
        {editingId && (
          <div className="col-span-4 text-right">
            <button type="button" onClick={() => { setEditingId(null); setDate(''); setHours(''); setActivity(''); }} className="text-sm text-gray-500 underline">Cancel Edit</button>
          </div>
        )}
      </form>

      {/* Table with Mobile Scroll & History & Formatted Dates */}
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full text-left min-w-[600px]">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-3 text-sm font-semibold text-gray-700">Date</th>
              <th className="p-3 text-sm font-semibold text-gray-700">Activity</th>
              <th className="p-3 text-sm font-semibold text-gray-700 text-right">Hours</th>
              <th className="p-3 text-sm font-semibold text-gray-700">Status</th>
              {currentUserRole === 'admin' && <th className="p-3 text-sm font-semibold text-gray-700 text-center">Roll Over</th>}
              <th className="p-3 text-sm font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="p-4 text-center text-gray-500">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan="6" className="p-4 text-center text-gray-500">No hours logged yet.</td></tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} className={`border-t hover:bg-gray-50 ${log.applyToNextYear ? 'bg-purple-50' : ''}`}>
                   <td className="p-3">{toDisplayDate(log.date)}</td>
                   <td className="p-3">{log.activity}</td>
                   <td className="p-3 text-right font-mono">{log.hours}</td>
                   <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${log.status === 'pending' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                      {log.status || 'approved'}
                    </span>
                   </td>
                   
                   {currentUserRole === 'admin' && (
                    <td className="p-3 text-center">
                      <input 
                        type="checkbox" 
                        checked={log.applyToNextYear || false} 
                        onChange={() => toggleRollover(log)}
                        className="cursor-pointer w-4 h-4"
                      />
                    </td>
                   )}

                   <td className="p-3 text-sm whitespace-nowrap flex items-center">
                    <button onClick={() => handleEdit(log)} className="text-blue-600 hover:underline mr-3">Edit</button>
                    <button onClick={() => handleDelete(log.id)} className="text-red-600 hover:underline mr-3">Delete</button>
                    {/* NEW: SHEET BUTTON (Admin Only) */}
                    {currentUserRole === 'admin' && log.sourceSheetId && (
                      <button 
                        onClick={() => handleViewSheet(log.sourceSheetId)}
                        className="text-purple-600 hover:text-purple-800 text-xs border border-purple-200 px-2 py-1 rounded bg-purple-50 mr-2"
                        title={`View Source Sheet ${log.sourceSheetId}`}
                      >
                        📄 {log.sourceSheetId}
                      </button>
                    )}
                    {log.history && log.history.length > 0 && (
                      <button 
                        onClick={() => setViewingHistory(log)} 
                        className="text-gray-500 hover:text-gray-700 text-xs border border-gray-300 px-2 py-1 rounded bg-gray-50"
                        title="View Edit History"
                      >
                        🕒 History
                      </button>
                    )}
                   </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* History Modal */}
      {viewingHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-full max-w-md">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="font-bold text-lg">Edit History</h3>
              <button onClick={() => setViewingHistory(null)} className="text-gray-500 hover:text-gray-800">✕</button>
            </div>
            
            <div className="max-h-[300px] overflow-y-auto space-y-4">
              {viewingHistory.history.slice().reverse().map((entry, i) => (
                <div key={i} className="text-sm border-l-2 border-gray-300 pl-3">
                  <p className="text-gray-500 text-xs">
                    {new Date(entry.changedAt).toLocaleString()} by <span className="font-semibold">{entry.changedBy}</span>
                  </p>
                  <div className="mt-1 text-gray-700 bg-gray-50 p-2 rounded">
                    <p className="font-bold text-xs uppercase text-gray-400 mb-1">Previous Version:</p>
                    <p>Date: {entry.oldData.date}</p>
                    <p>Activity: {entry.oldData.activity}</p>
                    <p>Hours: {entry.oldData.hours}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-right">
              <button onClick={() => setViewingHistory(null)} className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300">Close</button>
            </div>
          </div>
        </div>
      )}


      {/* SHEET PREVIEW MODAL */}
      {sheetPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded shadow-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-lg">Source Sheet: <span className="font-mono text-purple-700">{sheetPreview.sheetId}</span></h3>
              <button onClick={() => setSheetPreview(null)} className="text-gray-500 hover:text-red-600 text-2xl font-bold">×</button>
            </div>
            
            <div className="flex-1 bg-gray-100 overflow-auto p-4 flex justify-center">
               <img 
                 src={sheetPreview.imageUrl} 
                 alt="Original Sheet" 
                 className="max-w-full object-contain shadow border" 
               />
            </div>
            
            <div className="p-4 border-t text-right bg-gray-50">
               <a 
                 href={sheetPreview.imageUrl} 
                 target="_blank" 
                 rel="noreferrer"
                 className="text-blue-600 hover:underline text-sm font-bold"
               >
                 Open Full Size in New Tab
               </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}