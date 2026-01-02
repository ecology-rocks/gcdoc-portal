<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, writeBatch } from "firebase/firestore"
import { db } from '@/firebase'
import { can } from '@/utils/permissions' // Using your new alias
import QuickMemberSearch from '@modules/members/QuickMemberSearch.vue'

const props = defineProps({
    currentUser: Object
})

const loading = ref(false)
const classes = ref([])
const instructors = ref([])
const showModal = ref(false)
const isEditing = ref(false)
const editId = ref(null)
const allMembers = ref([])
const showPastClasses = ref(false)
const selectedSessionFilter = ref('')
const pendingStudent = ref(null) // Stores the member selected from search
const pendingDogName = ref('')   // Stores the dog name input
const selectedLocationFilter = ref('')
const showCopyModal = ref(false)
const copyForm = ref({ source: '', target: '' })
const copyLoading = ref(false)

const form = ref({
    title: '',
    session: 'Jan 2026',
    description: '',
    day: 'Tuesday',
    startTime: '18:00',
    endTime: '19:00',
    location: '',
    instructorIds: []
})

// NEW: Generate fixed sessions for Current and Next Year
const getSessionOptions = () => {
    const options = []
    const currentYear = new Date().getFullYear()
    const years = [currentYear, currentYear + 1]

    const templates = [
        "Session 1 (Jan/Feb)",
        "Session 2 (Mar/Apr)",
        "Session 3 (May/Jun)",
        "Session 4 (Aug/Sep)",
        "Session 5 (Oct/Nov)"
    ]

    years.forEach(year => {
        templates.forEach(t => options.push(`${t} ${year}`))
    })

    return options
}

const sessionOptions = getSessionOptions()

// NEW: Check if session ended based on fixed schedule
const isSessionEnded = (sessionStr) => {
    if (!sessionStr) return false

    // Extract Year
    const yearMatch = sessionStr.match(/\d{4}/)
    if (!yearMatch) return false
    const year = parseInt(yearMatch[0])

    // Map Session Number to its End Month (0-indexed: Jan=0, Feb=1, etc)
    let endMonthIndex = -1
    if (sessionStr.includes("Session 1")) endMonthIndex = 1  // Ends Feb
    else if (sessionStr.includes("Session 2")) endMonthIndex = 3  // Ends Apr
    else if (sessionStr.includes("Session 3")) endMonthIndex = 5  // Ends Jun
    else if (sessionStr.includes("Session 4")) endMonthIndex = 8  // Ends Sep
    else if (sessionStr.includes("Session 5")) endMonthIndex = 10 // Ends Nov

    if (endMonthIndex === -1) return false

    // Date is End of Month (day 0 of next month)
    const sessionEnd = new Date(year, endMonthIndex + 1, 0, 23, 59, 59)

    return new Date() > sessionEnd
}

const fetchData = async () => {
    loading.value = true
    try {
        const q = query(collection(db, "classes"), orderBy("session"), orderBy("day"))
        const snap = await getDocs(q)
        classes.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))

        // FETCH ALL MEMBERS (Don't filter by role, or name lookup will fail for regular members)
        const memSnap = await getDocs(collection(db, "members"))
        instructors.value = memSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""))

        // --- FIX: Assign to allMembers, not instructors ---
        allMembers.value = memSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""))
    } catch (err) {
        console.error("Error loading catalog:", err)
    }
    loading.value = false
}

const uniqueLocations = computed(() => {
    const locs = new Set(classes.value.map(c => c.location).filter(Boolean))
    return Array.from(locs).sort()
})

// NEW: Get unique sessions for the filter dropdown
const uniqueSessions = computed(() => {
    const sessions = new Set(classes.value.map(c => c.session).filter(Boolean))
    return Array.from(sessions).sort()
})

// NEW: Main Filter Logic
const filteredClasses = computed(() => {
    return classes.value.filter(cls => {
        const ended = isSessionEnded(cls.session)

        // 1. Past/Present
        if (!showPastClasses.value && ended) return false

        // 2. Session Name
        if (selectedSessionFilter.value && cls.session !== selectedSessionFilter.value) return false

        // 3. NEW: Location Filter
        if (selectedLocationFilter.value && cls.location !== selectedLocationFilter.value) return false

        return true
    })
})

// NEW: Bulk Copy Logic
const openCopyModal = () => {
    copyForm.value = { source: '', target: '' }
    showCopyModal.value = true
}

const handleCopySession = async () => {
    if (!copyForm.value.source || !copyForm.value.target) return alert("Select both sessions.")
    if (copyForm.value.source === copyForm.value.target) return alert("Source and Target cannot be the same.")

    copyLoading.value = true
    try {
        // 1. Get classes from Source Session
        const q = query(collection(db, "classes"), where("session", "==", copyForm.value.source))
        const snap = await getDocs(q)

        if (snap.empty) throw new Error("No classes found in source session.")

        // 2. Prepare Batch
        const batch = writeBatch(db)
        let count = 0

        snap.docs.forEach(docSnap => {
            const sourceData = docSnap.data()

            // Create ref for new doc
            const newRef = doc(collection(db, "classes"))

            // Copy data but SWAP session and CLEAR roster/notes
            batch.set(newRef, {
                ...sourceData,
                session: copyForm.value.target, // The new session
                roster: [], // Start fresh
                createdAt: new Date(),
                updatedAt: new Date(),
                // We KEEP title, instructors, location, day, time, etc.
            })
            count++
        })

        // 3. Commit
        await batch.commit()

        alert(`Successfully copied ${count} classes to ${copyForm.value.target}!`)
        showCopyModal.value = false
        fetchData() // Refresh list

    } catch (err) {
        console.error(err)
        alert("Error copying classes: " + err.message)
    }
    copyLoading.value = false
}

const openCreate = () => {
    isEditing.value = false

    // Auto-select the first session that hasn't ended yet
    const defaultSession = sessionOptions.find(s => !isSessionEnded(s)) || sessionOptions[0]

    form.value = {
        title: '',
        session: defaultSession, // CHANGED: Smart default
        description: '',
        day: 'Tuesday',
        startTime: '18:00',
        endTime: '19:00',
        location: '',
        roster: [], // Ensure roster array exists
        instructorIds: []
    }
    showModal.value = true
}

const openEdit = (cls) => {
    isEditing.value = true
    editId.value = cls.id
    form.value = {
        ...cls,
        instructorIds: cls.instructors || [],
        roster: cls.roster || [] // Default to empty array if missing
    }
    showModal.value = true
}

// NEW: Roster Actions
const selectStudentToAdd = (member) => {
    // Check if already in roster to prevent duplicates
    const exists = form.value.roster.some(r => r.studentId === member.id)
    if (exists) {
        alert(`${member.firstName} is already in this class.`)
        return
    }

    pendingStudent.value = member
    pendingDogName.value = '' // Reset dog name
}

const confirmAddStudent = () => {
    if (!pendingStudent.value) return
    if (!pendingDogName.value.trim()) {
        alert("Please enter a dog name.")
        return
    }

    // Add structured object to roster array
    form.value.roster.push({
        studentId: pendingStudent.value.id,
        studentName: `${pendingStudent.value.firstName} ${pendingStudent.value.lastName}`,
        studentEmail: pendingStudent.value.email,
        dogName: pendingDogName.value,
        instructorNotes: '' // Initialize empty notes
    })

    // Reset pending state
    pendingStudent.value = null
    pendingDogName.value = ''
}

const removeStudent = (index) => {
    if (confirm("Remove this student from the roster?")) {
        form.value.roster.splice(index, 1)
    }
}

// Handler for the QuickMemberSearch component
const addInstructor = (member) => {
    // Prevent duplicates
    if (!form.value.instructorIds.includes(member.id)) {
        form.value.instructorIds.push(member.id)
    }
}

const removeInstructor = (id) => {
    form.value.instructorIds = form.value.instructorIds.filter(i => i !== id)
}

const handleDelete = async (id) => {
    if (!confirm("Delete this class? Roster data will be lost.")) return
    await deleteDoc(doc(db, "classes", id))
    classes.value = classes.value.filter(c => c.id !== id)
}

const handleSave = async () => {
    const payload = {
        ...form.value,
        instructors: form.value.instructorIds,
        updatedAt: new Date()
    }
    delete payload.instructorIds

    try {
        if (isEditing.value) {
            await updateDoc(doc(db, "classes", editId.value), payload)
        } else {
            payload.createdAt = new Date()
            payload.roster = []
            await addDoc(collection(db, "classes"), payload)
        }
        showModal.value = false
        fetchData()
    } catch (err) {
        alert("Error saving: " + err.message)
    }
}

const getInstructorNames = (ids) => {
    if (!ids || !ids.length) return "TBD"
    return ids.map(id => {
        const m = instructors.value.find(i => i.id === id)
        return m ? `${m.firstName} ${m.lastName}` : 'Unknown'
    }).join(", ")
}

// Helper to get single name for the tag display
const getOneName = (id) => {
    // tailored to look inside allMembers
    const m = allMembers.value.find(i => i.id === id)
    return m ? `${m.firstName} ${m.lastName}` : 'Unknown'
}
onMounted(fetchData)
</script>

<template>
    <div class="p-6">
        <div class="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
            <h1 class="text-2xl font-bold text-gray-800">Course Catalog</h1>
        </div>
        <div class="flex flex-wrap items-center gap-3 w-full xl:w-auto">
            <div class="flex flex-col sm:flex-row sm:items-center gap-1">
                <label class="text-xs font-bold text-gray-500 uppercase">Session:</label>
                <select v-model="selectedSessionFilter"
                    class="border rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">All Sessions</option>
                    <option v-for="s in uniqueSessions" :key="s" :value="s">{{ s }}</option>
                </select>
            </div>

            <div class="flex flex-col sm:flex-row sm:items-center gap-1">
                <label class="text-xs font-bold text-gray-500 uppercase">Location:</label>
                <select v-model="selectedLocationFilter"
                    class="border rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">All Locations</option>
                    <option v-for="loc in uniqueLocations" :key="loc" :value="loc">{{ loc }}</option>
                </select>
            </div>

            <label
                class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none border-l pl-3 ml-1 border-gray-300">
                <input type="checkbox" v-model="showPastClasses" class="rounded text-blue-600 focus:ring-0" />
                <span class="text-xs font-bold uppercase">Show Past</span>
            </label>
        </div>
        <div class="flex flex-col sm:flex-row sm:items-center gap-1 pt-3"></div>
        <div class="flex items-center gap-3 w-full xl:w-auto border-t xl:border-t-0 pt-3 xl:pt-0 border-gray-200">
            <button @click="openCopyModal"
                class="flex-1 xl:flex-none bg-purple-100 text-purple-700 border border-purple-200 px-3 py-1.5 rounded font-bold hover:bg-purple-200 text-sm flex items-center justify-center gap-2 transition-colors">
                <span>❐</span> Copy Session
            </button>

            <button @click="openCreate"
                class="flex-1 xl:flex-none bg-blue-600 text-white px-4 py-1.5 rounded font-bold hover:bg-blue-700 text-sm shadow flex items-center justify-center gap-2 transition-colors">
                <span>+</span> New Class
            </button>
        </div>
    </div>

    <div v-if="loading" class="text-gray-500 animate-pulse">Loading classes...</div>

    <div v-else class="grid gap-4">
        <div v-for="cls in filteredClasses" :key="cls.id"
            class="bg-white p-4 rounded shadow border-l-4 flex justify-between items-start transition-opacity"
            :class="isSessionEnded(cls.session) ? 'border-gray-400 opacity-75' : 'border-blue-500'">
            <div>
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-bold uppercase bg-gray-100 px-2 py-1 rounded text-gray-600">{{
                        cls.session }}</span>
                    <span v-if="isSessionEnded(cls.session)"
                        class="text-[10px] font-bold uppercase bg-red-100 text-red-600 px-2 py-1 rounded border border-red-200">
                        Ended
                    </span>
                    <span class="text-xs font-bold uppercase bg-blue-50 px-2 py-1 rounded text-blue-600">{{ cls.day
                    }}s</span>
                </div>
                <h3 class="font-bold text-lg text-gray-800">{{ cls.title }}</h3>
                <p class="text-sm text-gray-600 mb-2">
                    {{ cls.startTime }} - {{ cls.endTime }} @ {{ cls.location }}
                </p>
                <p class="text-xs text-gray-500">
                    <strong>Instructors:</strong> {{ getInstructorNames(cls.instructors) }}
                </p>
            </div>

            <div class="flex flex-col gap-2">
                <button @click="openEdit(cls)"
                    class="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded font-bold text-gray-700">Edit
                    Details</button>
                <button @click="handleDelete(cls.id)"
                    class="text-sm text-red-500 hover:text-red-700 hover:underline">Delete</button>
            </div>
        </div>
    </div>

    <div v-if="showModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
            <div class="bg-blue-600 p-4 text-white font-bold flex justify-between">
                <span>{{ isEditing ? 'Edit Class' : 'New Class' }}</span>
                <button @click="showModal = false">✕</button>
            </div>
            <div class="p-6 space-y-4 max-h-[80vh] overflow-y-auto">

                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Class Title</label>
                    <input v-model="form.title" class="w-full border rounded p-2" placeholder="e.g. Beginner Novice" />
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Session</label>
                        <select v-model="form.session" class="w-full border rounded p-2 bg-white">
                            <option disabled value="">Select Session</option>
                            <option v-if="isEditing && !sessionOptions.includes(form.session)" :value="form.session">
                                {{ form.session }} (Legacy)
                            </option>
                            <option v-for="opt in sessionOptions" :key="opt" :value="opt">
                                {{ opt }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Day of Week</label>
                        <select v-model="form.day" class="w-full border rounded p-2 bg-white">
                            <option>Monday</option>
                            <option>Tuesday</option>
                            <option>Wednesday</option>
                            <option>Thursday</option>
                            <option>Friday</option>
                            <option>Saturday</option>
                            <option>Sunday</option>
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Start Time</label>
                        <input type="time" v-model="form.startTime" class="w-full border rounded p-2" />
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">End Time</label>
                        <input type="time" v-model="form.endTime" class="w-full border rounded p-2" />
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Location</label>
                    <select v-model="form.location" class="w-full border rounded p-2 bg-white">
                        <option value="" disabled>-- Select Location --</option>
                        <option>The Land</option>
                        <option>Northcutt - Front Room</option>
                        <option>Northcutt - Agility Room</option>
                    </select>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Instructors</label>

                    <QuickMemberSearch @select="addInstructor" class="mb-2" />

                    <div class="flex flex-wrap gap-2 min-h-[40px] p-2 border rounded bg-gray-50">
                        <span v-if="form.instructorIds.length === 0" class="text-sm text-gray-400 italic">No
                            instructors selected</span>

                        <div v-for="id in form.instructorIds" :key="id"
                            class="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded flex items-center gap-2">
                            <span>{{ getOneName(id) }}</span>
                            <button @click="removeInstructor(id)"
                                class="text-blue-500 hover:text-red-500 font-bold">×</button>
                        </div>
                    </div>
                </div>

                <div class="border-t pt-4 mt-4">
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Class Roster ({{
                        form.roster.length }})</label>

                    <div v-if="form.roster.length > 0" class="space-y-2 mb-4">
                        <div v-for="(student, idx) in form.roster" :key="idx"
                            class="flex justify-between items-center bg-gray-50 p-2 rounded border">
                            <div>
                                <div class="font-bold text-sm text-gray-800">{{ student.studentName }}</div>
                                <div class="text-xs text-gray-500">Dog: {{ student.dogName }}</div>
                            </div>
                            <button @click="removeStudent(idx)"
                                class="text-red-500 hover:text-red-700 text-xs font-bold px-2">
                                Remove
                            </button>
                        </div>
                    </div>
                    <div v-else class="text-sm text-gray-400 italic mb-4">
                        No students enrolled yet.
                    </div>

                    <div class="bg-blue-50 p-3 rounded border border-blue-100">
                        <label class="block text-xs font-bold text-blue-800 mb-1">Add Student</label>

                        <div v-if="!pendingStudent">
                            <QuickMemberSearch @select="selectStudentToAdd" placeholder="Search member to enroll..." />
                        </div>

                        <div v-else class="flex flex-col gap-2">
                            <div class="flex justify-between items-center text-sm font-bold text-gray-700">
                                <span>Selected: {{ pendingStudent.firstName }} {{ pendingStudent.lastName }}</span>
                                <button @click="pendingStudent = null"
                                    class="text-xs text-gray-500 underline">Cancel</button>
                            </div>

                            <div class="flex gap-2">
                                <input v-model="pendingDogName" placeholder="Dog's Name"
                                    class="flex-1 border rounded p-1 text-sm" @keyup.enter="confirmAddStudent" />
                                <button @click="confirmAddStudent"
                                    class="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded hover:bg-blue-700">
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                    <textarea v-model="form.description" rows="3" class="w-full border rounded p-2"></textarea>
                </div>

                <div class="flex justify-end gap-2 pt-4 border-t">
                    <button @click="showModal = false" class="px-4 py-2 text-gray-500 font-bold">Cancel</button>
                    <button @click="handleSave"
                        class="px-6 py-2 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700">
                        Save Class
                    </button>
                </div>

            </div>
        </div>
    </div>

    <div v-if="showCopyModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div class="bg-purple-600 p-4 text-white font-bold flex justify-between">
                <span>Copy Classes to New Session</span>
                <button @click="showCopyModal = false">✕</button>
            </div>

            <div class="p-6 space-y-4">
                <p class="text-sm text-gray-600">
                    This will duplicate all classes from the source session into the target session.
                    <strong>Instructors are kept, but Rosters are cleared.</strong>
                </p>

                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Source (Copy From)</label>
                    <select v-model="copyForm.source" class="w-full border rounded p-2 bg-white">
                        <option disabled value="">Select Source...</option>
                        <option v-for="s in uniqueSessions" :key="s" :value="s">{{ s }}</option>
                    </select>
                </div>

                <div class="flex justify-center text-gray-400">⬇️</div>

                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Target (Copy To)</label>
                    <select v-model="copyForm.target" class="w-full border rounded p-2 bg-white">
                        <option disabled value="">Select Target...</option>
                        <option v-for="opt in sessionOptions" :key="opt" :value="opt">{{ opt }}</option>
                    </select>
                </div>

                <div class="flex justify-end gap-2 pt-4 border-t">
                    <button @click="showCopyModal = false" class="px-4 py-2 text-gray-500 font-bold">Cancel</button>
                    <button @click="handleCopySession" :disabled="copyLoading"
                        class="px-6 py-2 bg-purple-600 text-white font-bold rounded shadow hover:bg-purple-700 disabled:opacity-50">
                        {{ copyLoading ? 'Copying...' : 'Confirm Copy' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>