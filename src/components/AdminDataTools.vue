<script setup>
import { ref } from 'vue'
import Papa from 'papaparse'
import { collection, writeBatch, doc, getDocs, query, collectionGroup } from "firebase/firestore"
import { db } from '../firebase'
import { calculateRewards } from '../utils'

const loading = ref(false)
const status = ref("")

// --- HELPER: DOWNLOAD CSV ---
const downloadCSV = (data, filename) => {
  const csv = Papa.unparse(data)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const handleMeetingReport = async () => {
  loading.value = true
  status.value = "Generating report..."
  try {
    // 1. Fetch Members
    const membersMap = new Map()
    const activeSnap = await getDocs(collection(db, "members"))
    activeSnap.forEach(d => membersMap.set(d.id, { ...d.data(), type: 'active' }))
    
    const legacySnap = await getDocs(collection(db, "legacy_members"))
    legacySnap.forEach(d => membersMap.set(d.id, { ...d.data(), type: 'legacy' }))

    // 2. Fetch Logs & Group
    const logsByMember = {} 
    const logsSnap = await getDocs(collection(db, "logs"))
    logsSnap.forEach(doc => {
      const d = doc.data()
      if (!logsByMember[d.memberId]) logsByMember[d.memberId] = []
      logsByMember[d.memberId].push(d)
    })

    const legacyPromises = legacySnap.docs.map(async (memDoc) => {
      const subLogsSnap = await getDocs(collection(db, "legacy_members", memDoc.id, "legacyLogs"))
      const mLogs = subLogsSnap.docs.map(l => l.data())
      if (!logsByMember[memDoc.id]) logsByMember[memDoc.id] = []
      logsByMember[memDoc.id].push(...mLogs)
    })
    await Promise.all(legacyPromises)

    // 3. Build & Split Data
    const regularData = []
    const applicantData = []
    const currentYear = new Date().getFullYear()

    membersMap.forEach((m, id) => {
      const memberLogs = logsByMember[id] || []
      const stats = calculateRewards(memberLogs, m.membershipType)
      if (m.status && m.status !== 'Active') return

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
                <th>Hours (FY)</th>
                <th>Vouchers</th>
                <th>Dues Status</th>
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
                  <td>${r.vouchers}</td>
                  <td>${r.dues}</td>
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

    const formatRow = (id, d, statusText) => ({
      SystemID: id,
      Status: statusText,
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
    membersSnap.forEach(doc => allMembers.push(formatRow(doc.id, doc.data(), "Active")))

    const legacySnap = await getDocs(collection(db, "legacy_members"))
    legacySnap.forEach(doc => allMembers.push(formatRow(doc.id, doc.data(), "Unregistered")))

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
    
    const membersSnap = await getDocs(collection(db, "members"))
    membersSnap.forEach(doc => {
      const d = doc.data()
      let name = `${d.lastName}, ${d.firstName}`
      if (d.firstName2) name += ` & ${d.firstName2}`
      memberMap[doc.id] = name
      emailMap[doc.id] = d.email
    })

    const logsSnap = await getDocs(collection(db, "logs"))
    logsSnap.forEach(doc => {
      const d = doc.data()
      exportData.push({
        LogID: doc.id,
        Type: "Active",
        MemberEmail: emailMap[d.memberId] || "",
        MemberName: memberMap[d.memberId] || "Unknown",
        Date: d.date,
        Activity: d.activity,
        Hours: d.hours,
        Status: d.status || "approved",
        FiscalYearRollover: d.applyToNextYear ? "Yes" : "No",
      })
    })

    const legacyMembersSnap = await getDocs(collection(db, "legacy_members"))
    const legacyPromises = legacyMembersSnap.docs.map(async (memDoc) => {
      const m = memDoc.data()
      let name = `${m.lastName}, ${m.firstName}`
      if (m.firstName2) name += ` & ${m.firstName2}`
      
      const subLogsSnap = await getDocs(collection(db, "legacy_members", memDoc.id, "legacyLogs"))
      subLogsSnap.forEach(logDoc => {
        const d = logDoc.data()
        exportData.push({
          LogID: logDoc.id,
          Type: "Legacy (Unregistered)",
          MemberEmail: m.email,
          MemberName: name,
          Date: d.date,
          Activity: d.activity,
          Hours: d.hours,
          Status: d.status || "approved",
          FiscalYearRollover: d.applyToNextYear ? "Yes" : "No",
        })
      })
    })

    await Promise.all(legacyPromises)
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
        if (row.SystemID) {
          const coll = row.Status === 'Active' ? "members" : "legacy_members"
          const docRef = doc(db, coll, row.SystemID)
          
          batch.set(docRef, {
            firstName: row.FirstName,
            lastName: row.LastName,
            firstName2: row.FirstName2,
            lastName2: row.LastName2,
            email: row.Email,
            phone: row.Phone,
            cellPhone: row.Cell,
            workPhone: row.WorkPhone,
            address: row.Address,
            city: row.City,
            state: row.State,
            zip: row.Zip,
            membershipType: row.MembershipType,
            role: row.Role,
            joinedDate: row.Joined,
            breeds: row.Breeds,
            occupation: row.Occupation,
            interests: row.Interests,
            activities: {
              agility: row.Agility === "Y",
              obedience: row.Obedience === "Y",
              rally: row.Rally === "Y",
              flyball: row.Flyball === "Y",
              freestyle: row.Freestyle === "Y",
              conformation: row.Conformation === "Y",
              earthdog: row.Earthdog === "Y"
            }
          }, { merge: true })
          count++
        } else if (row['e-mail address']) {
           const email = row['e-mail address']
           const cleanId = email.trim().toLowerCase()
           const docRef = doc(db, "legacy_members", cleanId)
           batch.set(docRef, {
             legacyKey: parseInt(row['Key']),
             email: email.trim().toLowerCase(),
             firstName: row['FirstName'],
             lastName: row['LastName'],
             membershipType: row['Member Type'] || 'Regular',
             importedAt: new Date(),
           }, { merge: true })
           count++
        }
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

      const legacySnap = await getDocs(collection(db, "legacy_members"))
      const keyMap = {} 
      legacySnap.forEach(d => { if(d.data().legacyKey) keyMap[d.data().legacyKey.toString()] = d.id })

      const activeSnap = await getDocs(collection(db, "members"))
      const emailMap = {}
      activeSnap.forEach(d => emailMap[d.data().email] = d.id)

      for (const row of rows) {
        if (row.LogID && row.MemberEmail) {
          if (row.Type && row.Type.includes("Legacy")) {
             const legacyParentId = Object.keys(keyMap).find(key => keyMap[key] === row.MemberEmail) || legacySnap.docs.find(d => d.data().email === row.MemberEmail)?.id
             
             if (legacyParentId) {
               const logRef = doc(db, "legacy_members", legacyParentId, "legacyLogs", row.LogID)
               batch.set(logRef, {
                 date: row.Date,
                 activity: row.Activity,
                 hours: parseFloat(row.Hours),
                 status: row.Status,
                 applyToNextYear: row.FiscalYearRollover === "Y"
               })
               count++
             }
          } else {
             const logRef = doc(db, "logs", row.LogID)
             batch.set(logRef, {
               memberId: emailMap[row.MemberEmail] || row.MemberEmail, 
               date: row.Date,
               activity: row.Activity,
               hours: parseFloat(row.Hours),
               status: row.Status,
               applyToNextYear: row.FiscalYearRollover === "Y"
             }, { merge: true })
             count++
          }
        } else if (row['Key']) {
           const rawKey = row['Key']
           const memberKey = parseInt(rawKey).toString() 
           const memberDocID = keyMap[memberKey]

           if (memberDocID) {
             const newLogRef = doc(collection(db, "legacy_members", memberDocID, "legacyLogs"))
             batch.set(newLogRef, {
               date: row['When'],
               activity: row['Description'],
               hours: parseFloat(row['Hours']) || 0,
               importedAt: new Date()
             })
             count++
           }
        }
      }

      await batch.commit()
      status.value = `Imported/Updated ${count} log entries.`
      loading.value = false
    }
  })
}

const handleClearLegacy = async () => {
  if (!window.confirm("This will DELETE ALL 'legacy_members'. Are you sure?")) return
  loading.value = true
  status.value = "Deleting..."
  const snapshot = await getDocs(collection(db, "legacy_members"))
  const batch = writeBatch(db)
  snapshot.docs.forEach((doc) => batch.delete(doc.ref))
  await batch.commit()
  status.value = `Deleted ${snapshot.size} legacy records.`
  loading.value = false
}
</script>

<template>
  <div class="p-6 border-2 border-dashed border-gray-300 rounded bg-gray-50 my-8">
    <h2 className="text-xl font-bold mb-4">Admin: Data Tools</h2>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 border-b border-gray-200 pb-6">
      <div>
        <h3 className="font-bold mb-2 text-blue-800">Export Data (Backup)</h3>
        <div className="flex gap-2">
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
        <h3 className="font-bold mb-2">1. Import Members</h3>
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
        <h3 className="font-bold mb-2">2. Import Work Credits</h3>
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
    
    <div class="mt-6 pt-6 border-t text-right">
      <h3 className="font-bold mb-2 text-red-600">Danger Zone</h3>
      <button 
        @click="handleClearLegacy"
        :disabled="loading"
        class="bg-red-100 text-red-700 px-4 py-2 rounded hover:bg-red-200 disabled:opacity-50"
      >
        Clear All Legacy Data
      </button>
    </div>
    
    <p v-if="status" class="mt-4 font-mono text-sm bg-white p-2 border">{{ status }}</p>
  </div>
</template>