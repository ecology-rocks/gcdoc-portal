import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut,
  createUserWithEmailAndPassword // <--- Add this
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc,
  collection, // <--- New
  addDoc,     // <--- New
  query,      // <--- New
  where,      // <--- New
  getDocs,     // <--- New
  deleteDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";

import DeduplicateTool from './DeduplicateTool';
import AdminDataTools from './AdminDataTools'; // Add import

// --- CONFIGURATION ---
// REPLACE THIS WITH YOUR FIREBASE CONFIG FROM THE CONSOLE

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCiVqLEWkC7W02nyfHyRaNDeMSHUjWwFMY",
  authDomain: "gcdocportal.firebaseapp.com",
  projectId: "gcdocportal",
  storageBucket: "gcdocportal.firebasestorage.app",
  messagingSenderId: "376970920620",
  appId: "1:376970920620:web:b4d7727fa5631025531509"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- COMPONENTS ---

function Login({ setUser }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      // onAuthStateChanged in App handles the rest
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded shadow-md w-80">
        <h2 className="text-2xl mb-4 font-bold text-gray-800">
          {isRegistering ? "Register Member" : "Club Login"}
        </h2>
        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
        <input
          type="email"
          placeholder="Email"
          className="w-full p-2 mb-4 border rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full p-2 mb-4 border rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700">
          {isRegistering ? "Sign Up" : "Log In"}
        </button>
        
        <button 
          type="button" 
          onClick={() => setIsRegistering(!isRegistering)}
          className="w-full mt-4 text-sm text-blue-600 hover:underline"
        >
          {isRegistering ? "Already have an account? Log In" : "Need an account? Register"}
        </button>
      </form>
    </div>
  );
}


// --- HELPER FUNCTIONS ---

// --- HELPER FUNCTIONS ---

// 1. Determine the "Fiscal Year" of a specific date
// Oct 1, 2025 starts the 2026 Fiscal Year
function getFiscalYear(dateString) {
  if (!dateString) return 0;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 0; // Invalid date

  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed (Jan=0, Oct=9)

  // If Oct (9), Nov (10), or Dec (11), it belongs to next year
  return month >= 9 ? year + 1 : year;
}

function calculateRewards(logs) {
  // 1. Determine which Fiscal Year we are currently in based on TODAY
  const currentFiscalYear = getFiscalYear(new Date().toISOString()); // e.g., 2026

  const relevantLogs = logs.filter(l => {
    if (!l.date) return false;
    
    const logFiscalYear = getFiscalYear(l.date);
    
    // Case A: The log naturally falls in this fiscal year
    if (logFiscalYear === currentFiscalYear) return true;

    // Case B: The log is from the previous year, but Admin marked it to roll over
    if (l.applyToNextYear && logFiscalYear === (currentFiscalYear - 1)) return true;

    return false;
  });

  // 2. Sum hours
  const totalHours = relevantLogs.reduce((sum, log) => sum + (parseFloat(log.hours) || 0), 0);

  // 3. Reward Logic
  let vouchers = 0;
  if (totalHours >= 50) {
    vouchers = Math.floor(totalHours / 25);
  }

  let membershipStatus = "Standard Dues";
  if (totalHours >= 50) {
    membershipStatus = "Reduced Dues Qualified";
  }

  return { totalHours, vouchers, membershipStatus, year: currentFiscalYear };
}

function VolunteerLogs({ user, currentUserRole }) {
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

      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full text-left">
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

function AdminMemberSelect({ onSelect }) {
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

function ProfileEditor({ targetUser, currentUserRole, onClose, onSave }) {
  // Initialize state with existing data or empty strings
  const [formData, setFormData] = useState({
    firstName: targetUser.firstName || '',
    lastName: targetUser.lastName || '',
    email: targetUser.email || '',
    address: targetUser.address || '',
    city: targetUser.city || '',
    state: targetUser.state || '',
    zip: targetUser.zip || '',
    phone: targetUser.phone || '',
    cellPhone: targetUser.cellPhone || '',
    membershipType: targetUser.membershipType || 'Regular',
    role: targetUser.role || 'member'
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const userRef = doc(db, "members", targetUser.uid);
      await updateDoc(userRef, formData);
      onSave(formData); // Tell parent component to update UI
      onClose();
    } catch (err) {
      console.error(err);
      alert("Error updating profile: " + err.message);
    }
  };

  const isAdmin = currentUserRole === 'admin';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <h2 className="text-xl font-bold">Edit Profile: {targetUser.email}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* --- BASIC INFO --- */}
          <div>
            <label className="block text-xs font-bold text-gray-600">First Name</label>
            <input name="firstName" value={formData.firstName} onChange={handleChange} className="w-full p-2 border rounded" required />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600">Last Name</label>
            <input name="lastName" value={formData.lastName} onChange={handleChange} className="w-full p-2 border rounded" required />
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-600">Street Address</label>
            <input name="address" value={formData.address} onChange={handleChange} className="w-full p-2 border rounded" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600">City</label>
            <input name="city" value={formData.city} onChange={handleChange} className="w-full p-2 border rounded" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-600">State</label>
              <input name="state" value={formData.state} onChange={handleChange} className="w-full p-2 border rounded" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600">Zip</label>
              <input name="zip" value={formData.zip} onChange={handleChange} className="w-full p-2 border rounded" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600">Home Phone</label>
            <input name="phone" value={formData.phone} onChange={handleChange} className="w-full p-2 border rounded" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600">Cell Phone</label>
            <input name="cellPhone" value={formData.cellPhone} onChange={handleChange} className="w-full p-2 border rounded" />
          </div>

          {/* --- ADMIN ONLY FIELDS --- */}
          <div className="md:col-span-2 border-t pt-4 mt-2">
            <h3 className="font-bold text-sm text-gray-500 mb-2">Membership Details</h3>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-gray-600">Membership Type</label>
            <select 
              name="membershipType" 
              value={formData.membershipType} 
              onChange={handleChange} 
              disabled={!isAdmin}
              className={`w-full p-2 border rounded ${!isAdmin ? 'bg-gray-100 text-gray-500' : ''}`}
            >
              <option value="Regular">Regular</option>
              <option value="Household">Household</option>
              <option value="Associate">Associate</option>
              <option value="Lifetime">Lifetime</option>
              <option value="Junior">Junior</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600">System Role</label>
            <select 
              name="role" 
              value={formData.role} 
              onChange={handleChange} 
              disabled={!isAdmin} // ONLY ADMINS CAN CHANGE ROLES
              className={`w-full p-2 border rounded ${!isAdmin ? 'bg-gray-100 text-gray-500' : ''}`}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            {!isAdmin && <p className="text-[10px] text-gray-400 mt-1">Only Admins can change roles.</p>}
          </div>

          {/* --- BUTTONS --- */}
          <div className="md:col-span-2 flex justify-end gap-3 mt-4 border-t pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
            <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}


function Dashboard({ user }) {
  const [memberData, setMemberData] = useState(null);
  const [targetUser, setTargetUser] = useState(null); // Who are we viewing?
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState(null);

useEffect(() => {
    const syncProfile = async () => {
      try {
        if (!user) return;

        // STEP 1: Check for Legacy Data
        const legacyQuery = query(collection(db, "legacy_members"), where("email", "==", user.email));
        const legacySnap = await getDocs(legacyQuery);

        if (!legacySnap.empty) {
          console.log("Found legacy data. Merging...");
          const batch = writeBatch(db);
          let foundProfileData = null;

          // Loop through ALL matching legacy records (handles duplicates)
          for (const legacyDoc of legacySnap.docs) {
            const legacyData = legacyDoc.data();
            
            // Save the profile info from the first one we find
            if (!foundProfileData) foundProfileData = legacyData;

            // 1. Move Logs
            const legacyLogsRef = collection(db, "legacy_members", legacyDoc.id, "legacyLogs");
            const legacyLogsSnap = await getDocs(legacyLogsRef);
            
            legacyLogsSnap.forEach(logDoc => {
              const newLogRef = doc(collection(db, "logs")); 
              batch.set(newLogRef, {
                ...logDoc.data(),
                memberId: user.uid,
                status: "approved",
                importedAt: new Date()
              });
            });

            // 2. Delete the old legacy record
            batch.delete(legacyDoc.ref);
          }

          // 3. Update the Real Profile
          if (foundProfileData) {
            const profileRef = doc(db, "members", user.uid);
            
            // Remove fields we don't want to overwrite blindly (like the ID or raw logs)
            const { legacyLogs, legacyKey, ...validProfileData } = foundProfileData;

            batch.set(profileRef, {
              ...validProfileData, // <--- THIS COPIES EVERYTHING (Address, Phone, Breeds, etc.)
              email: user.email,   // Ensure these stay correct
              uid: user.uid
            }, { merge: true });
            
            // Update local state immediately
            setMemberData({
              ...validProfileData,
              email: user.email,
              uid: user.uid
            });
          }

          await batch.commit();
          alert("Success! We found your old volunteer hours and moved them to your new account.");
          // NO RELOAD HERE - effectively stops the loop
          return;
        }

        // STEP 2: Normal Load (No legacy data found)
        const docRef = doc(db, "members", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setMemberData({ ...docSnap.data(), uid: user.uid });
        } else {
          const newProfile = { 
            email: user.email, 
            firstName: "New", 
            lastName: "Member", 
            role: "member", 
            membershipType: "Regular" 
          };
          await setDoc(docRef, newProfile);
          setMemberData({ ...newProfile, uid: user.uid });
        }

      } catch (err) {
        console.error("Error syncing profile:", err);
        // Only show error if it's NOT a permission error we expect during dev
        if (err.code !== 'permission-denied') {
             setError(err.message);
        }
      }
    };

    syncProfile();
  }, [user]);

const handleProfileUpdate = (newData) => {
    // If we are editing the logged-in user, update memberData
    if (activeUser.uid === user.uid) {
      setMemberData({ ...memberData, ...newData });
    }
    // If we are editing a target user (Admin mode), update targetUser
    if (targetUser && activeUser.uid === targetUser.uid) {
      setTargetUser({ ...targetUser, ...newData });
    }
  };

  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!memberData) return <div className="p-6">Loading profile...</div>;

  // Ideally, we view the 'targetUser'. If null, we view the logged-in 'user'.
  const activeUser = targetUser || memberData;
  const isViewingSelf = activeUser.uid === user.uid;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <header className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Member Portal</h1>
          <p className="text-gray-500">
             Logged in as {memberData.firstName} {memberData.lastName} 
             {memberData.role === 'admin' && <span className="ml-2 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">ADMIN</span>}
          </p>
        </div>
        <button 
          onClick={() => signOut(auth)}
          className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300 transition"
        >
          Sign Out
        </button>
      </header>

      {/* ADMIN ONLY: Member Selector */}
      {/* Only show these tools if the user is an admin */}
      {memberData.role === 'admin' && (
        <div className="mb-8">
          <AdminDataTools /> 
          <DeduplicateTool user={user} />
          <AdminMemberSelect onSelect={(m) => setTargetUser(m || null)} />
        </div>
      )}
      
<div className={`p-6 rounded shadow mb-6 transition-colors relative ${isViewingSelf ? 'bg-white' : 'bg-blue-50 border-2 border-blue-300'}`}>
        <div className="flex justify-between items-start mb-4">
           <h2 className="text-xl font-bold text-gray-800">
             {isViewingSelf ? "My Membership" : `Viewing: ${activeUser.firstName} ${activeUser.lastName}`}
           </h2>
           
           <div className="flex gap-2">
             {!isViewingSelf && (
               <button onClick={() => setTargetUser(null)} className="text-sm text-blue-600 underline mr-2">
                 Back to Me
               </button>
             )}
             <button 
               onClick={() => setIsEditing(true)}
               className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold px-3 py-1 rounded"
             >
               Edit Profile
             </button>
           </div>
        </div>

        {/* Detailed Profile View */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div>
             <label className="block text-xs font-bold text-gray-500 uppercase">Contact</label>
             <p className="font-semibold">{activeUser.firstName} {activeUser.lastName}</p>
             <p>{activeUser.email}</p>
             <p className="mt-1 text-sm text-gray-600">{activeUser.phone || activeUser.cellPhone || "No phone listed"}</p>
           </div>
           
           <div>
             <label className="block text-xs font-bold text-gray-500 uppercase">Address</label>
             <p className="text-sm text-gray-800">
               {activeUser.address ? (
                 <>
                   {activeUser.address}<br/>
                   {activeUser.city}, {activeUser.state} {activeUser.zip}
                 </>
               ) : "No address listed"}
             </p>
           </div>

           <div>
             <label className="block text-xs font-bold text-gray-500 uppercase">Status</label>
             <p><span className="font-bold">Type:</span> {activeUser.membershipType || "Regular"}</p>
             <p><span className="font-bold">Role:</span> <span className="capitalize">{activeUser.role}</span></p>
           </div>
        </div>
      </div>

      {/* Render the Editor Modal if isEditing is true */}
      {isEditing && (
        <ProfileEditor 
          targetUser={activeUser} 
          currentUserRole={memberData.role} 
          onClose={() => setIsEditing(false)}
          onSave={handleProfileUpdate}
        />
      )}

      {/* Pass the activeUser to the logs component. It will fetch logs for whoever matches that UID */}
      
      <VolunteerLogs 
  user={activeUser} 
  key={activeUser.uid} 
  currentUserRole={memberData.role} 
/>
      
    </div>
  );
}

// --- MAIN APP ---

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
       {user ? <Dashboard user={user} /> : <Login setUser={setUser} />}
    </div>
  );
}