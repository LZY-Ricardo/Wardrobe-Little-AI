const getDateParts = (input = new Date(), timeZone = 'Asia/Shanghai') => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(input instanceof Date ? input : new Date(input))
  return {
    year: parts.find((part) => part.type === 'year')?.value,
    month: parts.find((part) => part.type === 'month')?.value,
    day: parts.find((part) => part.type === 'day')?.value,
  }
}

export const getTodayInChina = () => {
  const { year, month, day } = getDateParts(new Date(), 'Asia/Shanghai')
  return `${year}-${month}-${day}`
}
