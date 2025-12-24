# GCDOC Portal

This is my app to deal with dog club stuff. I'll be working on improvements until I can use it as a full fledged system. This README will serve as my list of action items and Roadmap for improvements.

## Bug Fixes & QOL Improvements


### Kiosk Mode
*Focus: Develop a kiosk mode so that we can have online sign in and sign out.*
1. Standard Kiosk View: Volunteer Sign-in and Out, link to Event view
2. Event Kiosk View: Start event, volunteer sign in or participant sign up flow, with waiver signing

### The "Classes & Dogs" Module (Major Expansion)
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