<script setup>
import { ref } from 'vue'
import { collection, addDoc } from "firebase/firestore"
import { db } from '../../firebase'

const emit = defineEmits(['cancel', 'success'])

const newFirstName = ref('')
const newLastName = ref('')
const newEmail = ref('')
const newPhone = ref('')
const agreedToWaiver = ref(false)

const handleQuickRegister = async () => {
  if (!newFirstName.value || !newLastName.value) return alert("Name is required.")
  if (!newEmail.value && !newPhone.value) return alert("Please provide either an Email or Phone Number.")
  
  if (!agreedToWaiver.value) {
    return alert("You must agree to the liability waiver to volunteer.")
  }

  try {
    const newDoc = await addDoc(collection(db, "legacy_members"), {
      firstName: newFirstName.value.trim(),
      lastName: newLastName.value.trim(),
      email: newEmail.value.trim(),
      phone: newPhone.value.trim(),
      
      "Member Type": "Non-Member", 
      membershipType: "Non-Member",
      
      role: "member",
      status: "Active",
      createdAt: new Date(),
      
      waiverSigned: true,
      waiverDate: new Date(),
      waiverVersion: "v1.0 (Digital Kiosk)" 
    })

    const newUserObj = {
      id: newDoc.id,
      realId: newDoc.id,
      firstName: newFirstName.value.trim(),
      lastName: newLastName.value.trim(),
      type: 'legacy'
    }
    emit('success', newUserObj)
  } catch (err) {
    alert("Error registering: " + err.message)
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 h-[80vh] flex flex-col">
    <h2 class="text-3xl font-bold text-white mb-6 flex-shrink-0">New Volunteer Info</h2>
    
    <div class="flex-1 overflow-y-auto pr-2">
      
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label class="block text-slate-400 mb-1">First Name</label>
          <input v-model="newFirstName" class="w-full p-3 bg-slate-900 border border-slate-600 rounded text-lg focus:border-blue-500 outline-none" placeholder="Jane" />
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Last Name</label>
          <input v-model="newLastName" class="w-full p-3 bg-slate-900 border border-slate-600 rounded text-lg focus:border-blue-500 outline-none" placeholder="Doe" />
        </div>
      </div>
      
      <p class="text-slate-500 text-sm mb-2 italic">Please provide at least one method of contact:</p>
      
      <div class="mb-4">
        <label class="block text-slate-400 mb-1">Email</label>
        <input v-model="newEmail" class="w-full p-3 bg-slate-900 border border-slate-600 rounded text-lg focus:border-blue-500 outline-none" placeholder="jane@example.com" />
      </div>

      <div class="mb-6">
        <label class="block text-slate-400 mb-1">Phone Number</label>
        <input v-model="newPhone" class="w-full p-3 bg-slate-900 border border-slate-600 rounded text-lg focus:border-blue-500 outline-none" placeholder="555-0199" />
      </div>

      <div class="mb-6 border-t border-slate-700 pt-6">
        <h3 class="text-white font-bold mb-2 uppercase text-sm">Liability Waiver</h3>
        
        <div class="bg-slate-900 p-4 rounded border border-slate-600 h-60 overflow-y-scroll text-sm text-slate-300 mb-4 leading-relaxed">
           <p class="mb-4 font-bold text-white text-center">Gem City Dog Obedience Club, Inc.<br>Waiver of Claims, Assumption of Risk, and Acceptance of Financial Responsibility Agreement</p>
           
           <p class="mb-2">
             We/I, the undersigned, hereby acknowledge we/I have voluntarily taken a class or applied for membership, which may include dog owner/handler training or related services, or access to any property owned, leased or rented by the Gem City Dog Obedience Club, Inc.
           </p>

           <p class="mb-2">
             We/I understand and recognize that the Gem City Dog Obedience Club, Inc., is an all-volunteer, non-profit community service organization of individual dog owners dedicated to helping other dog owners learn about responsible dog ownership and canine good citizenship. We/I further understand and recognize that the Gem City Dog Obedience Club, Inc., is not, and does not purport to be, an organization of “professional” dog trainers, and that the instructors supplied are strictly amateur, unpaid volunteers, and are not professionals in the field of dog training, or in the field of real property improvement or maintenance.
           </p>

           <p class="mb-2">
             We/I further understand that real property owned or used by said Gem City Dog Obedience Club, Inc., is maintained on an all-volunteer basis, and does not purport to be free from hazards. We/I understand that use of said Club’s property, as well as participation in dog owner/handler training, or related classes, will necessarily expose the participants to certain risks. We/I understand that there are hazards on the said property, including, but not limited to, uneven and irregular terrain. We/I also understand that wildlife may inhabit said property, that the wildlife may carry rabies or other diseases, and that there may be several wildlife holes, tunnels, dens, and excavations, including, but not limited to, ground hog burrows. We/I am aware of the existence of these hazards.
           </p>

           <p class="mb-2">
             We/I fully understand these risks include, but are not limited to, the following representative examples, which are not intended to be all-inclusive: the risks of being bitten, clawed or tripped by either a wild animal, or a feral or domesticated dog, on said property, or of tripping or falling into a wild life excavation, burrow, tunnel, den, or hole; the risk of encountering vegetation which may stimulate an allergic reaction, e.g., poison oak or poison ivy; the risks of the owner/handler being bitten, scratched, soiled, tripped, yanked, jerked, attacked, frightened, or otherwise injured by wildlife, or by other dogs on the property or in the classes, or by the owner/handler’s own dog; the risks of tripping over or slipping upon the ground or floor matting, dogs, or dog training related objects, or slipping on dog drool or dog solid or liquid waste matter, or colliding with dogs, other human participants, dog training props, dog jumps, dog obstacles, dog gating or building parts, including, but not limited to, walls, doors, and support beams.
           </p>

           <p class="mb-2">
             We/I are/am fully aware that such risks exist, and voluntarily, freely, and knowingly assume all such risks, whether or not specifically enumerated above. In partial consideration of the opportunity to use the said Club’s property for dog owner/handler training classes or any other Gem City Dog Obedience Club, Inc., activities, or events or other Club or dog-related purposes, including socialization with other Members, we/I hereby agree that we/I, our/my heirs, distributees, guardians, legal representatives, and assigns will not initiate a claim or legal action against, or otherwise, sue, or attach the property of, the Gem City Dog Obedience Club, Inc., or its Officers, Directors, Instructors, or Members, for any injuries, deaths, or property damage, suffered as a result of use of said property or participation in such classes, activities, or events within the scope of the risks herewith voluntarily and knowingly assumed.
           </p>

           <p class="mb-2">
             This agreement includes, but is not limited to, our voluntary waiver of any and all claims, suits, or causes of action based on the aforestated risks here voluntarily assumed. We/I hereby release the Gem City Dog Obedience Club, Inc. from all responsibility in case of injury, death, loss or damage to ourselves/myself or our/my dog or dogs or any property which may be incurred on the Club's property, or during, before or after training sessions or any other Gem City Dog Obedience Club, Inc., sponsored classes, events, activities, or any other functions, when caused by other class, activity, event, or other function participants or their dogs, or by our/my own dog(s). We/I will not hold the Gem City Dog Obedience Club, Inc., legally or financially responsible in any such matter.
           </p>

           <p class="mb-2">
             Further, in recognition of the all-volunteer, non-profit, amateur status of the Gem City Dog Obedience Club, Inc., we/I hereby agree we/I will not hold the Gem City Dog Obedience Club, Inc., to the same standard of care as may be required under the laws of the State of Ohio for professional dog trainers or real property developers.
           </p>

           <p class="mb-2">
             Should we/I personally, or our/my dog or dogs, or our/my minor children, be the cause of any injuries, death, loss, or damage to persons using the Club's said land, or attending, viewing, or instructing the Gem City Dog Obedience Club, Inc., training sessions or any other Gem City Dog Obedience Club, Inc., sponsored activities or events, or to any property owned or leased by the Gem City Dog Obedience Club, Inc., We/I will accept full responsibility under the laws of the State of Ohio, and shall promptly and fully compensate any and all victims of such injuries, deaths, losses, or other damages to the full extent provided by the laws of the State of Ohio.
           </p>

           <p class="mb-2">
             We/I further agree to save, defend, and hold harmless the Gem City Dog Obedience Club, Inc., and its Officers, Directors, Instructors, and Members, from any claims, suits, or other actions resulting from the damages, losses, injuries, or death caused by our/my dogs, or us/personally, or our/my minor children.
           </p>

           <p class="mb-2">
             We/I further agree that, should it be necessary for the Gem City Dog Obedience Club, Inc., or its Officers, Directors, Instructors, or Members, to sue or take other legal actions in order to enforce this agreement, that we/I agree to pay all reasonable legal fees, court costs, and related costs necessitated by such enforcement action.
           </p>

           <p class="mb-2">
             We/I understand that no warranties are made with respect to condition or use of the said Club’s property, and that the Club’s training classes do not guarantee the performance or behavior of the dogs under any circumstances and are offered strictly as guidelines in order to provide a community service.
           </p>

           <p class="mb-2">
             To minimize risks to myself, my dog or dogs and others we/I agree to keep our/my dog or dogs under control at all times. We/I understand that, as a result of our voluntary assumption of risk and release of liability waivers set forth above, that any injuries, deaths, losses, or damages to ourselves/myself, our/my dog or dogs and personal property caused by wildlife or land conditions, or by another dog, or our/my own dog, shall be solely the responsibility of that dog’s owner(s) and/or handler(s), and not the Gem City Dog Obedience Club, Inc., or its Officers, Directors, Instructors, or Members.
           </p>

           <p class="mb-2">
             It is our/my intent that, regardless of my state of residence, the laws of the State of Ohio shall govern this agreement, which I intend to be legally binding. We/I agree and intend that, should any portion of this agreement be, for any reason, deemed legally unenforceable or void under the laws of the State of Ohio, the remaining portions shall nevertheless be accorded full force and effect.
           </p>

           <p class="mb-2">
             We/I hereby warrant and certify that our/my dog or dogs to use or come up the said property, or to be enrolled in training or other activities of the Gem City Dog Obedience Club, Inc., are currently, and will be kept, fully compliant with rabies and other vaccinations required by my county of residence and the State of Ohio, and my county and state of residence, if not Ohio.
           </p>

           <p class="mb-2">
             We/I agree to report immediately to the Gem City Dog Obedience Club, Inc., through its designated Registrars, Instructors, or Directors of Obedience, Agility, Conformation, or Board Members, any incident or information which may reasonably indicate our/my dog may pose a threat to the safety of humans or other dogs.
           </p>

           <p class="mb-2">
             We/I further agree that we/I will not engage in any form of attack dog training on any premises owned, leased, controlled, or used by the Gem City Dog Obedience Club, Inc.
           </p>

           <p class="font-bold">
             We/I have carefully read this waiver of claims, assumption of risk, and acceptance of financial responsibility agreement, and fully understand its contents.
           </p>
        </div>

        <label class="flex items-center gap-4 p-4 rounded-lg cursor-pointer transition-colors" 
          :class="agreedToWaiver ? 'bg-green-900/30 border border-green-600' : 'bg-slate-700 hover:bg-slate-600'">
          
          <input 
            type="checkbox" 
            v-model="agreedToWaiver" 
            class="w-8 h-8 rounded text-blue-600 focus:ring-blue-500"
          />
          <span class="text-white font-bold select-none">
            I have read and agree to the waiver above.
          </span>
        </label>
      </div>

    </div>

    <div class="mt-4 pt-4 border-t border-slate-700 flex-shrink-0">
      <button 
        @click="handleQuickRegister"
        class="w-full text-white text-xl font-bold py-4 rounded-xl shadow-lg transition-all"
        :class="agreedToWaiver ? 'bg-blue-600 hover:bg-blue-500' : 'bg-slate-600 opacity-50 cursor-not-allowed'"
        :disabled="!agreedToWaiver"
      >
        {{ agreedToWaiver ? 'Join & Continue Signing In' : 'Agree to Waiver to Continue' }}
      </button>

      <button @click="$emit('cancel')" class="w-full text-slate-400 mt-4 underline">Cancel</button>
    </div>

  </div>
</template>