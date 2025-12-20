# GCDOC Portal

This is my app to deal with dog club stuff. I'll be working on improvements until I can use it as a full fledged system. This README will serve as my list of action items and Roadmap for improvements.

## Bug Fixes & QOL Improvements

### Phase 1: Core Membership & Volunteer Logic
*Focus: Stabilizing the current features and tightening data integrity.*

1. Robust Member Entry (User Requirement #1)

 - Current State: Admins can edit profiles, but there isn't a dedicated "Create New Member" flow independent of user signup.
 - Action: Create a NewMemberForm.vue component for Admins.
     - Feature: Allows Admins to create a profile (email, name, membership type) before the user logs in.
     - Tech: Uses setDoc with the email as a key or a generated ID, so when the user finally logs in with Google/Email, their profile is already waiting for them.

2. Strict Approval Workflow (User Requirement #2 & #3)
 - Current State: Only hours > 8 are flagged as "Pending". History exists for edits but is basic.
 - Action:
     - Update VolunteerLogs.vue: Change the logic so that any entry created by a non-admin defaults to status: 'pending'.
     - Update AdminPendingReview.vue: It will now become the main hub for all volunteer data entry, not just "overflow" hours.
     - Changelog: The migration code I wrote included a basic history array on log entries. We will verify this saves who made the change and when for every edit/delete action.

3. Legacy Data Linking (User Requirement #7)
 - Current State: The system attempts to auto-link legacy data by email when a user logs in. If emails don't match, the data is "orphaned."
 - Action: Build a "Link Legacy Profile" tool in the Admin Dashboard.
    - Feature: Admin searches for a "Legacy User" and a "Current User" and clicks "Merge". This moves all logs from the legacy collection to the active user's log collection.

4. Visibility for Maintenance/Cleaning (User Requirement #6)
 - Action: Add a "Category" tag to volunteer logs (e.g., Administration, Event, Maintenance).
     - UI: Highlight Maintenance rows in green in the admin view.
     - Stats: Add a specific counter in the VolunteerLogs stats area: "Maintenance Hours Earned."

### Phase 2: Roles & Permissions Upgrade
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