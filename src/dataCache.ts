import { DataSource } from "./dataSources"
import { localData } from "./dataSources/localData"

export enum DataRange {
  Month,
  Year,
  TenYears
}

export interface DataSourceInfo {
  source: DataSource | 'worldtradingdata.com'
  apiToken?: string
}

interface OHLCWithVolume {
  close: number
  high: number
  low: number
  open: number
  volume: number
  ema20: number
  ema50: number
  ema100: number
  ema200: number
  atr: number
  stoch_K: number
  stoch_D: number
}
export type OHLCDataFormat = { [key: string]: OHLCWithVolume }

const fetchData = async (source: DataSourceInfo, symbol, freq, mode, dataRangeQuery) => {
  let dataPromise
  switch (source.source) {
    case DataSource.LocalData:
      {
        dataPromise = localData(symbol,freq)
      }
      break
    default:
      throw new Error('Unknown data source.')
  }
  return dataPromise
}

export class DataCache {
  private readonly symbol: string
  private readonly freq: string
  private readonly dataSource: DataSourceInfo
  private timeseriesData: OHLCDataFormat
  
  
  constructor(symbol: string, freq: string, dataSource: DataSourceInfo) {
    this.symbol = symbol
    this.freq = freq
    this.dataSource = dataSource
    console.log(`Created DataCache for: ${symbol}`)
  }

  async getDailyData(dataRange: DataRange): Promise<OHLCDataFormat> {
    if (this.isDailyDataValid() && this.timeseriesData) {
      const now = new Date()
      const dataRangeTime = this.freq === 'D' ? 
      	// 1 Year
      	2 * 365 * 24 * 60 * 60 * 1000 :
        // 5 Year.
        10 * 365 * 24 * 60 * 60 * 1000 
      const nBack = new Date(
        now.getTime() +
        (-dataRangeTime)
      )

      const year = nBack.getUTCFullYear()
      const month = nBack.getUTCMonth() + 1
      const date = nBack.getUTCDate()
      const date_from = `${year}-${month >= 10 ? '' : 0}${month}-${date >= 10 ? '' : 0}${date}`
      const data = {}
      // collect the data for the specified range
      Object.keys(this.timeseriesData).reverse()
        .forEach(key => {
          if (key >= date_from) {
            data[key] = this.timeseriesData[key]
          }
        })
      return data
    } else {
      // fetch and store data
      const data = await fetchData(this.dataSource, this.symbol, this.freq, 'history', undefined)

      this.timeseriesData = data
      return this.getDailyData(dataRange)
    }
  }

  isDailyDataValid(): boolean {
    return !!this.timeseriesData
  }

  
}
