// polyfill window.fetch for browsers which don't natively support it.
import 'whatwg-fetch'
import { lightningChart, emptyFill, Themes, ChartXY, LineSeries, OHLCSeriesTraditional, OHLCFigures, XOHLC, Point, AxisTickStrategies, emptyLine, AreaSeriesTypes, ColorRGBA, SolidFill, SolidLine, UIElementBuilders, CustomTick, UITextBox, UIOrigins, AreaSeriesPositive, UIDraggingModes, translatePoint, UIBackgrounds, FormattingFunctions, UITick, UIElement, AutoCursorModes, UILayoutBuilders, UIElementColumn } from "@arction/lcjs"
import { relativeStrengthIndex } from '@arction/lcjs-analysis'
import { DataSource } from './dataSources'
import { DataCache, DataRange, DataSourceInfo, OHLCDataFormat } from './dataCache'

// Use theme if provided
const urlParams = new URLSearchParams(window.location.search);
let theme = Themes.lightNew
if (urlParams.get('theme') == 'dark')
    theme = Themes.darkGold



// #region ----- General application configuration -----

// *** Data-source ***
// To run application locally, you'll need to set 'dataSource' with source: DataSource.AlphaVantage, and a valid API token.
// You can get one for free from https://www.alphavantage.co/
let dataSource: DataSourceInfo
dataSource = { source: DataSource.LocalData }
// dataSource = { source: DataSource.AlphaVantage, apiToken: 'API-KEY-HERE' }


// To disable/enable/modify charts inside application, alter values below:

const chartConfigOHLC = {
    show: true,
    verticalSpans: 3,
    /**
     * Simple Moving Average.
     */
    sma20: {
        show: false,
        averagingFrameLengthDays: 20, // history data : 13 days.
        averagingFrameLengthIntradayDays: 1 // intraday data : 1 day
    },
    sma50: {
        show: false,
        averagingFrameLengthDays: 50, // history data : 13 days.
        averagingFrameLengthIntradayDays: 1 // intraday data : 1 day
    },
    sma100: {
        show: false,
        averagingFrameLengthDays: 100, // history data : 13 days.
        averagingFrameLengthIntradayDays: 1 // intraday data : 1 day
    },
    /**
     * Exponential Moving Average.
     *
     * Uses same averagingFrameLength as above SMA.
     */
    ema20: {
        show: true,
        averagingFrameLengthDays: 20
    },
    ema50: {
        show: true,
        averagingFrameLengthDays: 50
    },
    ema100: {
        show: true,
        averagingFrameLengthDays: 100
    },
    /**
     * Bollinger Bands.
     */
    bollinger20: {
        show: true,
        averagingFrameLengthDays: 14, // history data : 13 days.
        averagingFrameLengthIntradayDays: 1 // intraday data : 1 day
    }
}
const chartConfigVolume = {
    show: true,
    verticalSpans: 1
}
const chartConfigStoch = {
    show: true,
    verticalSpans: 1,
    averagingFrameLengthDays: 14, // history data : 13 days.
    averagingFrameLengthIntradayDays: 1 // intraday data : 1 day
}

// For syncing charts horizontally (time domain), a static margin on the left side is chosen as pixels.
const leftMarginPx = 60

// #endregion

// #region ----- Find referenced DOM elements from 'index.html' -----
const domElementIDs = {
    chartContainer: 'trading-chart-container',
    dataSearchInput: 'trading-data-search-input',
    dataSearchActivate: 'trading-data-search-activate',
    dataSearchRange1: 'trading-data-search-range-1',
    dataSearchRange2: 'trading-data-search-range-2',
    dataSearchRange3: 'trading-data-search-range-3'
}
const domElements = new Map<string, HTMLElement>()
Object.keys(domElementIDs).forEach((key) => {
    const domElementID = domElementIDs[key]
    const domElement = document.getElementById(domElementID)
    if (domElement === undefined)
        throw new Error('DOM element not found: ' + domElementID)
    domElements.set(domElementID, domElement)
})

let dataRange = DataRange.Year
let freq = 'D'
domElements.get(domElementIDs.dataSearchRange1).addEventListener('change', () => dataRange = DataRange.Month)
domElements.get(domElementIDs.dataSearchRange2).addEventListener('change', () => dataRange = DataRange.Year)
domElements.get(domElementIDs.dataSearchRange3).addEventListener('change', () => dataRange = DataRange.TenYears)

//#endregion

// #region ----- Create LCJS components ----

// Dashboard
const chartConfigs = [chartConfigOHLC, chartConfigVolume, chartConfigStoch]
const countRowIndexForChart = (chartIndex: number) => chartConfigs.reduce(
    (sum, chartConfig, i) => sum + (chartConfig.show && i < chartIndex ? chartConfig.verticalSpans : 0),
    0
)

const dashboard = lightningChart().Dashboard({
    theme,
    container: domElementIDs.chartContainer,
    numberOfColumns: 1,
    numberOfRows: countRowIndexForChart(chartConfigs.length),
    disableAnimations: true,
})

const alignChartHorizontally = (chart: ChartXY): void => {
    chart.getDefaultAxisY().setThickness({
        min: 60
    })
}

// #region *** OHLC Chart ***
let chartOHLC: ChartXY | undefined
let seriesOHLC: OHLCSeriesTraditional | undefined
let seriesEMA20: LineSeries | undefined
let seriesEMA50: LineSeries | undefined
let seriesEMA100: LineSeries | undefined
let seriesEMA200: LineSeries | undefined
let chartOHLCTitle: (UITextBox & UIElement) | undefined

if (chartConfigOHLC.show) {
    chartOHLC = dashboard.createChartXY({
        columnIndex: 0,
        columnSpan: 1,
        rowIndex: countRowIndexForChart(chartConfigs.indexOf(chartConfigOHLC)),
        rowSpan: chartConfigOHLC.verticalSpans
    })
        .setTitleFillStyle(emptyFill)
        // This application uses a custom cursor, which requires disabling the default auto cursor.
        .setAutoCursorMode(AutoCursorModes.disabled)

    alignChartHorizontally(chartOHLC)

    const axisX = chartOHLC.getDefaultAxisX()
    const axisY = chartOHLC.getDefaultAxisY()

    // Create custom title attached to the top of Y Axis.
    chartOHLCTitle = chartOHLC.addUIElement(
        UIElementBuilders.TextBox
            .setBackground(UIBackgrounds.Rectangle),
        {
            x: axisX,
            y: axisY
        }
    )
        .setText('')
        .setPosition({ x: 0, y: 10 })
        .setOrigin(UIOrigins.LeftTop)
        .setDraggingMode(UIDraggingModes.notDraggable)
    axisX.onScaleChange((start, end) => chartOHLCTitle!.setPosition({ x: start, y: axisY.getInterval().end }))
    axisY.onScaleChange((start, end) => chartOHLCTitle!.setPosition({ x: axisX.getInterval().start, y: end }))
	 
    
    if (chartConfigOHLC.ema20.show) {
        // Create EMA Series.
        seriesEMA20 = chartOHLC.addLineSeries()
            .setName('EMA20')
            .setCursorInterpolationEnabled(false)
            .setMouseInteractions(false)
    }
    if (chartConfigOHLC.ema50.show) {
        // Create EMA Series.
        seriesEMA50 = chartOHLC.addLineSeries()
            .setName('EMA50')
            .setCursorInterpolationEnabled(false)
            .setMouseInteractions(false)
    }
    if (chartConfigOHLC.ema100.show) {
        // Create EMA Series.
        seriesEMA100 = chartOHLC.addLineSeries()
            .setName('EMA100')
            .setCursorInterpolationEnabled(false)
            .setMouseInteractions(false)
    }
    // Create OHLC Series.
    seriesOHLC = chartOHLC.addOHLCSeries({
        positiveFigure: OHLCFigures.Candlestick,
        negativeFigure: OHLCFigures.Candlestick
    })
        .setName('OHLC')
        // Disable auto fitting of Figures (meaning, always show one figure for one input data point).
        .setFigureAutoFitting(false)
        .setMouseInteractions(false)

    // Style.
    if (seriesEMA20) {
        seriesEMA20.setStrokeStyle(new SolidLine({
            thickness: 1,
            fillStyle: new SolidFill({
                color: theme === Themes.darkGold ?
                    ColorRGBA(255, 255, 255) :
                    ColorRGBA(255, 51, 51)
            })
        }))
    }
    if (seriesEMA50) {
        seriesEMA50.setStrokeStyle(new SolidLine({
            thickness: 1,
            fillStyle: new SolidFill({
                color: theme === Themes.darkGold ?
                    ColorRGBA(255, 255, 255) :
                    ColorRGBA(51, 255, 51)
            })
        }))
    }
    if (seriesEMA100) {
        seriesEMA100.setStrokeStyle(new SolidLine({
            thickness: 1,
            fillStyle: new SolidFill({
                color: theme === Themes.darkGold ?
                    ColorRGBA(255, 255, 255) :
                    ColorRGBA(80, 120, 190)
            })
        }))
    }
    if (seriesEMA200) {
        seriesEMA200.setStrokeStyle(new SolidLine({
            thickness: 1,
            fillStyle: new SolidFill({
                color: theme === Themes.darkGold ?
                    ColorRGBA(255, 255, 255) :
                    ColorRGBA(80, 120, 190)
            })
        }))
    }


    // Add Chart Legend.
    //const legend = chartOHLC.addLegendBox().add(chartOHLC)
}

// #endregion

// #region *** Volume Chart ***
let chartVolume: ChartXY | undefined
let seriesVolume: AreaSeriesPositive | undefined
let chartVolumeTitle: UITextBox | undefined

if (chartConfigVolume.show) {
    chartVolume = dashboard.createChartXY({
        columnIndex: 0,
        columnSpan: 1,
        rowIndex: countRowIndexForChart(chartConfigs.indexOf(chartConfigVolume)),
        rowSpan: chartConfigVolume.verticalSpans
    })
        .setTitleFillStyle(emptyFill)
        // This application uses a custom cursor, which requires disabling the default auto cursor.
        .setAutoCursorMode(AutoCursorModes.disabled)

    alignChartHorizontally(chartVolume)

    const axisX = chartVolume.getDefaultAxisX()
    const axisY = chartVolume.getDefaultAxisY()

    // Volume data has a lot of quantity, so better use label formatting with metric units (K, M, etc.).
    axisY.setTickStrategy(AxisTickStrategies.Numeric, (styler) => styler
        .setFormattingFunction(FormattingFunctions.NumericUnits)
    )

    // Create custom title attached to the top of Y Axis.
    const chartVolumeTitle = chartVolume.addUIElement(
        UIElementBuilders.TextBox
            .setBackground(UIBackgrounds.Rectangle),
        {
            x: axisX,
            y: axisY
        }
    )
        .setText('Volume')
        .setPosition({ x: 0, y: 10 })
        .setOrigin(UIOrigins.LeftTop)
        .setDraggingMode(UIDraggingModes.notDraggable)
    axisX.onScaleChange((start, end) => chartVolumeTitle.setPosition({ x: start, y: axisY.getInterval().end }))
    axisY.onScaleChange((start, end) => chartVolumeTitle.setPosition({ x: axisX.getInterval().start, y: end }))

    // Create Volume Series.
    seriesVolume = chartVolume.addAreaSeries({
        type: AreaSeriesTypes.Positive
    })
        .setName('Volume')
        .setCursorInterpolationEnabled(false)
        .setMouseInteractions(false)

    // Add Chart Legend.
    //const legend = chartVolume.addLegendBox().add(chartVolume)
}

// #endregion

// #region *** Stoch Chart ***
let chartStoch: ChartXY | undefined
let seriesStochk: LineSeries | undefined
let seriesStochd: LineSeries | undefined
let chartStochTitle: UITextBox | undefined
let ticksStoch: CustomTick[] = []
let tickStochThresholdLow: CustomTick | undefined
let tickStochThresholdHigh: CustomTick | undefined

if (chartConfigStoch.show) {
    chartStoch = dashboard.createChartXY({
        columnIndex: 0,
        columnSpan: 1,
        rowIndex: countRowIndexForChart(chartConfigs.indexOf(chartConfigStoch)),
        rowSpan: chartConfigStoch.verticalSpans
    })
        .setTitleFillStyle(emptyFill)
        // This application uses a custom cursor, which requires disabling the default auto cursor.
        .setAutoCursorMode(AutoCursorModes.disabled)

    alignChartHorizontally(chartStoch)

    const axisX = chartStoch.getDefaultAxisX()
    const axisY = chartStoch.getDefaultAxisY()

    // Create custom title attached to the top of Y Axis.
    const chartStochTitle = chartStoch.addUIElement(
        UIElementBuilders.TextBox
            .setBackground(UIBackgrounds.Rectangle),
        {
            x: axisX,
            y: axisY
        }
    )
        .setText('Stoch (14,3,3)')
        .setPosition({ x: 0, y: 10 })
        .setOrigin(UIOrigins.LeftTop)
        .setDraggingMode(UIDraggingModes.notDraggable)
    axisX.onScaleChange((start, end) => chartStochTitle.setPosition({ x: start, y: axisY.getInterval().end }))
    axisY.onScaleChange((start, end) => chartStochTitle.setPosition({ x: axisX.getInterval().start, y: end }))

    // Create Stoch Series.
    seriesStochk = chartStoch.addLineSeries()
        .setName('Stoch K')
        .setCursorInterpolationEnabled(false)
        .setMouseInteractions(false)

	seriesStochd = chartStoch.addLineSeries()
        .setName('Stoch D')
        .setCursorInterpolationEnabled(false)
        .setMouseInteractions(false)

    // Use manually placed ticks for Stoch Y Axis, to better indicate common thresholds of 30% and 70%.
    axisY
        .setTickStrategy(AxisTickStrategies.Empty)
        // Stoch interval always from 0 to 100.
        .setInterval(0, 100)
        .setScrollStrategy(undefined)

    ticksStoch.push(axisY.addCustomTick(UIElementBuilders.AxisTick)
        .setValue(0)
        // Disable gridline for this tick.
        .setGridStrokeLength(0)
    )
    ticksStoch.push(axisY.addCustomTick(UIElementBuilders.AxisTick)
        .setValue(100)
        // Disable gridline for this tick.
        .setGridStrokeLength(0)
    )
    tickStochThresholdLow = axisY.addCustomTick(UIElementBuilders.AxisTick)
        .setValue(30)
    ticksStoch.push(tickStochThresholdLow)
    tickStochThresholdHigh = axisY.addCustomTick(UIElementBuilders.AxisTick)
        .setValue(70)
    ticksStoch.push(tickStochThresholdHigh)

    // Style
    tickStochThresholdLow.setGridStrokeStyle(new SolidLine({
        thickness: 1,
        fillStyle: new SolidFill({color: ColorRGBA( 28, 231, 69 )})
    }))

    tickStochThresholdHigh.setGridStrokeStyle(new SolidLine({
        thickness: 1,
        fillStyle: new SolidFill({color: ColorRGBA( 219, 40, 68 )})
    }))

    seriesStochk.setStrokeStyle(new SolidLine({
        thickness: 1,
        fillStyle: new SolidFill({color: 
            theme === Themes.darkGold ?
                ColorRGBA(255, 255, 255) :
                ColorRGBA(80,120,190)
        })
    }))
    
    seriesStochd.setStrokeStyle(new SolidLine({
        thickness: 1,
        fillStyle: new SolidFill({color: 
            theme === Themes.darkGold ?
                ColorRGBA(255, 255, 255) :
                ColorRGBA(255, 51, 51)
        })
    }))

    // Add Chart Legend.
    //const legend = chartStoch.addLegendBox().add(chartStoch)
}
// #endregion

const allCharts = [chartOHLC, chartVolume, chartStoch]
const topChart = allCharts.find(chart => chart !== undefined)
const bottomChart = allCharts.reverse().find(chart => chart !== undefined)

// Add top padding to very first Chart, so nothing is hidden by data-search input.
topChart.setPadding({ top: 20 })
// Remove bottom padding of very last Chart, to save space.
bottomChart.setPadding({ bottom: 0 })

// #region *** Setup X Axes ***

// Setup X Axes' so that only the bottom axis has ticks (date time).
allCharts.forEach(chart => {
    const axisX = chart.getDefaultAxisX()
    if (chart === bottomChart) {
        axisX
            .setTickStrategy(AxisTickStrategies.DateTime)
    } else {
        axisX
            .setTickStrategy(AxisTickStrategies.Empty)
            .setStrokeStyle(emptyLine)
    }
})


// Synchronize all X Axes.
let isAxisXScaleChangeActive = false
const syncAxisXEventHandler = (axis, start, end) => {
   if (isAxisXScaleChangeActive) return
   isAxisXScaleChangeActive = true

   // Find all other X Axes.
   const otherAxes = allCharts
      .map(chart => chart.getDefaultAxisX())
      .filter(axis2 => axis2 !== axis)

   // Sync other X Axis intervals.  
   otherAxes.forEach((axis) => axis
      .setInterval(start, end, false, true)
   )

   isAxisXScaleChangeActive = false
}
allCharts.forEach(chart => chart.getDefaultAxisX().onScaleChange((start, end) => syncAxisXEventHandler(chart.getDefaultAxisX(), start, end)))

// #endregion

// #region *** Setup a Custom Data cursor ***

// Create UI elements for custom cursor.
const resultTable = dashboard
   .addUIElement<UIElementColumn>(
      UILayoutBuilders.Column,
      dashboard.engine.scale
   )
   .setMouseInteractions(false)
   .setOrigin(UIOrigins.LeftBottom)
   .setBackground((background) => background
      // Style same as Theme result table.
      .setFillStyle(dashboard.getTheme().resultTableFillStyle)
      .setStrokeStyle(dashboard.getTheme().resultTableStrokeStyle)
   )

// UITextBox builder for creating text inside ResultTable with automatically shared style.
const resultTableTextBuilder = UIElementBuilders.TextBox
   // Style same as Theme result table text.
   .addStyler(textBox => textBox
      .setTextFillStyle(dashboard.getTheme().resultTableTextFillStyle)
   )

// CustomTick on the bottom X Axis.
const tickX = bottomChart
   .getDefaultAxisX()
   .addCustomTick()

// ConstantLines on other X Axes than the bottom one.
const constantLinesX = allCharts
    .filter(chart => chart !== bottomChart)
    .map(chart => chart.getDefaultAxisX().addConstantLine()
        .setMouseInteractions(false)
        // Style according to Theme custom tick grid stroke.
        .setStrokeStyle(theme.customTickGridStrokeStyle as SolidLine) // TODO IMMEDIATE
    )

// TextBoxes for each cursor property along single X location.
const CursorValueLabel = () => resultTable.addElement<UITextBox>(resultTableTextBuilder)
    .setText('')
const cursorValueLabels = {
    'datetime': CursorValueLabel(),
    'open': CursorValueLabel(),
    'high': CursorValueLabel(),
    'low': CursorValueLabel(),
    'close': CursorValueLabel(),
    'sma': CursorValueLabel(),
    'ema20': CursorValueLabel(),
    'ema50': CursorValueLabel(),
    'ema100': CursorValueLabel(),
    'ema200': CursorValueLabel(),
    'volume': CursorValueLabel(),
    'stochk': CursorValueLabel(),
    'stochd': CursorValueLabel()
}

const setCustomCursorVisible = (visible) => {
   if (!visible) {
      resultTable.dispose()
      tickX.dispose()
      constantLinesX.forEach((el) => el.dispose())
   } else {
      resultTable.restore()
      tickX.restore()
      constantLinesX.forEach((el) => el.restore())
   }
}
setCustomCursorVisible(false)

const parseCursorValueLabelText = (prefix: string, value: string): string => {
    // Maintain static length (approx.) of prefix by adding whitespaces when necessary.
    while (prefix.length < 10) {
        prefix += ' '
    }
    return prefix + value
}


// Implement custom cursor logic with events.
allCharts.forEach((chart, i) => {
    chart.onSeriesBackgroundMouseMove((_, event) => {
        // Get mouse location in web page
        const mouseLocationClient = {
            x: event.clientX,
            y: event.clientY,
        }

        // Translate mouse location to LCJS coordinate system for solving data points from series, and translating to Axes.
        const mouseLocationEngine = chart.engine.clientLocation2Engine(
            mouseLocationClient.x,
            mouseLocationClient.y
        )

        // Translate mouse location to X Axis.
        const mouseLocationAxisX = translatePoint(mouseLocationEngine, dashboard.engine.scale, {
            x: bottomChart.getDefaultAxisX(),
            y: bottomChart.getDefaultAxisY(),
        }).x

        // Solve closest series data points from location.
        const dpOHLC = seriesOHLC && seriesOHLC.solveNearestFromScreen(mouseLocationEngine)
        const dpEMA20 = seriesEMA20 && seriesEMA20.solveNearestFromScreen(mouseLocationEngine)
        const dpEMA50 = seriesEMA50 && seriesEMA50.solveNearestFromScreen(mouseLocationEngine)
        const dpEMA100 = seriesEMA100 && seriesEMA100.solveNearestFromScreen(mouseLocationEngine)
        const dpEMA200 = seriesEMA200 && seriesEMA200.solveNearestFromScreen(mouseLocationEngine)
        const dpVolume = seriesVolume && seriesVolume.solveNearestFromScreen(mouseLocationEngine)
        const dpStochk = seriesStochk && seriesStochk.solveNearestFromScreen(mouseLocationEngine)
		const dpStochd = seriesStochd && seriesStochd.solveNearestFromScreen(mouseLocationEngine)
		
        // Set cursor value labels displayed text.
        cursorValueLabels.datetime.setText(bottomChart.getDefaultAxisX().formatValue(mouseLocationAxisX))
        if (dpOHLC) {
            cursorValueLabels.open.setText(parseCursorValueLabelText('Open', chartOHLC.getDefaultAxisY().formatValue(dpOHLC.ohlcSegment.getOpen())))
            cursorValueLabels.high.setText(parseCursorValueLabelText('High', chartOHLC.getDefaultAxisY().formatValue(dpOHLC.ohlcSegment.getHigh())))
            cursorValueLabels.low.setText(parseCursorValueLabelText('Low', chartOHLC.getDefaultAxisY().formatValue(dpOHLC.ohlcSegment.getLow())))
            cursorValueLabels.close.setText(parseCursorValueLabelText('Close', chartOHLC.getDefaultAxisY().formatValue(dpOHLC.ohlcSegment.getClose())))
        } else {
            cursorValueLabels.open.setText('')
            cursorValueLabels.high.setText('')
            cursorValueLabels.low.setText('')
            cursorValueLabels.close.setText('')
        }
        if (dpEMA20) {
            cursorValueLabels.ema20.setText(parseCursorValueLabelText('EMA20', chartOHLC.getDefaultAxisY().formatValue(dpEMA20.location.y)))
        } else {
            cursorValueLabels.ema20.setText('')
        }
        if (dpEMA50) {
            cursorValueLabels.ema50.setText(parseCursorValueLabelText('EMA50', chartOHLC.getDefaultAxisY().formatValue(dpEMA50.location.y)))
        } else {
            cursorValueLabels.ema50.setText('')
        }
        if (dpEMA100) {
            cursorValueLabels.ema100.setText(parseCursorValueLabelText('EMA100', chartOHLC.getDefaultAxisY().formatValue(dpEMA100.location.y)))
        } else {
            cursorValueLabels.ema100.setText('')
        }
        if (dpEMA200) {
            cursorValueLabels.ema200.setText(parseCursorValueLabelText('EMA200', chartOHLC.getDefaultAxisY().formatValue(dpEMA200.location.y)))
        } else {
            cursorValueLabels.ema200.setText('')
        }
        if (dpVolume) {
            cursorValueLabels.volume.setText(parseCursorValueLabelText('Volume', chartVolume.getDefaultAxisY().formatValue(dpVolume.location.y)))
        } else {
            cursorValueLabels.volume.setText('')
        }
        if (dpStochk) {
            cursorValueLabels.stochk.setText(parseCursorValueLabelText('Stoch K', chartStoch.getDefaultAxisY().formatValue(dpStochk.location.y)))
        } else {
            cursorValueLabels.stochk.setText('')
        }
        if (dpStochd) {
            cursorValueLabels.stochd.setText(parseCursorValueLabelText('Stoch D', chartStoch.getDefaultAxisY().formatValue(dpStochd.location.y)))
        } else {
            cursorValueLabels.stochd.setText('')
        }

        // Display and position cursor.
        setCustomCursorVisible(true)
        resultTable.setPosition({
            x: mouseLocationEngine.x,
            y: mouseLocationEngine.y,
        })
        tickX.setValue(mouseLocationAxisX)
        constantLinesX.forEach(line => line.setValue(mouseLocationAxisX))
    })
    chart.onSeriesBackgroundMouseLeave((_, e) => {
        setCustomCursorVisible(false)
    })
    chart.onSeriesBackgroundMouseDragStart((_, e) => {
        setCustomCursorVisible(false)
    })
})

// #endregion

// #endregion

// #region ----- Implement logic for supplying incoming trading data to LCJS components -----

let dataExists = false
const renderOHLCData = (name: string, data: OHLCDataFormat): void => {
    dataExists = true

    // #region *** Map trading data to LCJS format ***
    const xohlcValues: XOHLC[] = []
    const volumeValues: Point[] = []
    const atrValues: Point[] = []
    const ema20Values: Point[] = []
    const ema50Values: Point[] = []
    const ema100Values: Point[] = []
    const ema200Values: Point[] = []
    const stochkValues: Point[] = []
    const stochdValues: Point[] = []
    
    const tStart = window.performance.now()
    const dataDateTimes = Object.keys(data)
    const dataDateTimesLen = dataDateTimes.length
    const dataDates = []
    for (let i = 0; i < dataDateTimesLen; i++) {
        const dateTimeStr = dataDateTimes[i]
        const ohlcValuesStr = data[dateTimeStr]
        const date = new Date(dateTimeStr)
        // DateTime data is placed as EcmaScript epoch timestamp (number).
        const x = date.getTime()
        const o = Number(ohlcValuesStr.open)
        const h = Number(ohlcValuesStr.high)
        const l = Number(ohlcValuesStr.low)
        const c = Number(ohlcValuesStr.close)
        const volume = Number(ohlcValuesStr.volume)
        const atr = Number(ohlcValuesStr.atr)
        const ema20 = Number(ohlcValuesStr.ema20)
        const ema50 = Number(ohlcValuesStr.ema50)
        const ema100 = Number(ohlcValuesStr.ema100)
        const ema200 = Number(ohlcValuesStr.volume)
        const stochk = Number(ohlcValuesStr.stoch_K)
        const stochd = Number(ohlcValuesStr.stoch_D)
        
        xohlcValues.push([x, o, h, l, c])
        volumeValues.push({ x, y: volume })
        atrValues.push({x,y:atr})
        if(ema20){
        	ema20Values.push({x,y:ema20})
        }
        if(ema50)
        	ema50Values.push({x,y:ema50})
        if(ema100)
        	ema100Values.push({x,y:ema100})
        if(ema200)
        	ema200Values.push({x,y:ema200})
        if(stochk)
        	stochkValues.push({x,y:stochk})
        if(stochd)
        	stochdValues.push({x,y:stochd})
        dataDates.push(date)        
    }
    const xohlcValuesLen = xohlcValues.length
    const volumeValuesLen = volumeValues.length

    // #endregion

    console.log(`Prepared data in ${((window.performance.now() - tStart) / 1000).toFixed(1)} s`)
    console.log(`${xohlcValuesLen} XOHLC values, ${volumeValuesLen} Volume values.`)


    // #region *** Push data to LCJS series ***

    if (seriesOHLC) {
        seriesOHLC.clear().add(xohlcValues)
    }
    
	if (seriesEMA20) {
        seriesEMA20.clear().add(ema20Values)
    }
    
    if (seriesEMA50) {
        seriesEMA50.clear().add(ema50Values)
    }
    
    if (seriesEMA100) {
        seriesEMA100.clear().add(ema100Values)
    }
    if (seriesEMA200) {
        seriesEMA200.clear().add(ema200Values)
    }
    

    if (seriesVolume) {
        // To visualize Volume values as Histogram bars, map 'volumeValues' and add step values between data-points.
        const histogramBarValues: Point[] = []
        let prev: Point | undefined
        for (let i = 0; i < volumeValuesLen; i++) {
            const cur = volumeValues[i]
            // Add step between previous value and cur value.
            if (prev) {
                histogramBarValues.push({ x: prev.x, y: cur.y })
            }
            histogramBarValues.push(cur)
            prev = cur
        }

        seriesVolume.clear().add(histogramBarValues)
    }

    if (seriesStochk) {
        seriesStochk.clear().add(stochkValues)
    }
    
    if (seriesStochd) {
        seriesStochd.clear().add(stochdValues)
    }

    // Immediately fit new data to view along.
    bottomChart.getDefaultAxisX().fit(false).setThickness({min: 20})
    allCharts.forEach(chart => chart.getDefaultAxisY().fit(true))

    // #endregion

    // Set title of OHLC Chart to show name data.
    if (chartOHLCTitle) {
        const dataRangeLabel = dataRange === DataRange.Month ?
            '1 month' : (dataRange === DataRange.Year ?
                '1 year' :
                '10 years'
            )
        chartOHLCTitle.setText(`${name} (${dataRangeLabel})`)
    }
    // Also set name of OHLC Series.
    if (seriesOHLC) {
        seriesOHLC.setName(name)
    }


}

// #endregion

// #region ----- REST logic for fetching data -----

// Function that handles event where data search failed.
const dataSearchFailed = (searchSymbol: string) => {
    console.log('No data found for \'', searchSymbol, '\'')
    alert(`Data for '${searchSymbol}' not found. May be that:
1) Search symbol is not valid stock label.
2) Requested stock data is not available from data provider.
3) Data subscription limit has been reached for this day.
` )
}

const dataCaches: Map<string, DataCache> = new Map()

// Define function that searches OHLC data.
const searchData = () => {
    // Get search symbol from input field.
    const inputField = domElements.get(domElementIDs.dataSearchInput) as HTMLInputElement
    const searchSymbol = inputField.value

    // Form API parameters.
    /**
     * Symbol to search.
     */
    const symbol: string = searchSymbol
    // mode
    let mode: 'history' 
    
    switch (dataRange) {
        case DataRange.Month:
        	freq = 'D'
        	break
        case DataRange.Year:
        	freq = 'W'
        	break
        case DataRange.TenYears:
        	freq = 'M'
        	break
        default:
            mode = 'history'
    }

    let cached = dataCaches.get(symbol)

   // if (!cached) {
		console.log("Frequency - "+freq)
        const cache = new DataCache(symbol, freq, dataSource)
        dataCaches.set(symbol, cache)
        cached = cache
    //}
    let dataPromise  = cached.getDailyData(dataRange)
    dataPromise.then((data) => {
		console.log("Rendering data for symbol "+ searchSymbol + " - " + freq)
        renderOHLCData(`${searchSymbol}`, data)
    })
        .catch((reason) => {
			dataSearchFailed(searchSymbol)
        })
}

// Subscribe to events where data-search is activated.
domElements.get(domElementIDs.dataSearchActivate)
    .addEventListener('click', searchData)

document
    .addEventListener('keydown', (event) => {
        const key = event.key
        if (key === 'Enter')
            searchData()
    })

    // Active data-search whenever data-search range is changed, and previous data was visible.
    ;[
        domElements.get(domElementIDs.dataSearchRange1),
        domElements.get(domElementIDs.dataSearchRange2),
        domElements.get(domElementIDs.dataSearchRange3)
    ].forEach((element) => element.addEventListener('change', () => {
        // Update data only if it was already rendered.
        if (dataExists) {
            searchData()
        }
    }))

// #endregion



// Render static data initially (1 year history of AAPL, taken on 26th September 2019).
// This is a temporary solution for while the API token is limited to an amount of searches.
//const temporaryStaticData = require('./temporary-static-data.json')
//renderOHLCData('AAPL history', temporaryStaticData)
searchData()
