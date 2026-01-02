/**
 * src/utils/permissions.js
 * Centralized logic for role-based access control.
 */

// Define the available roles in the system
export const ROLES = {
  ADMIN: 'admin',      // Can do everything
  REGISTRAR: 'registrar', // Can manage classes, view all rosters
  TEACHER: 'teacher',  // Can view own classes, email students, add notes
  MEMBER: 'member'     // Can view own history and dogs
}

// Helper to normalize roles (handles case insensitivity)
const getRole = (user) => (user?.role || 'member').toLowerCase()

/**
 * Checks if a user has permission to perform a specific action.
 * @param {Object} user - The user profile object
 * @param {String} action - The action to check (e.g., 'manage_classes')
 * @param {Object} context - Optional context (e.g., the specific class they want to edit)
 */
export function can(user, action, context = null) {
  if (!user) return false
  const role = getRole(user)

  // 1. Admins have god-mode
  if (role === ROLES.ADMIN) return true

  switch (action) {
    // --- GLOBAL VIEWS ---
    case 'view_admin_console':
      // Registrars and Managers can see the console
      return role === ROLES.REGISTRAR || role === 'manager'

    case 'view_teaching_dashboard':
      // Teachers and Registrars need to see the schedule view
      return role === ROLES.TEACHER || role === ROLES.REGISTRAR

    // --- CLASS MANAGEMENT (Registrar) ---
    case 'manage_classes':
      // Creating/Editing classes, changing prices, etc.
      return role === ROLES.REGISTRAR

    case 'manage_roster':
      // Moving students, approving waitlists
      return role === ROLES.REGISTRAR

    // --- TEACHING (Teacher) ---
    case 'view_class_roster':
      if (role === ROLES.REGISTRAR) return true
      if (role === ROLES.TEACHER) {
        // Teachers can only view rosters for classes they are teaching
        if (!context) return false // Safety check
        // Check if their ID or Name is in the instructors list
        return context.instructors && (
          context.instructors.includes(user.uid) || 
          context.instructors.includes(user.lastName) // Fallback for legacy
        )
      }
      return false

    case 'email_class':
    case 'edit_class_notes':
      // Same logic as viewing roster
      if (role === ROLES.REGISTRAR) return true
      if (role === ROLES.TEACHER) {
        return context && context.instructors && context.instructors.includes(user.uid)
      }
      return false

    // --- MEMBER ACTIONS ---
    case 'view_own_dogs':
      // Everyone can do this
      return true

    default:
      console.warn(`Unknown permission action: ${action}`)
      return false
  }
}