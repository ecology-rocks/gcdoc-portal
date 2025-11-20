import React, { useState } from 'react';
import Papa from 'papaparse';
import { collection, writeBatch, doc, getDocs, query, where } from "firebase/firestore";
import { db } from '../firebase';

export default function AdminDataTools() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  // --- HELPER: DOWNLOAD CSV ---
  const downloadCSV = (data, filename) => {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // =========================================================================
  // 1. EXPORT FUNCTIONS (Now with IDs for Restore capability)
  // =========================================================================

  const handleExportMembers = async () => {
    setLoading(true);
    setStatus("Fetching full member data...");
    try {
      const allMembers = [];

      // Helper to flatten activities
      const getActivities = (d) => {
        const acts = d.activities || {};
        return {
          Agility: acts.agility ? "Y" : "",
          Obedience: acts.obedience ? "Y" : "",
          Rally: acts.rally ? "Y" : "",
          Flyball: acts.flyball ? "Y" : "",
          Freestyle: acts.freestyle ? "Y" : "",
          Conformation: acts.conformation ? "Y" : "",
          Earthdog: acts.earthdog ? "Y" : ""
        };
      };

      // Helper to format row
      // WE ADD 'SystemID' HERE TO ALLOW RE-IMPORT WITHOUT DUPLICATES
      const formatRow = (id, d, status) => ({
        SystemID: id, // <--- CRITICAL FOR RESTORE
        Status: status,
        LegacyKey: d.legacyKey || "",
        FirstName: d.firstName || "",
        LastName: d.lastName || "",
        FirstName2: d.firstName2 || "",
        LastName2: d.lastName2 || "",
        Email: d.email || "",
        Phone: d.phone || "",
        Cell: d.cellPhone || "",
        WorkPhone: d.workPhone || "",
        Address: d.address || "",
        City: d.city || "",
        State: d.state || "",
        Zip: d.zip || "",
        MembershipType: d.membershipType || "",
        Role: d.role || "member",
        Joined: d.joinedDate || "",
        Breeds: d.breeds || "",
        Occupation: d.occupation || "",
        Interests: d.interests || "",
        ...getActivities(d)
      });

      // 1. Active
      const membersSnap = await getDocs(collection(db, "members"));
      membersSnap.forEach(doc => allMembers.push(formatRow(doc.id, doc.data(), "Active")));

      // 2. Legacy
      const legacySnap = await getDocs(collection(db, "legacy_members"));
      legacySnap.forEach(doc => allMembers.push(formatRow(doc.id, doc.data(), "Unregistered")));

      setStatus(`Exporting ${allMembers.length} members...`);
      downloadCSV(allMembers, `GCDOC_Members_Backup_${new Date().toISOString().slice(0,10)}.csv`);
      setStatus("Member export complete.");
    } catch (err) {
      console.error(err);
      setStatus("Error exporting members: " + err.message);
    }
    setLoading(false);
  };

  const handleExportLogs = async () => {
    setLoading(true);
    setStatus("Fetching all work credits...");
    try {
      const exportData = [];

      // Map Active Member Names
      const memberMap = {}; // ID -> Name
      const emailMap = {};  // ID -> Email (Critical for re-import)
      
      const membersSnap = await getDocs(collection(db, "members"));
      membersSnap.forEach(doc => {
        const d = doc.data();
        let name = `${d.lastName}, ${d.firstName}`;
        if (d.firstName2) name += ` & ${d.firstName2}`;
        memberMap[doc.id] = name;
        emailMap[doc.id] = d.email;
      });

      // 1. Active Logs
      const logsSnap = await getDocs(collection(db, "logs"));
      logsSnap.forEach(doc => {
        const d = doc.data();
        exportData.push({
          LogID: doc.id, // <--- CRITICAL FOR RESTORE
          Type: "Active",
          MemberEmail: emailMap[d.memberId] || "", // Needed to find user on re-upload
          MemberName: memberMap[d.memberId] || "Unknown",
          Date: d.date,
          Activity: d.activity,
          Hours: d.hours,
          Status: d.status || "approved",
          FiscalYearRollover: d.applyToNextYear ? "Yes" : "No",
        });
      });

      // 2. Legacy Logs
      const legacyMembersSnap = await getDocs(collection(db, "legacy_members"));
      const legacyPromises = legacyMembersSnap.docs.map(async (memDoc) => {
        const m = memDoc.data();
        let name = `${m.lastName}, ${m.firstName}`;
        if (m.firstName2) name += ` & ${m.firstName2}`;
        
        const subLogsSnap = await getDocs(collection(db, "legacy_members", memDoc.id, "legacyLogs"));
        subLogsSnap.forEach(logDoc => {
          const d = logDoc.data();
          exportData.push({
            LogID: logDoc.id, // <--- CRITICAL FOR RESTORE
            Type: "Legacy (Unregistered)",
            MemberEmail: m.email, // Needed to find user
            MemberName: name,
            Date: d.date,
            Activity: d.activity,
            Hours: d.hours,
            Status: d.status || "approved",
            FiscalYearRollover: d.applyToNextYear ? "Yes" : "No",
          });
        });
      });

      await Promise.all(legacyPromises);
      exportData.sort((a, b) => new Date(b.Date) - new Date(a.Date));

      setStatus(`Exporting ${exportData.length} logs...`);
      downloadCSV(exportData, `GCDOC_Logs_Backup_${new Date().toISOString().slice(0,10)}.csv`);
      setStatus("Log export complete.");
    } catch (err) {
      console.error(err);
      setStatus("Error exporting logs: " + err.message);
    }
    setLoading(false);
  };

  // =========================================================================
  // 2. IMPORT FUNCTIONS (Smart: Handles Excel OR System Backup)
  // =========================================================================

  const handleMemberUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setStatus("Parsing Member CSV...");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;
        const batch = writeBatch(db);
        let count = 0;

        for (const row of rows) {
          // CHECK 1: IS THIS A SYSTEM BACKUP? (Look for SystemID)
          if (row.SystemID) {
            // Determine collection based on Status
            const coll = row.Status === 'Active' ? "members" : "legacy_members";
            const docRef = doc(db, coll, row.SystemID);
            
            batch.set(docRef, {
              // Map System Export columns back to DB fields
              firstName: row.FirstName,
              lastName: row.LastName,
              firstName2: row.FirstName2,
              lastName2: row.LastName2,
              email: row.Email,
              phone: row.Phone,
              cellPhone: row.Cell,
              workPhone: row.WorkPhone,
              address: row.Address,
              city: row.City,
              state: row.State,
              zip: row.Zip,
              membershipType: row.MembershipType,
              role: row.Role,
              joinedDate: row.Joined,
              breeds: row.Breeds,
              occupation: row.Occupation,
              interests: row.Interests,
              activities: {
                agility: row.Agility === "Y",
                obedience: row.Obedience === "Y",
                rally: row.Rally === "Y",
                flyball: row.Flyball === "Y",
                freestyle: row.Freestyle === "Y",
                conformation: row.Conformation === "Y",
                earthdog: row.Earthdog === "Y"
              }
            }, { merge: true });
            count++;
          } 
          // CHECK 2: IS THIS THE OLD EXCEL FILE?
          else if (row['e-mail address']) {
            // ... Use your existing Excel mapping logic here ...
             const email = row['e-mail address'];
             const cleanId = email.trim().toLowerCase();
             const docRef = doc(db, "legacy_members", cleanId);
             batch.set(docRef, {
               legacyKey: parseInt(row['Key']),
               email: email.trim().toLowerCase(),
               firstName: row['FirstName'],
               lastName: row['LastName'],
               membershipType: row['Member Type'] || 'Regular',
               importedAt: new Date(),
               // ... add other Excel mappings if you want full re-import ...
             }, { merge: true });
             count++;
          }
        }

        await batch.commit();
        setStatus(`Imported/Updated ${count} members.`);
        setLoading(false);
      }
    });
  };

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
        const batch = writeBatch(db);
        let count = 0;

        // Lookup maps for Excel import
        const legacySnap = await getDocs(collection(db, "legacy_members"));
        const keyMap = {}; 
        legacySnap.forEach(d => { if(d.data().legacyKey) keyMap[d.data().legacyKey.toString()] = d.id; });

        // We also need an email lookup for Active users if re-importing backup
        const activeSnap = await getDocs(collection(db, "members"));
        const emailMap = {};
        activeSnap.forEach(d => emailMap[d.data().email] = d.id);

        for (const row of rows) {
          // CASE 1: SYSTEM RESTORE (Has LogID)
          if (row.LogID && row.MemberEmail) {
            // We need to find where this log goes.
            // Try Active first
            let collectionName = "logs";
            let docId = row.LogID;
            
            // If it was Legacy, it goes into subcollection
            if (row.Type && row.Type.includes("Legacy")) {
               // Find the Legacy Parent ID using Email
               const legacyParentId = Object.keys(keyMap).find(key => keyMap[key] === row.MemberEmail) || legacySnap.docs.find(d => d.data().email === row.MemberEmail)?.id;
               
               if (legacyParentId) {
                 const logRef = doc(db, "legacy_members", legacyParentId, "legacyLogs", row.LogID);
                 batch.set(logRef, {
                   date: row.Date,
                   activity: row.Activity,
                   hours: parseFloat(row.Hours),
                   status: row.Status,
                   applyToNextYear: row.FiscalYearRollover === "Y"
                 });
                 count++;
               }
            } else {
               // Active Log
               const logRef = doc(db, "logs", row.LogID);
               batch.set(logRef, {
                 // We must ensure memberId is correct. Look up user by email to be safe.
                 memberId: emailMap[row.MemberEmail] || row.MemberEmail, 
                 date: row.Date,
                 activity: row.Activity,
                 hours: parseFloat(row.Hours),
                 status: row.Status,
                 applyToNextYear: row.FiscalYearRollover === "Y"
               }, { merge: true }); // Merge prevents overwriting critical internal fields
               count++;
            }
          }
          // CASE 2: OLD EXCEL FILE (Has Key)
          else if (row['Key']) {
             const rawKey = row['Key']; 
             const memberKey = parseInt(rawKey).toString(); 
             const memberDocID = keyMap[memberKey];

             if (memberDocID) {
               const newLogRef = doc(collection(db, "legacy_members", memberDocID, "legacyLogs"));
               batch.set(newLogRef, {
                 date: row['When'],
                 activity: row['Description'],
                 hours: parseFloat(row['Hours']) || 0,
                 importedAt: new Date()
               });
               count++;
             }
          }
        }

        await batch.commit();
        setStatus(`Imported/Updated ${count} log entries.`);
        setLoading(false);
      }
    });
  };

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

  return (
    <div className="p-6 border-2 border-dashed border-gray-300 rounded bg-gray-50 my-8">
      <h2 className="text-xl font-bold mb-4">Admin: Data Tools</h2>
      
      {/* EXPORT SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 border-b border-gray-200 pb-6">
        <div>
          <h3 className="font-bold mb-2 text-blue-800">Export Data (Backup)</h3>
          <div className="flex gap-2">
            <button 
              onClick={handleExportMembers}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm font-bold"
            >
              Members .csv
            </button>
            <button 
              onClick={handleExportLogs}
              disabled={loading}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm font-bold"
            >
              Work Credits .csv
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">These files include System IDs and can be re-uploaded to update data.</p>
        </div>
      </div>

      {/* IMPORT SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-bold mb-2">1. Import Members</h3>
          <p className="text-xs text-gray-500 mb-2">Accepts original Excel CSV or System Backup CSV</p>
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleMemberUpload} 
            disabled={loading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        <div className="border-l pl-6">
          <h3 className="font-bold mb-2">2. Import Work Credits</h3>
          <p className="text-xs text-gray-500 mb-2">Accepts original Excel CSV or System Backup CSV</p>
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleCreditsUpload} 
            disabled={loading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
          />
        </div>
      </div>
      
      <div className="mt-6 pt-6 border-t text-right">
        <h3 className="font-bold mb-2 text-red-600">Danger Zone</h3>
        <button 
          onClick={handleClearLegacy}
          disabled={loading}
          className="bg-red-100 text-red-700 px-4 py-2 rounded hover:bg-red-200"
        >
          Clear All Legacy Data
        </button>
      </div>
      
      {status && <p className="mt-4 font-mono text-sm bg-white p-2 border">{status}</p>}
    </div>
  );
}