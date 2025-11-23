import React, { useState, useEffect } from 'react';
import { collection, getDocs } from "firebase/firestore";
import { db } from '../firebase';

export default function AdminMemberSelect({ onSelect }) {
  const [combinedMembers, setCombinedMembers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  
  // NEW STATE: Toggle to show/hide inactive people
  const [showAll, setShowAll] = useState(false); 

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      const membersSnap = await getDocs(collection(db, "members"));
      const registered = membersSnap.docs.map(doc => ({
        uid: doc.id,
        type: 'registered',
        ...doc.data()
      }));

      const legacySnap = await getDocs(collection(db, "legacy_members"));
      const legacy = legacySnap.docs.map(doc => ({
        uid: "LEGACY_" + doc.id,
        realId: doc.id,
        type: 'legacy',
        ...doc.data()
      }));

      const all = [...registered, ...legacy].sort((a, b) => 
        (a.lastName || "").localeCompare(b.lastName || "")
      );
      
      setCombinedMembers(all);
      setLoading(false);
    };
    fetchData();
  }, []);

  const filteredMembers = combinedMembers.filter(m => {
    // 1. Check Status
    // If we are NOT showing all, and the member is NOT active, hide them.
    if (!showAll && m.status && m.status !== 'Active') return false;

    // 2. Check Search Term
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
          {/* CONTROLS ROW */}
          <div className="flex flex-col md:flex-row gap-2 mb-2">
            <input 
              type="text"
              placeholder="Search by Name..."
              className="flex-1 p-2 border rounded border-blue-300 focus:outline-none focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            
            {/* NEW CHECKBOX */}
            <label className="flex items-center gap-2 text-xs font-bold text-blue-800 cursor-pointer bg-white px-3 border border-blue-200 rounded hover:bg-blue-50">
              <input 
                type="checkbox" 
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
              />
              Show Inactive
            </label>
          </div>

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
              let label = `${m.lastName}, ${m.firstName}`;
              if (m.firstName2) {
                if (m.lastName2 && m.lastName2 !== m.lastName) {
                   label += ` & ${m.lastName2}, ${m.firstName2}`;
                } else {
                   label += ` & ${m.firstName2}`;
                }
              }

              const status = m.type === 'legacy' ? "(Not Registered)" : "(Active)";
              const memType = m.membershipType ? `(${m.membershipType})` : "";
              
              // VISUAL CUE: If they are Inactive, show it in the name
              const memberStatus = m.status && m.status !== 'Active' ? `[${m.status.toUpperCase()}]` : "";
              
              return (
                <option key={m.uid} value={m.uid} className={`py-1 ${memberStatus ? 'text-gray-400' : ''}`}>
                  {memberStatus} {label} {status} {memType}
                </option>
              );
            })}
          </select>
        </div>
      )}
    </div>
  );
}