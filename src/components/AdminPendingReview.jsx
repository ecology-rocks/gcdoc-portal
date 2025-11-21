import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from '../firebase';

export default function AdminPendingReview() {
  const [pendingLogs, setPendingLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState("");

  useEffect(() => {
    fetchPendingLogs();
  }, []);

  const fetchPendingLogs = async () => {
    setLoading(true);
    try {
      // 1. Fetch ALL Pending Logs
      const q = query(collection(db, "logs"), where("status", "==", "pending"));
      const querySnapshot = await getDocs(q);
      
      const rawLogs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      if (rawLogs.length === 0) {
        setPendingLogs([]);
        setLoading(false);
        return;
      }

      // 2. We need names! Fetch all members to create a lookup map
      // (Fetching 200 members is very fast/cheap in Firestore)
      const memberSnap = await getDocs(collection(db, "members"));
      const memberMap = {};
      memberSnap.forEach(doc => {
        const d = doc.data();
        memberMap[doc.id] = `${d.lastName}, ${d.firstName}`;
      });

      // 3. Attach names to logs
      const enrichedLogs = rawLogs.map(log => ({
        ...log,
        memberName: memberMap[log.memberId] || "Unknown User"
      }));

      // Sort by Date (Oldest first, so you handle backlog)
      enrichedLogs.sort((a, b) => new Date(a.date) - new Date(b.date));

      setPendingLogs(enrichedLogs);
    } catch (err) {
      console.error(err);
      setActionStatus("Error loading logs.");
    }
    setLoading(false);
  };

  const handleApprove = async (logId) => {
    try {
      setActionStatus("Approving...");
      const logRef = doc(db, "logs", logId);
      
      // Update status to approved
      await updateDoc(logRef, { status: "approved" });
      
      // Remove from local list immediately
      setPendingLogs(prev => prev.filter(l => l.id !== logId));
      setActionStatus("Approved!");
      
      // Clear success message after 2 seconds
      setTimeout(() => setActionStatus(""), 2000);
    } catch (err) {
      alert("Error approving: " + err.message);
    }
  };

  const handleReject = async (logId) => {
    if (!window.confirm("Are you sure you want to DELETE this log entry? This cannot be undone.")) return;
    try {
      setActionStatus("Deleting...");
      await deleteDoc(doc(db, "logs", logId));
      setPendingLogs(prev => prev.filter(l => l.id !== logId));
      setActionStatus("Deleted.");
      setTimeout(() => setActionStatus(""), 2000);
    } catch (err) {
      alert("Error deleting: " + err.message);
    }
  };

  if (loading) return <div className="p-4 text-gray-500 italic">Checking for pending items...</div>;
  if (pendingLogs.length === 0) return null; // Don't show anything if there's no work to do

  return (
    <div className="bg-orange-50 border-l-4 border-orange-400 p-4 mb-8 shadow-sm rounded-r">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-bold text-orange-800">⚠️ Pending Review ({pendingLogs.length})</h3>
          <p className="text-sm text-orange-700">These items exceed the daily hours limit and require approval.</p>
        </div>
        {actionStatus && <span className="text-sm font-bold text-green-600 bg-white px-2 py-1 rounded shadow">{actionStatus}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left bg-white rounded shadow border border-orange-200">
          <thead className="bg-orange-100 text-orange-900 uppercase text-xs">
            <tr>
              <th className="p-3">Member</th>
              <th className="p-3">Date</th>
              <th className="p-3">Activity</th>
              <th className="p-3 text-right">Hours</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {pendingLogs.map(log => (
              <tr key={log.id} className="border-t hover:bg-orange-50 transition-colors">
                <td className="p-3 font-bold text-gray-800">{log.memberName}</td>
                <td className="p-3">{log.date}</td>
                <td className="p-3">{log.activity}</td>
                <td className="p-3 text-right font-mono font-bold">{log.hours}</td>
                <td className="p-3 flex justify-center gap-2">
                  <button 
                    onClick={() => handleApprove(log.id)}
                    className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 text-xs font-bold shadow-sm"
                  >
                    Approve
                  </button>
                  <button 
                    onClick={() => handleReject(log.id)}
                    className="bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200 text-xs font-bold border border-red-200"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}