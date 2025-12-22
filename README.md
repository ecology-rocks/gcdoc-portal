# GCDOC Portal

This is my app to deal with dog club stuff. I'll be working on improvements until I can use it as a full fledged system. This README will serve as my list of action items and Roadmap for improvements.

## Bug Fixes & QOL Improvements

### Phase 1: Roles & Permissions Upgrade
*Focus: Security and the new "Team Lead" role.*

1. The "Team Lead" Role (User Requirement #5)
 - Current State: Binary roles (Admin or Member).
 - Action: Introduce a lead role.
     - Database: Update firestore.rules (if you use them) or app logic to allow leads to write to the volunteer_sheets collection.
     - UI: In Dashboard.vue, conditionally render the BulkEntryTool for leads.
     - Restriction: Update SheetArchive.vue to only show sheets where uploadedBy == currentUser.uid (unless the user is a full Admin).

2. Granular Permissions
 - Action: Instead of checking role === 'admin', create a utility checkPermission(user, 'can_approve_logs'). This makes it easier to let Team Leads do specific admin tasks later without giving them keys to the kingdom.

### Phase 3: The "Classes & Dogs" Module (Major Expansion)
*Focus: The new functionality for classes, dogs, and non-members (User Requirement #4).*

This requires a database schema expansion. We should stop storing everything on the "Member" object and start using dedicated collections.

1. New Data Tables (Collections)

 - dogs: Linked to a ownerId. Contains fields: name, breed, immunizationStatus, immunizationDate.
 - sessions: e.g., "Fall 2025". Contains startDate, endDate.
 - classes: Linked to a sessionId. Contains instructorId, name (e.g., "Puppy 101"), maxStudents.
 - registrations: The "join" table. Links classId, dogId, studentId. This is where "Instructor Notes" live (private to instructor/admin).

2. Non-Member Logic

 - Challenge: You want to add non-members to classes.
 - Solution: Create a participants collection.
     - A "Member" is just a Participant who pays dues and has a login.
     - A "Non-Member" is a Participant profile created by an Admin/Instructor that has contact info and dogs but no login (yet).

3. Instructor Views

 - Action: Create an InstructorDashboard.vue.
     - Shows their active classes.
     - Clicking a class shows the "Roster" (list of dogs/humans).
     - Allows adding private notes to a specific dog's registration record.