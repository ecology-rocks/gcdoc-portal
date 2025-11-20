import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from '../firebase';
import { calculateRewards } from '../utils'; // Import helper

export default function VolunteerLogs({ user, currentUserRole }) {
  const [logs, setLogs] = useState([]);
  const [date, setDate] = useState('');
  const [hours, setHours] = useState('');
  const [activity, setActivity] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);

  // ... (Previous getCollectionRef and getDocRef helper functions stay here) ...
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

  // --- NEW FUNCTION: TOGGLE ROLLOVER ---
  const toggleRollover = async (log) => {
    try {
      const newVal = !log.applyToNextYear;
      await updateDoc(getDocRef(log.id), {
        applyToNextYear: newVal
      });
      // Optimistic UI update (update state immediately so it feels fast)
      setLogs(prev => prev.map(l => l.id === log.id ? { ...l, applyToNextYear: newVal } : l));
    } catch (err) {
      console.error("Error updating rollover:", err);
      alert("Failed to update rollover status");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date || !hours || !activity) return;
    
    const numHours = parseFloat(hours);
    let status = "approved";

    if (numHours > 8) {
      const confirm = window.confirm("You are logging more than 8 hours for a single day. Is this correct?");
      if (!confirm) return;
      status = "pending"; 
    }

    try {
      if (editingId) {
         const newStatus = currentUserRole === 'admin' ? 'approved' : 'pending';
         await updateDoc(getDocRef(editingId), {
           date, hours: numHours, activity, status: newStatus
         });
         setEditingId(null);
      } else {
         const newLog = {
           date,
           hours: numHours,
           activity,
           status,
           submittedAt: new Date(),
           applyToNextYear: false // Default to false
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
    setDate(log.date);
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

  const stats = calculateRewards(logs);

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
      
      {/* Form (unchanged) */}
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

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full text-left min-w-[600px]">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-3 text-sm font-semibold text-gray-700">Date</th>
              <th className="p-3 text-sm font-semibold text-gray-700">Activity</th>
              <th className="p-3 text-sm font-semibold text-gray-700 text-right">Hours</th>
              <th className="p-3 text-sm font-semibold text-gray-700">Status</th>
              {/* New Header for Admins */}
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
                  <td className="p-3">{log.date}</td>
                  <td className="p-3">{log.activity}</td>
                  <td className="p-3 text-right font-mono">{log.hours}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${log.status === 'pending' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                      {log.status || 'approved'}
                    </span>
                  </td>
                  
                  {/* Admin Toggle Checkbox */}
                  {currentUserRole === 'admin' && (
                    <td className="p-3 text-center">
                      <input 
                        type="checkbox" 
                        checked={log.applyToNextYear || false} 
                        onChange={() => toggleRollover(log)}
                        title="Apply this log to next Fiscal Year"
                        className="cursor-pointer w-4 h-4"
                      />
                    </td>
                  )}

                  <td className="p-3 text-sm">
                    <button onClick={() => handleEdit(log)} className="text-blue-600 hover:underline mr-3">Edit</button>
                    <button onClick={() => handleDelete(log.id)} className="text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
