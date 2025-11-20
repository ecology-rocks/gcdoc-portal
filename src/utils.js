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
  // 1. Determine which Fiscal Year we are currently in based on TODAY
  const currentFiscalYear = getFiscalYear(new Date().toISOString()); // e.g., 2026

  const relevantLogs = logs.filter(l => {
    if (!l.date) return false;
    
    const logFiscalYear = getFiscalYear(l.date);
    
    // Case A: The log naturally falls in this fiscal year
    if (logFiscalYear === currentFiscalYear) return true;

    // Case B: The log is from the previous year, but Admin marked it to roll over
    if (l.applyToNextYear && logFiscalYear === (currentFiscalYear - 1)) return true;

    return false;
  });

  // 2. Sum hours
  const totalHours = relevantLogs.reduce((sum, log) => sum + (parseFloat(log.hours) || 0), 0);

  // 3. Reward Logic
  let vouchers = 0;
  if (totalHours >= 50) {
    vouchers = Math.floor(totalHours / 25);
  }

  let membershipStatus = "Standard Dues";
  if (totalHours >= 50) {
    membershipStatus = "Reduced Dues Qualified";
  }

  return { totalHours, vouchers, membershipStatus, year: currentFiscalYear };
}