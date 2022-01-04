export const localData = (
  symbol: string,
  freq: string
) => {
	  console.log(`Fetching local data for: ${symbol} - ${freq}`)
      return fetch(`/timeseries/${symbol}/${freq}`)
        .then((response) => response.json())
}
