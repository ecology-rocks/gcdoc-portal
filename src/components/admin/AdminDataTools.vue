<script setup>
import { ref } from 'vue'
import Papa from 'papaparse'
import { collection, writeBatch, doc, getDocs, query, where } from "firebase/firestore"
import { db } from '@/firebase'
import { calculateRewards, downloadCSV } from '@/utils/utils'

const loading = ref(false)
const status = ref("")


const handleMeetingReport = async () => {
  loading.value = true
  status.value = "Generating report..."
  try {
    // 1. Fetch All Members
    const membersMap = new Map()
    const memSnap = await getDocs(collection(db, "members"))
    memSnap.forEach(d => membersMap.set(d.id, { ...d.data() }))

    // 2. Fetch All Logs
    const logsByMember = {} 
    const logsSnap = await getDocs(collection(db, "logs"))
    logsSnap.forEach(doc => {
      const d = doc.data()
      if (!logsByMember[d.memberId]) logsByMember[d.memberId] = []
      logsByMember[d.memberId].push(d)
    })

    // 3. Build & Split Data
    const regularData = []
    const applicantData = []
    const currentYear = new Date().getFullYear()

    membersMap.forEach((m, id) => {
      // FILTER: Only Active members appear on the Meeting Attendance sheet
      if (m.status == 'Inactive' ) return

      const memberLogs = logsByMember[id] || []
      const stats = calculateRewards(memberLogs, m.membershipType)

      const joinedYear = parseInt(m.joinedDate)
      // eslint-disable-next-line no-unused-vars
      const yearsMember = currentYear - joinedYear
      const isLifetime = (m.membershipType || "").toLowerCase().includes("lifetime")
      
      let ltSymbol = ""
      if (isLifetime) {
        ltSymbol = "LT" 
      } else if (!isNaN(joinedYear) && (currentYear - joinedYear) >= 15) {
        ltSymbol = "*"
      }

      const row = {
        ltSymbol: ltSymbol,
        name: `${m.lastName}, ${m.firstName}`,
        type: m.membershipType || "Regular",
        hours: stats.totalHours,
        vouchers: stats.vouchers,
        dues: stats.membershipStatus, 
      }

      if ((m.membershipType || "").toLowerCase().includes("applicant")) {
        applicantData.push(row)
      } else {
        regularData.push(row)
      }
    })

    regularData.sort((a, b) => a.name.localeCompare(b.name))
    applicantData.sort((a, b) => a.name.localeCompare(b.name))

    // 4. Generate Print Window
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html>
        <head>
          <title>Meeting Attendance - ${new Date().toLocaleDateString()}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            h1 { text-align: center; margin-bottom: 5px; }
            h2 { margin-top: 30px; border-bottom: 2px solid #333; padding-bottom: 5px; }
            .meta { text-align: center; color: #666; margin-bottom: 20px; font-size: 0.9em; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background-color: #eee; font-weight: bold; }
            .box { width: 15px; height: 15px; border: 1px solid #333; display: inline-block; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .center { text-align: center; }
            .symbol { font-weight: bold; font-size: 1.2em; }
          </style>
        </head>
        <body>
          <h1>Membership Meeting Attendance</h1>
          <div class="meta">Generated: ${new Date().toLocaleDateString()}</div>
          
          <table>
            <thead>
              <tr>
                <th style="width: 30px; text-align: center;" title="Lifetime Status">LT</th>
                <th>Member Name</th>
                <th>Type</th>
                <th>Hours To Date (10/1 to 9/30)</th>
                <th style="text-align: center; width: 60px;">Present</th>
              </tr>
            </thead>
            <tbody>
              ${regularData.map(r => `
                <tr>
                  <td class="center symbol">${r.ltSymbol}</td>
                  <td>${r.name}</td>
                  <td>${r.type}</td>
                  <td>${r.hours}</td>
                  <td class="center"><div class="box"></div></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${applicantData.length > 0 ? `
            <h2>Applicants</h2>
            <table>
              <thead>
                <tr>
                  <th>Applicant Name</th>
                  <th>Hours (FY)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${applicantData.map(r => `
                  <tr style="background-color: #fffbe6;">
                    <td>${r.name}</td>
                    <td>${r.hours}</td>
                    <td><strong>${r.dues}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => printWindow.print(), 500)

    status.value = "Report generated."
  } catch (err) {
    console.error(err)
    status.value = "Error: " + err.message
  }
  loading.value = false
}

const handleExportMembers = async () => {
  loading.value = true
  status.value = "Fetching full member data..."
  try {
    const allMembers = []

    const getActivities = (d) => {
      const acts = d.activities || {}
      return {
        Agility: acts.agility ? "Y" : "",
        Obedience: acts.obedience ? "Y" : "",
        Rally: acts.rally ? "Y" : "",
        Flyball: acts.flyball ? "Y" : "",
        Freestyle: acts.freestyle ? "Y" : "",
        Conformation: acts.conformation ? "Y" : "",
        Earthdog: acts.earthdog ? "Y" : ""
      }
    }

    const formatRow = (id, d) => ({
      SystemID: id,
      Status: d.status || "Active",
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
    })

    const membersSnap = await getDocs(collection(db, "members"))
    membersSnap.forEach(doc => allMembers.push(formatRow(doc.id, doc.data())))

    status.value = `Exporting ${allMembers.length} members...`
    downloadCSV(allMembers, `GCDOC_Members_Backup_${new Date().toISOString().slice(0,10)}.csv`)
    status.value = "Member export complete."
  } catch (err) {
    console.error(err)
    status.value = "Error exporting members: " + err.message
  }
  loading.value = false
}

const handleExportLogs = async () => {
  loading.value = true
  status.value = "Fetching all work credits..."
  try {
    const exportData = []
    const memberMap = {} 
    const emailMap = {}
    
    // Map Member Info
    const membersSnap = await getDocs(collection(db, "members"))
    membersSnap.forEach(doc => {
      const d = doc.data()
      let name = `${d.lastName}, ${d.firstName}`
      if (d.firstName2) name += ` & ${d.firstName2}`
      memberMap[doc.id] = name
      emailMap[doc.id] = d.email
    })

    // Fetch All Logs
    const logsSnap = await getDocs(collection(db, "logs"))
    logsSnap.forEach(doc => {
      const d = doc.data()
      exportData.push({
        LogID: doc.id,
        // Since we combined tables, we can just look up the member status if we wanted to
        // distinguish "Active" vs "Unregistered", but mostly a log is just a log now.
        Type: "Log", 
        MemberEmail: emailMap[d.memberId] || "",
        MemberName: memberMap[d.memberId] || "Unknown",
        Date: d.date,
        Activity: d.activity,
        Hours: d.hours,
        Status: d.status || "approved",
        FiscalYearRollover: d.applyToNextYear ? "Yes" : "No",
      })
    })

    exportData.sort((a, b) => new Date(b.Date) - new Date(a.Date))

    status.value = `Exporting ${exportData.length} logs...`
    downloadCSV(exportData, `GCDOC_Logs_Backup_${new Date().toISOString().slice(0,10)}.csv`)
    status.value = "Log export complete."
  } catch (err) {
    console.error(err)
    status.value = "Error exporting logs: " + err.message
  }
  loading.value = false
}

// --- IMPORT FUNCTIONS ---
const handleMemberUpload = (e) => {
  const file = e.target.files[0]
  if (!file) return
  loading.value = true
  status.value = "Parsing Member CSV..."

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const rows = results.data
      const batch = writeBatch(db)
      let count = 0

      for (const row of rows) {
        // We write EVERYTHING to 'members' now.
        
        let docRef
        if (row.SystemID) {
          docRef = doc(db, "members", row.SystemID)
        } else if (row['e-mail address']) {
          // Legacy import style
          const cleanId = row['e-mail address'].trim().toLowerCase()
          docRef = doc(db, "members", cleanId)
        } else {
           // Skip if no ID
           continue 
        }

        const cleanData = {
            firstName: row.FirstName,
            lastName: row.LastName,
            email: row.Email || row['e-mail address'],
            // Map legacy fields if present
            status: row.Status || (row.Active === 'True' ? 'Active' : 'Unregistered'),
            membershipType: row.MembershipType || row['Member Type'] || 'Regular',
            legacyKey: row.Key ? parseInt(row.Key) : null,
            importedAt: new Date()
        }
        
        batch.set(docRef, cleanData, { merge: true })
        count++
      }

      await batch.commit()
      status.value = `Imported/Updated ${count} members.`
      loading.value = false
    }
  })
}

const handleCreditsUpload = (e) => {
  const file = e.target.files[0]
  if (!file) return
  loading.value = true
  status.value = "Parsing Credits CSV..."

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const rows = results.data
      const batch = writeBatch(db)
      let count = 0

      // We need to look up members to link logs correctly
      const membersSnap = await getDocs(collection(db, "members"))
      const keyMap = {}   // Legacy Key -> DocID
      const emailMap = {} // Email -> DocID
      
      membersSnap.forEach(d => {
        const data = d.data()
        if (data.legacyKey) keyMap[data.legacyKey.toString()] = d.id
        if (data.email) emailMap[data.email.toLowerCase()] = d.id
      })

      for (const row of rows) {
        let memberId = null
        
        // Try to find the owner of this log
        if (row.MemberEmail) {
           memberId = emailMap[row.MemberEmail.toLowerCase()]
        } else if (row.Key) {
           memberId = keyMap[row.Key.toString()]
        }

        if (memberId) {
           const logId = row.LogID || doc(collection(db, "logs")).id
           const logRef = doc(db, "logs", logId)
           
           batch.set(logRef, {
             memberId: memberId,
             date: row.Date || row.When,
             activity: row.Activity || row.Description,
             hours: parseFloat(row.Hours) || 0,
             status: row.Status || "approved",
             applyToNextYear: row.FiscalYearRollover === "Y"
           }, { merge: true })
           count++
        }
      }

      await batch.commit()
      status.value = `Imported/Updated ${count} log entries.`
      loading.value = false
    }
  })
}
</script>

<template>
  <div class="p-6 border-2 border-dashed border-gray-300 rounded bg-gray-50 my-8">
    <h2 class="text-xl font-bold mb-4">Admin: Data Tools</h2>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 border-b border-gray-200 pb-6">
      <div>
        <h3 class="font-bold mb-2 text-blue-800">Export Data (Backup)</h3>
        <div class="flex gap-2">
          <button 
            @click="handleExportMembers"
            :disabled="loading"
            class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm font-bold disabled:opacity-50"
          >
            Members .csv
          </button>
          <button 
            @click="handleExportLogs"
            :disabled="loading"
            class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm font-bold disabled:opacity-50"
          >
            Work Credits .csv
          </button>
          <button 
            @click="handleMeetingReport"
            :disabled="loading"
            class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 text-sm font-bold disabled:opacity-50"
          >
            🖨️ Printable Attendance Sheet
          </button>
        </div>
        <p class="text-xs text-gray-500 mt-2">These files include System IDs and can be re-uploaded to update data.</p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h3 class="font-bold mb-2">1. Import Members</h3>
        <p class="text-xs text-gray-500 mb-2">Accepts original Excel CSV or System Backup CSV</p>
        <input 
          type="file" 
          accept=".csv" 
          @change="handleMemberUpload" 
          :disabled="loading"
          class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      <div class="border-l pl-6">
        <h3 class="font-bold mb-2">2. Import Work Credits</h3>
        <p class="text-xs text-gray-500 mb-2">Accepts original Excel CSV or System Backup CSV</p>
        <input 
          type="file" 
          accept=".csv" 
          @change="handleCreditsUpload" 
          :disabled="loading"
          class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
        />
      </div>
    </div>
    
    <p v-if="status" class="mt-4 font-mono text-sm bg-white p-2 border">{{ status }}</p>
  </div>
</template>