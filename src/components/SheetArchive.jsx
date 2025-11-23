import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, deleteDoc, doc, where, writeBatch, collectionGroup, updateDoc } from "firebase/firestore"; 
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from '../firebase';

export default function SheetArchive({ onResume }) {
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  // --- FILTER STATE ---
  const [searchTerm, setSearchTerm] = useState("");
  const [showCompleted, setShowCompleted] = useState(false); // Default to hiding finished sheets
  const [displayLimit, setDisplayLimit] = useState(12);

  useEffect(() => {
    const fetchSheets = async () => {
      try {
        const q = query(collection(db, "volunteer_sheets"), orderBy("date", "desc"));
        const snap = await getDocs(q);
        setSheets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching sheets:", err);
      }
      setLoading(false);
    };
    fetchSheets();
  }, []);

  const handleFullDelete = async (sheet) => {
    if(!window.confirm(`WARNING: This will delete the sheet record AND remove all hours logged using this sheet ID (${sheet.sheetId}).\n\nAre you sure?`)) return;
    
    setDeletingId(sheet.id);
    try {
      const batch = writeBatch(db);

      if (sheet.sheetId) {
        const logsQ = query(collection(db, "logs"), where("sourceSheetId", "==", sheet.sheetId));
        const logsSnap = await getDocs(logsQ);
        logsSnap.forEach(doc => batch.delete(doc.ref));

        const legacyQ = query(collectionGroup(db, "legacyLogs"), where("sourceSheetId", "==", sheet.sheetId));
        const legacySnap = await getDocs(legacyQ);
        legacySnap.forEach(doc => batch.delete(doc.ref));
      }

      const sheetRef = doc(db, "volunteer_sheets", sheet.id);
      batch.delete(sheetRef);
      await batch.commit();

      if (sheet.imageUrl) {
        try {
          const fileRef = ref(storage, sheet.imageUrl);
          await deleteObject(fileRef);
        } catch (storageErr) {
          console.warn("Could not delete image file:", storageErr);
        }
      }

      setSheets(prev => prev.filter(s => s.id !== sheet.id));
      alert("Sheet and associated log entries deleted.");

    } catch (err) {
      console.error(err);
      if (err.message.includes("requires an index")) {
        alert("System Notice: Firebase requires a one-time index creation. Check console.");
      } else {
        alert("Error deleting: " + err.message);
      }
    }
    setDeletingId(null);
  }

  // --- NEW: TOGGLE 'DONE' STATUS ---
  const toggleComplete = async (sheet) => {
    const newStatus = sheet.status === 'done' ? 'processing' : 'done';
    
    // Optimistic Update (update UI instantly)
    setSheets(prev => prev.map(s => s.id === sheet.id ? { ...s, status: newStatus } : s));

    try {
      await updateDoc(doc(db, "volunteer_sheets", sheet.id), { status: newStatus });
    } catch (err) {
      console.error("Error updating status:", err);
      alert("Failed to save status.");
    }
  };

  // --- FILTERING LOGIC ---
  const filteredSheets = sheets.filter(sheet => {
    // 1. Check Search Term (ID or Event Name)
    const search = searchTerm.toLowerCase();
    const matchId = (sheet.sheetId || "").toLowerCase().includes(search);
    const matchEvent = (sheet.event || "").toLowerCase().includes(search);
    const matchesSearch = matchId || matchEvent;

    // 2. Check Completed Status
    // If showCompleted is true, show everything. 
    // If false, only show items that are NOT 'done'.
    const isHidden = !showCompleted && sheet.status === 'done';

    return matchesSearch && !isHidden;
  });

  // --- PAGINATION LOGIC ---
  const visibleSheets = filteredSheets.slice(0, displayLimit);

  if (loading) return <div className="p-4 text-gray-500">Loading archive...</div>;

  return (
    <div className="mt-4">
      <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
        <div>
           <h3 className="text-xl font-bold text-gray-800">📂 Sheet Archive</h3>
           <p className="text-xs text-gray-500">Manage uploaded logs and resume data entry.</p>
        </div>

        {/* SEARCH BAR & TOGGLES */}
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer bg-gray-50 px-3 py-2 rounded border">
            <input 
              type="checkbox" 
              checked={showCompleted} 
              onChange={e => setShowCompleted(e.target.checked)}
            />
            Show Completed
          </label>
          <input 
            type="text" 
            placeholder="Search ID (#4021) or Event..." 
            className="border rounded p-2 text-sm w-full md:w-64"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      {visibleSheets.length === 0 ? (
        <p className="text-gray-500 italic p-8 text-center bg-gray-50 rounded border border-dashed">
          No sheets found matching your filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleSheets.map(sheet => {
            const isDone = sheet.status === 'done';
            
            return (
              <div key={sheet.id} className={`border rounded shadow-sm flex flex-col p-4 relative transition-opacity ${isDone ? 'bg-gray-50 border-gray-200 opacity-75' : 'bg-white border-gray-300'}`}>
                
                {/* Header */}
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-lg font-mono font-bold px-2 py-1 rounded border ${isDone ? 'bg-gray-200 text-gray-500 border-gray-300' : 'bg-yellow-100 text-yellow-800 border-yellow-200'}`}>
                    {sheet.sheetId || "N/A"}
                  </span>
                  
                  {/* Mark as Done Checkbox */}
                  <label className="flex items-center gap-1 cursor-pointer text-xs font-bold text-gray-500 hover:text-green-600">
                    <input 
                      type="checkbox" 
                      checked={isDone} 
                      onChange={() => toggleComplete(sheet)}
                      className="cursor-pointer"
                    />
                    {isDone ? "Done" : "Mark Done"}
                  </label>
                </div>

                <p className="font-bold text-gray-800 text-sm truncate">{sheet.event || "Unnamed Event"}</p>
                <p className="text-xs text-gray-500 mb-4">{sheet.date}</p>
                
                {/* Action Buttons */}
                <div className="flex gap-2 mt-auto">
                  <a 
                    href={sheet.imageUrl} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex-1 text-center bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-bold py-2 rounded border border-gray-300"
                  >
                    View
                  </a>

                  {!isDone && (
                    <button 
                      onClick={() => onResume(sheet)} 
                      className="flex-1 bg-green-50 text-green-600 hover:bg-green-100 text-xs font-bold py-2 rounded border border-green-200"
                    >
                      Resume
                    </button>
                  )}
                  
                  <button 
                    onClick={() => handleFullDelete(sheet)} 
                    disabled={deletingId === sheet.id}
                    className="flex-1 bg-white text-red-400 hover:text-red-600 hover:bg-red-50 text-xs font-bold py-2 rounded border border-gray-200 hover:border-red-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load More Button */}
      {filteredSheets.length > displayLimit && (
        <div className="mt-6 text-center">
          <button 
            onClick={() => setDisplayLimit(prev => prev + 12)}
            className="text-blue-600 font-bold hover:underline"
          >
            Show More ({filteredSheets.length - displayLimit} remaining)
          </button>
        </div>
      )}
    </div>
  );
}