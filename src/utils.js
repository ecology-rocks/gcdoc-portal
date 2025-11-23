export function getFiscalYear(dateString) {
  if (!dateString) return 0;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 0; 
  const year = date.getFullYear();
  const month = date.getMonth(); 
  return month >= 9 ? year + 1 : year;
}

// Now accepts membershipType
export function calculateRewards(logs, membershipType = "Regular") {
  const currentFiscalYear = getFiscalYear(new Date().toISOString());

  // 1. Filter Logs
  const relevantLogs = logs.filter(l => {
    if (!l.date) return false;
    const logFiscalYear = getFiscalYear(l.date);
    if (logFiscalYear === currentFiscalYear) return true;
    if (l.applyToNextYear && logFiscalYear === (currentFiscalYear - 1)) return true;
    return false;
  });

  // 2. Sum hours
  const totalHours = relevantLogs.reduce((sum, log) => sum + (parseFloat(log.hours) || 0), 0);

  // 3. Voucher Logic
  let vouchers = 0;
  if (totalHours >= 50) {
    vouchers = Math.floor(totalHours / 25);
  }

  // 4. Dues Logic
  const type = (membershipType || "").toLowerCase();
  
  // CASE A: Lifetime (Free)
  if (type.includes("lifetime")) {
    return { totalHours, vouchers, membershipStatus: "$0 (Lifetime)", year: currentFiscalYear };
  }

  // CASE B: Associate ($15 flat)
  if (type.includes("associate")) {
    return { totalHours, vouchers, membershipStatus: "$15 (Associate)", year: currentFiscalYear };
  }

  // CASE C: Applicant (Special Logic)
  // < 10 hours: Not eligible yet
  // >= 10 hours: Ready for vote
  if (type.includes("applicant")) {
    if (totalHours >= 10) {
      return { totalHours, vouchers, membershipStatus: "Can Be Voted In", year: currentFiscalYear };
    } else {
      return { totalHours, vouchers, membershipStatus: "Not Eligible", year: currentFiscalYear };
    }
  }

  // CASE D: Regular Calculation
  let duesText = "Standard";
  let baseAmount = null;

  if (totalHours >= 50) {
    duesText = "$15";
    baseAmount = 15;
  } else if (totalHours >= 40) {
    duesText = "$30";
    baseAmount = 30;
  } else if (totalHours >= 30) {
    duesText = "$40";
    baseAmount = 40;
  } else if (totalHours >= 20) {
    duesText = "$50";
    baseAmount = 50;
  } else {
    duesText = "Standard"; 
    baseAmount = null; 
  }

  // CASE E: Family/Household Surcharge (Add $10 to base)
  if (type.includes("family") || type.includes("household")) {
    if (baseAmount !== null) {
       duesText = `$${baseAmount + 10}`;
    } else {
       duesText = "Standard + $10";
    }
  }

  const membershipStatus = duesText.includes("Standard") || duesText.includes("Voted") || duesText.includes("Eligible") 
    ? duesText 
    : `${duesText} Dues`;

  return { totalHours, vouchers, membershipStatus, year: currentFiscalYear };
}