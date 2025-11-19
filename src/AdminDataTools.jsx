import React, { useState } from 'react';
import Papa from 'papaparse';
import { getFirestore, collection, writeBatch, doc, getDocs } from "firebase/firestore";

export default function AdminDataTools() {
  const db = getFirestore();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  // --- CLEAR OLD DATA ---
  const handleClearLegacy = async () => {
    if (!window.confirm("This will DELETE ALL 'legacy_members'. Are you sure?")) return;
    setLoading(true);
    setStatus("Deleting...");
    
    const snapshot = await getDocs(collection(db, "legacy_members"));
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    
    await batch.commit();
    setStatus(`Deleted ${snapshot.size} legacy records.`);
    setLoading(false);
  };

  // --- IMPORT MEMBERS CSV ---
// --- IMPORT MEMBERS CSV (FULL DATA VERSION) ---
  const handleMemberUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setStatus("Parsing CSV...");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;
        setStatus(`Found ${rows.length} members. Uploading full details...`);
        
        const batch = writeBatch(db);
        let count = 0;

        rows.forEach((row) => {
          // 1. Identify Core Identity
          const legacyKey = row['Key'];
          const email = row['e-mail address'];

          if (!legacyKey || !email) return; // Skip bad rows

          const cleanId = email.trim().toLowerCase();
          const docRef = doc(db, "legacy_members", cleanId);
          
          // 2. Map CSV Columns to Clean Database Fields
          const docData = {
             // -- SYSTEM FIELDS --
             legacyKey: parseInt(legacyKey),
             email: email.trim().toLowerCase(),
             importedAt: new Date(),
             
             // -- IDENTITY --
             firstName: row['FirstName'] || '',
             lastName: row['LastName'] || '',
             firstName2: row['FirstName2'] || '', // Grab secondary member if exists
             lastName2: row['LastName2'] || '',
             membershipType: row['Member Type'] || 'Regular',
             isActive: row['Active'] === 'True',

             // -- CONTACT INFO --
             address: row['Address'] || '',
             city: row['City'] || '',
             state: row['St'] || '',
             zip: row['Zip'] ? row['Zip'].toString() : '',
             phone: row['Phone'] || '',
             cellPhone: row['Cell Phone'] || '',
             workPhone: row['WorkPhone'] || '',
             
             // -- EXTRA DETAILS --
             joinedDate: row['Became Member'] || '',
             breeds: row['Breed'] || '',
             occupation: row['Occupation'] || '',
             interests: row['Interests'] || '',
             
             // -- COMMITTEES & ACTIVITIES --
             // Storing these as a map so they are easy to query later
             activities: {
               agility: row['Agility'] === 'True',
               obedience: row['Obedience'] === 'True',
               rally: row['Rally'] === 'True',
               flyball: row['Flyball'] === 'True',
               freestyle: row['Freestyle'] === 'True',
               conformation: row['Conformation'] === 'True',
               earthdog: row['Earthdog'] === 'True',
             },
             
             // -- SAFETY NET: Store the raw row just in case --
             rawImport: row 
          };

          batch.set(docRef, docData);
          count++;
        });

        try {
          await batch.commit();
          setStatus(`Success! Imported ${count} members with full details.`);
        } catch (err) {
          console.error(err);
          setStatus("Error uploading batch. Check console.");
        }
        setLoading(false);
      }
    });
  };

// --- IMPORT WORK CREDITS CSV (FIXED) ---
  const handleCreditsUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setStatus("Parsing Credits CSV...");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;
        setStatus(`Processing ${rows.length} log entries...`);
        
        // 1. Get all legacy members to map Keys -> DocIDs
        const memberSnap = await getDocs(collection(db, "legacy_members"));
        const keyMap = {}; 
        memberSnap.forEach(doc => {
          const data = doc.data();
          // Store keys as simple strings: "43", "2106"
          if (data.legacyKey) keyMap[data.legacyKey.toString()] = doc.id;
        });

        const batch = writeBatch(db);
        let count = 0;
        let skipped = 0;

        // 2. Process rows
        rows.forEach((row) => {
          const rawKey = row['Key']; 
          if (!rawKey) return;

          // FIX: Parse as int to strip ".0", then match
          // "2106.0" becomes 2106, then "2106"
          const memberKey = parseInt(rawKey).toString(); 
          
          const memberDocID = keyMap[memberKey];

          if (memberDocID) {
             const newLogRef = doc(collection(db, "legacy_members", memberDocID, "legacyLogs"));
             batch.set(newLogRef, {
               date: row['When'] || "Unknown Date",
               activity: row['Description'] || "Imported Work Credit",
               hours: parseFloat(row['Hours']) || 0,
               importedAt: new Date()
             });
             count++;
          } else {
            console.warn(`Skipped Key: ${memberKey} (Not found in Members)`);
            skipped++;
          }
        });

        try {
          await batch.commit(); 
          setStatus(`Success! Added ${count} logs. Skipped ${skipped}.`);
        } catch (err) {
          console.error(err);
          setStatus("Error: Batch failed. Check console.");
        }
        setLoading(false);
      }
    });
  };





  return (
    <div className="p-6 border-2 border-dashed border-gray-300 rounded bg-gray-50 my-8">
      <h2 className="text-xl font-bold mb-4">Admin: Data Tools</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* UPLOAD SECTION */}
        <div>
          <h3 className="font-bold mb-2">1. Import Members.csv</h3>
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleMemberUpload} 
            disabled={loading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        {/* DELETE SECTION */}
        <div className="text-right">
          <h3 className="font-bold mb-2 text-red-600">Danger Zone</h3>
          <button 
            onClick={handleClearLegacy}
            disabled={loading}
            className="bg-red-100 text-red-700 px-4 py-2 rounded hover:bg-red-200"
          >
            Clear All Legacy Data
          </button>
        </div>
      </div>
      
      {status && <p className="mt-4 font-mono text-sm bg-white p-2 border">{status}</p>}

      {/* --- PASTE THIS NEW BLOCK HERE --- */}
      <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="font-bold mb-2">2. Import Work Credits.csv</h3>
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleCreditsUpload} 
            disabled={loading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
          />
      </div>

      {/* ... status message paragraph ... */}
    </div>
  );
}