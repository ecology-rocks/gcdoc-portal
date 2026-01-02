# **GCDOC Portal**
A unified management platform for Gem City Dog Obedience Club, supporting multiple sports, event scheduling, and facility maintenance.

## Outstanding To-Dos
 * KIOSK - Have the daily schedule ("WeeklySchedule.vue") show as a screen saver? Or maybe a "right now" and "later"?
 * ADMIN - Need to be able to bulk approve
 * ADMIN - Need to be able to filter by approval status
 * ADMIN - Need to be able to edit hours instead of just delete
 * TEACH - Need to be able to do student import by email
 * TEACH - Need to be able to export printable Rosters
 * TEACH - Need to be able to submit rosters digitally.
 * EVENT - Lots of upgrades needed, including finishing the half-assed Event Availability Scheduling Tool. 

## **Roadmap: The "Club Hub" Expansion (Current Priority)**

We are refactoring the application to move beyond simple member management into a full Volunteer Scheduling and Facility Management system. This allows us to coordinate shared resources (volunteers, physical locations) across different sports.

### **1. Database Schema Updates**

*Focus: Enabling complex scheduling for Practices (Recurring) and Trials (Shifts).*

* **events (New Collection)**  
  * **Core Fields:** title, start, end, location, needsVolunteers.  
  * **volunteerConfig Map:**  
    * *Recurring Mode:* Defines patterns (e.g., "We need 2 Gate Stewards every Tuesday at 7pm").  
    * *Shift Mode:* Defines specific slots (e.g., "We need 1 Scribe on Oct 12th from 8am-12pm").  
* **volunteer\_availability (New Collection)**  
  * Monthly submission record for volunteers.  
  * Tracks **General Availability** (e.g., "I can do any Tuesday") vs **Specific Dates**.  
* **logs (Existing)**  
  * No schema changes.  
  * We will leverage the existing category field ('Standard', 'Maintenance', 'Cleaning') for facility reporting.

### **2. New & Updated Views**

#### **Manager Tools**

* **EventCreator.vue (Update/New):**  
  * Add toggle for needsVolunteers.  
  * Build UI to define **Recurring Patterns** (Days of Week \+ Roles) or **One-Off Shifts**.

#### **Volunteer Tools**

* **VolunteerAvailabilityForm.vue (New):**  
  * The "Monthly Signup" dashboard.  
  * Allows volunteers to select a month and input availability based on that month's event patterns.

### **3. Kiosk Mode Enhancements**

* **Event Integration:**  
  * Update Kiosk to query the new events collection for "Today's Events".  
  * Allow signing into a specific Event (Practice/Trial) vs General Maintenance.
  * Allow signing in as a participant and also as a volunteer.
 

## **Future Phase: The "Classes & Dogs" Module**

*Focus: Detailed class registration and dog tracking.*

**(Deferred until Volunteer Scheduling is stable)**

This requires a database schema expansion to stop storing everything on the "Member" object.

1. **Future Data Tables (Collections)**  
   * dogs: Linked to ownerId. Fields: name, breed, barnHuntNumber, heightClass.  
   * sessions: e.g., "Fall 2025".  
   * classes: Linked to sessionId.  
   * registrations: The join table.  
2. **Non-Member Logic**  
   * Creating "Participant" profiles for non-members who take classes or attend trials but do not pay annual dues.

## **Bug Fixes & QOL Improvements (Backlog)**

* Standardize Kiosk View routing.  
* Mobile styling tweaks for the Admin Dashboard.

--------

# **Schema Migration Plan: Gem City Club Portal (Revised V4)**

**Goal:** Extend the existing app to support Barn Hunt and general facility maintenance using existing structures where possible.

## **1. Modifications to Existing Collections**

### **1.1 logs (Volunteer Logs)**

* **Current State:** category field already exists (Standard, Trial Set Up / Tear Down, Cleaning, Maintenance).  
* **Action Required:** None for data entry.  
* **New View:** ManagerLogView.vue  
  * A read-only table for Managers to filter existing logs by category and date range.

### **1.2 events (New Collection)**

This collection drives the Public Calendar and the Volunteer Scheduling system.

* **Core Fields**  
  * id: (Auto-ID)  
  * title: String (e.g., "Barn Hunt Practice", "Oct Trial", "Board Meeting")  
  * description: String  
  * start: Timestamp (Date and Time of the event start)  
  * end: Timestamp (Date and Time of the event end)  
  * location: String (Free text, e.g., "Main Hall" or "Barn")  
  * needsVolunteers: Boolean (If false, no signup logic runs)  
* **Scheduling Logic (volunteerConfig Map)**  
  * *Only present if needsVolunteers is true.*  
  * Scenario A: Recurring (e.g., Monthly Practices)  
    Used when the event represents a "block" of time (like a whole month of practices) or a recurring series.  
    ```
    {  
      mode: 'recurring', // 'recurring' | 'shifts'  
      // Define the pattern managers need help with  
      patterns: \[  
         {   
           day: 'Tuesday', // 'Monday', 'Tuesday', etc.  
           time: '19:00',  // 24hr format  
           roles: \['Gate', 'Scribe'\], // Array of needed roles  
           slotsPerRole: 2   
         },  
         {   
           day: 'Friday',   
           time: '14:00',   
           roles: \['Setup'\],  
           slotsPerRole: 4  
         }  
      \]  
    }
    ```

  * Scenario B: One-Time (e.g., Trials)  
    Used for specific dates where distinct shifts are defined. 
    ``` 
    {  
      mode: 'shifts',  
      shifts: \[  
         {   
           id: 's1', // distinct ID for claiming  
           role: 'Scribe',   
           start: '08:00', // Time relative to event date  
           end: '12:00',   
           slots: 1,  
           claimedBy: \['uid123'\] // Array of user IDs  
         },  
         {   
           id: 's2',   
           role: 'Gate Steward',   
           start: '08:00',   
           end: '12:00',   
           slots: 1,  
           claimedBy: \[\]   
         }  
      \]  
    }
    ```

## **2. New Collections**

### **2.1 volunteer\_availability**

Handles the "Supply" side of the scheduling equation.

* id: ${year}\_${month}\_${userId}  
* userId: String (FK)  
* monthStr: String ('2025-10')  
* generalAvailability: Map  
  * Matches the Recurring Patterns (e.g., { 'Tuesday\_19:00': 'any' }).  
* specificDates: Array\<Timestamp\>  
  * Used if the volunteer specifies exact dates only.

## **3. Code Refactoring Priorities**

1. **ManagerLogView.vue (New)**  
   * **Purpose:** Allow Managers/Admin to audit the "Cleaning" and "Maintenance" logs without wading through general volunteer hours.  
   * **Features:** Date picker, Category Filter, Export to CSV.  
2. **EventCreator.vue (Update)**  
   * **Purpose:** Allow Managers to define volunteer needs.  
   * **Update:** Add "Needs Volunteers" toggle.  
   * **Update:** Add UI for defining Shifts (for Trials) or Recurring Patterns (for Practices).  
3. **VolunteerAvailabilityForm.vue (New)**  
   * **Purpose:** Allow volunteers to submit their monthly availability.  
   * **Features:**  
     * Dropdown: Select Month.  
     * Dynamic Inputs: Based on the "Recurring Patterns" found in that month's events.  
     * Calendar View: To select/deselect specific dates.