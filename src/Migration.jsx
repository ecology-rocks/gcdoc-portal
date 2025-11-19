import React, { useState } from 'react';
import { doc, collection, addDoc, writeBatch } from "firebase/firestore";

// --- Helper: Simple CSV Parser (No external dependency needed) ---
const parseCSV = (text) => {
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let insideQuotes = false;
  
  // Normalize line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentVal += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentVal);
      currentVal = '';
    } else if (char === '\n' && !insideQuotes) {
      currentRow.push(currentVal);
      rows.push(currentRow);
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  // Add last row if exists
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal);
    rows.push(currentRow);
  }

  // Convert array of arrays to array of objects
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, index) => {
      obj[h] = row[index] || "";
    });
    return obj;
  });
};

export default function Migration({ db }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const log = (msg) => setLogs(prev => [...prev, msg]);

  const handleMemberUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const text = await file.text();
    const data = parseCSV(text);

    log(`Found ${data.length} members. Starting upload...`);
    const batchSize = 450; 

    // Process in chunks
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = writeBatch(db);
      const chunk = data.slice(i, i + batchSize);

      chunk.forEach((row) => {
        if (!row.Key) return; // Skip empty rows

        // Use the "Key" as the Document ID so we can link credits later
        const docRef = doc(db, "users", row.Key);
        const isActive = row.Active === "True";

        batch.set(docRef, {
          legacyId: row.Key,
          firstName: row.FirstName || "",
          lastName: row.LastName || "",
          email: row["e-mail address"] || "",
          phone: row["Cell Phone"] || row.Phone || "",
          membershipType: row["Member Type"] || "",
          isActive: isActive,
          address: {
            street: row.Address || "",
            city: row.City || "",
            state: row.St || "",
            zip: row.Zip || ""
          }
        });
      });

      await batch.commit();
      log(`Uploaded batch ${i} to ${i + chunk.length}`);
    }
    log("Member upload complete!");
    setLoading(false);
  };

  const handleCreditUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const text = await file.text();
    const data = parseCSV(text);
    
    log(`Found ${data.length} work credits. Starting upload...`);
    
    const chunks = [];
    const chunkSize = 100;
    for (let i = 0; i < data.length; i += chunkSize) {
        chunks.push(data.slice(i, i + chunkSize));
    }

    let count = 0;
    
    for (const chunk of chunks) {
        const promises = chunk.map(row => {
            if (!row.Key || !row.Hours) return null;
            
            return addDoc(collection(db, "logs"), {
                memberId: row.Key,
                description: row.Description || "Imported Log",
                date: row.When || new Date().toISOString(),
                hours: parseFloat(row.Hours) || 0,
                approved: true,
                imported: true
            });
        });
        
        await Promise.all(promises);
        count += chunk.length;
        log(`Uploaded ${count} credits...`);
    }

    log("Work credit upload complete!");
    setLoading(false);
  };

  return (
    <div className="p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4 text-red-600">⚠️ Admin Data Migration</h2>
      <p className="mb-4 text-sm text-gray-600">
        Upload <strong>Members.csv</strong> first, then <strong>Work Credits.csv</strong>.
      </p>
      
      <div className="grid gap-6 mb-6">
        <div className="border p-4 rounded">
          <h3 className="font-bold mb-2">1. Upload Members</h3>
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleMemberUpload} 
            disabled={loading}
          />
        </div>

        <div className="border p-4 rounded">
          <h3 className="font-bold mb-2">2. Upload Work Credits</h3>
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleCreditUpload}
            disabled={loading}
          />
        </div>
      </div>

      <div className="bg-gray-900 text-green-400 p-4 rounded h-64 overflow-y-auto font-mono text-xs">
        {logs.map((l, i) => <div key={i}>{l}</div>)}
        {loading && <div>Processing...</div>}
      </div>
    </div>
  );
}