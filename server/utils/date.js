const pad = (value) => String(value).padStart(2, '0')

const formatDateInTimezone = (input = new Date(), timeZone = 'Asia/Shanghai') => {
  const date = input instanceof Date ? input : new Date(input)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${year}-${pad(month)}-${pad(day)}`
}

const getTodayInChina = () => formatDateInTimezone(new Date(), 'Asia/Shanghai')

module.exports = {
  formatDateInTimezone,
  getTodayInChina,
}
