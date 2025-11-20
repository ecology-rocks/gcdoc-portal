import React, { useState } from 'react';
import { doc, updateDoc } from "firebase/firestore";
import { db } from '../firebase';

export default function ProfileEditor({ targetUser, currentUserRole, onClose, onSave }) {
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