/**
 * Calculates the percentage change between two numbers
 * @param current Current value
 * @param previous Previous value
 * @returns Percentage change as a number
 */
export const calculatePercentageChange = (current: number, previous: number): number => {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0 && current > 0) return 100;
  if (previous === 0) return 0;
  
  return ((current - previous) / previous) * 100;
};

/**
 * Formats a percentage change value with a + or - sign
 * @param value The percentage change value
 * @returns Formatted string with sign and fixed decimal places
 */
export const formatPercentageChange = (value: number): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}; 