import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, deleteDoc, doc, where, writeBatch, collectionGroup } from "firebase/firestore"; // <--- Added collectionGroup
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from '../firebase';

export default function SheetArchive() {
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

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

      // 1. Find Logs in Main Collection (Active Members)
      if (sheet.sheetId) {
        const logsQ = query(collection(db, "logs"), where("sourceSheetId", "==", sheet.sheetId));
        const logsSnap = await getDocs(logsQ);
        logsSnap.forEach(doc => {
          batch.delete(doc.ref);
        });

        // 2. Find Logs in Legacy Subcollections (Collection Group Query)
        // This searches ALL 'legacyLogs' collections at once
        const legacyQ = query(collectionGroup(db, "legacyLogs"), where("sourceSheetId", "==", sheet.sheetId));
        const legacySnap = await getDocs(legacyQ);
        legacySnap.forEach(doc => {
          batch.delete(doc.ref);
        });

        console.log(`Queued ${logsSnap.size} active logs and ${legacySnap.size} legacy logs for deletion.`);
      }

      // 3. Delete the Sheet Document itself
      const sheetRef = doc(db, "volunteer_sheets", sheet.id);
      batch.delete(sheetRef);

      // Commit Database Changes
      await batch.commit();

      // 4. Delete the Image from Storage
      if (sheet.imageUrl) {
        try {
          const fileRef = ref(storage, sheet.imageUrl);
          await deleteObject(fileRef);
        } catch (storageErr) {
          console.warn("Could not delete image file (might already be gone):", storageErr);
        }
      }

      // Update UI
      setSheets(prev => prev.filter(s => s.id !== sheet.id));
      alert("Sheet and associated log entries deleted.");

    } catch (err) {
      console.error(err);
      // Catch the Index Error specifically to help you
      if (err.message.includes("requires an index")) {
        alert("System Notice: Firebase requires a one-time index creation for this 'Deep Delete' to work.\n\nPlease check the browser console (F12) for the link to create it.");
      } else {
        alert("Error deleting: " + err.message);
      }
    }
    setDeletingId(null);
  }

  if (loading) return <div className="p-4 text-gray-500">Loading archive...</div>;

  return (
    <div className="mt-4">
      <h3 className="text-xl font-bold mb-4 text-gray-800">📂 Sheet Archive</h3>
      
      {sheets.length === 0 ? (
        <p className="text-gray-500 italic">No physical sheets uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sheets.map(sheet => (
            <div key={sheet.id} className="border border-gray-200 rounded bg-white shadow-sm flex flex-col p-4 relative">
              
              <div className="flex justify-between items-start mb-2">
                <span className="bg-yellow-100 text-yellow-800 text-lg font-mono font-bold px-2 py-1 rounded border border-yellow-200">
                  {sheet.sheetId || "N/A"}
                </span>
              </div>

              <p className="font-bold text-gray-800 text-sm truncate">{sheet.event || "Unnamed Event"}</p>
              <p className="text-xs text-gray-500 mb-4">{sheet.date}</p>
              
              <div className="flex gap-2 mt-auto">
                <a 
                  href={sheet.imageUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="flex-1 text-center bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold py-2 rounded border border-blue-200"
                >
                  View Sheet
                </a>
                
                <button 
                  onClick={() => handleFullDelete(sheet)} 
                  disabled={deletingId === sheet.id}
                  className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold py-2 rounded border border-red-200"
                >
                  {deletingId === sheet.id ? "Deleting..." : "Delete All"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}