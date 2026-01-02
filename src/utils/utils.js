import Papa from 'papaparse'

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

export function parseDateSafe(val) {
  if (!val) return new Date(0);
  if (val.toDate && typeof val.toDate === 'function') return val.toDate(); // Firestore
  
  const str = String(val).trim();
  // Handle ISO YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) return new Date(`${str}T12:00:00`);
  
  // Handle US format M/D/YYYY or MM/DD/YYYY
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const m = parts[0].padStart(2, '0');
      const d = parts[1].padStart(2, '0');
      const y = parts[2];
      // Handle legacy YYYY/MM/DD if necessary
      if (parts[0].length === 4) return new Date(`${parts[0]}-${parts[1]}-${parts[2]}T12:00:00`);
      return new Date(`${y}-${m}-${d}T12:00:00`);
    }
  }
  
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

export function formatDateStandard(val) {
  const d = parseDateSafe(val);
  if (isNaN(d.getTime()) || d.getFullYear() === 1970) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function downloadCSV(data, filename) {
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}