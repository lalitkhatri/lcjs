export const localData = (
  exchange: string,
  symbol: string,
  freq: string
) => {
	  console.log(`Fetching local data for: ${exchange} - ${symbol} - ${freq}`)
      return fetch(`/timeseries/${exchange}/${symbol}/${freq}`)
        .then((response) => response.json())
}
