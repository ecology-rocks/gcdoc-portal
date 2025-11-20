import React, { useState, useEffect } from 'react';
import { signOut } from "firebase/auth";
import { doc, getDoc, setDoc, query, collection, where, getDocs, writeBatch } from "firebase/firestore";
import { db, auth } from '../firebase';

// Import your new children
import VolunteerLogs from './VolunteerLogs';
import ProfileEditor from './ProfileEditor';
import AdminDataTools from './AdminDataTools';
import AdminMemberSelect from './AdminMemberSelect';
import DeduplicateTool from './DeduplicateTool';

export default function Dashboard({ user }) {
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