// src/utils.js

export function getFiscalYear(dateString) {
  if (!dateString) return 0;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 0; 
  const year = date.getFullYear();
  const month = date.getMonth(); 
  return month >= 9 ? year + 1 : year;
}

export function calculateRewards(logs) {
  // 1. Determine Fiscal Year (Same as before)
  const currentFiscalYear = getFiscalYear(new Date().toISOString());

  const relevantLogs = logs.filter(l => {
    if (!l.date) return false;
    const logFiscalYear = getFiscalYear(l.date);
    
    // Include if in current fiscal year OR flagged for rollover from previous
    if (logFiscalYear === currentFiscalYear) return true;
    if (l.applyToNextYear && logFiscalYear === (currentFiscalYear - 1)) return true;
    return false;
  });

  // 2. Sum hours
  const totalHours = relevantLogs.reduce((sum, log) => sum + (parseFloat(log.hours) || 0), 0);

  // 3. Voucher Logic 
  // 50 hrs / 25 = 2 vouchers. 75 / 25 = 3 vouchers. Logic holds.
  let vouchers = 0;
  if (totalHours >= 50) {
    vouchers = Math.floor(totalHours / 25);
  }

  // 4. Dues Logic (Updated)
  let membershipStatus = "Standard Dues"; // Default (< 20 hours)
  
  if (totalHours >= 50) {
    membershipStatus = "$15 (Max Discount)";
  } else if (totalHours >= 40) {
    membershipStatus = "$30 Dues";
  } else if (totalHours >= 30) {
    membershipStatus = "$40 Dues";
  } else if (totalHours >= 20) {
    membershipStatus = "$50 Dues";
  }

  return { totalHours, vouchers, membershipStatus, year: currentFiscalYear };
}