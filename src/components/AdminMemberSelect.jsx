import { collection, getDocs } from "firebase/firestore";
import { db } from '../firebase'; // Make sure this is there too!
import Papa from 'papaparse';
import React, { useState, useEffect } from 'react';

export default function AdminMemberSelect({ onSelect }) {
  const [combinedMembers, setCombinedMembers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // 1. Fetch Registered Users
      const membersSnap = await getDocs(collection(db, "members"));
      const registered = membersSnap.docs.map(doc => ({
        uid: doc.id,
        type: 'registered',
        ...doc.data()
      }));

      // 2. Fetch Legacy Users
      const legacySnap = await getDocs(collection(db, "legacy_members"));
      const legacy = legacySnap.docs.map(doc => ({
        uid: "LEGACY_" + doc.id,
        realId: doc.id,
        type: 'legacy',
        ...doc.data()
      }));

      // 3. Combine and Sort
      const all = [...registered, ...legacy].sort((a, b) => 
        (a.lastName || "").localeCompare(b.lastName || "")
      );
      
      setCombinedMembers(all);
      setLoading(false);
    };
    fetchData();
  }, []);

  // Search includes firstName2 and lastName2
  const filteredMembers = combinedMembers.filter(m => {
    const search = searchTerm.toLowerCase();
    const fullString = `${m.firstName} ${m.lastName} ${m.firstName2 || ''} ${m.lastName2 || ''} ${m.email}`.toLowerCase();
    return fullString.includes(search);
  });

  return (
    <div className="bg-blue-50 p-4 rounded border border-blue-200 mb-6">
      <h3 className="text-sm font-bold text-blue-800 mb-2 uppercase tracking-wide">
        Admin Mode: Log hours for others
      </h3>
      
      {loading ? <p className="text-sm text-blue-600">Loading member list...</p> : (
        <div>
          <input 
            type="text"
            placeholder="Search by Name (First, Last, or Spouse)..."
            className="w-full p-2 mb-2 border rounded border-blue-300 focus:outline-none focus:border-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select 
            className="w-full p-2 border rounded bg-white"
            onChange={(e) => {
              const selected = combinedMembers.find(m => m.uid === e.target.value);
              onSelect(selected);
            }}
            size={filteredMembers.length > 10 ? 10 : Math.max(2, filteredMembers.length + 1)} 
          >
            <option value="">
              -- {searchTerm ? `Found ${filteredMembers.length} matches` : "Select a Member"} --
            </option>
            
            {filteredMembers.map(m => {
              // --- NEW DISPLAY LOGIC ---
              let label = `${m.lastName}, ${m.firstName}`;
              
              // If there is a second member...
              if (m.firstName2) {
                // Check if last name is different (and exists)
                if (m.lastName2 && m.lastName2 !== m.lastName) {
                   // Format: "Doe, John & Smith, Jane"
                   label += ` & ${m.lastName2}, ${m.firstName2}`;
                } else {
                   // Format: "Doe, John & Jane"
                   label += ` & ${m.firstName2}`;
                }
              }

              const status = m.type === 'legacy' ? "(Not Registered)" : "(Active)";
              
              return (
                <option key={m.uid} value={m.uid} className="py-1">
                  {label} {status}
                </option>
              );
            })}
          </select>
        </div>
      )}
    </div>
  );
}
