import * as execa from 'execa'
import * as isCharging from 'is-charging'
import * as powerInfo from 'node-power-info'

import { Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, window } from 'vscode'

const getUnixPowerInfo = () => new Promise(resolve => {
	powerInfo.getChargeStatus(batteryStats => {
		const [ stats ] = batteryStats
		resolve(stats.powerLevel)
	})
})

const getWindowsPowerInfo = () => new Promise((resolve, reject) => {
	execa.stdout('WMIC', ['Path', 'Win32_Battery', 'Get', 'EstimatedChargeRemaining'])
		.then(stdout => {
			if (!stdout) reject(new Error('No battery could be found'))
			const powerLevel = parseFloat(stdout.trim().split('\n')[1])
			const normalizedPowerLevel = Math.round(powerLevel > 100 ? 100 : powerLevel) * 100
			resolve(normalizedPowerLevel)
		})
})


export function activate(context: ExtensionContext) {

	const batteryStateChecker =
		process.platform === 'darwin' || process.platform === 'linux'
			? getUnixPowerInfo
			: getWindowsPowerInfo

	const batteryIndicator = new BatteryIndicator(batteryStateChecker, isCharging)
	const controller = new BatteryIndicatorController(batteryIndicator)

	context.subscriptions.push(controller)
	context.subscriptions.push(batteryIndicator)
}

export class BatteryIndicatorController {
	private batteryIndicator: BatteryIndicator
	private disposable: Disposable

	constructor(batteryIndicator: BatteryIndicator) {
		let subscriptions: Disposable[] = []
		batteryIndicator.updateStatus()
		window.onDidChangeActiveTextEditor(batteryIndicator.updateStatus, subscriptions)
		batteryIndicator.updateStatus()
		this.disposable = Disposable.from(...subscriptions)
	}

	dispose() {
		this.disposable.dispose()
	}
}

export class BatteryIndicator {


	private getChargingState: Function
	private statusBarItem: StatusBarItem
	private getBatteryState: Function
	private polling: any
	private pollingInterval: number

	static pollingInterval = 30000
	static batterySectionFullSymbol = '|'
	static batterySectionEmptySymbol = '-'
	static barLength = 10
	static chargingSymbol = '⚡'
	static colors = {
		full: '#8AE66C',
		high: '#D8FA63',
		medium: '#FED83A',
		low: '#FD9943',
		veryLow: '#FD5324'
	}


	constructor(getBatteryState: Function, getChargingState: Function) {
		this.getBatteryState = getBatteryState
		this.getChargingState = getChargingState
		this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right)
		this.updateStatus()
		this.pollingInterval = BatteryIndicator.pollingInterval
	}

	set interval(interval: number) {
		if (interval) {
			this.pollingInterval = Math.max(interval, 1)
			this.startPolling()
		}
	}

	get interval() {
		return this.pollingInterval
	}

	get poll() {
		return this.polling || false
	}

	updateStatus() {
		if (!this.statusBarItem) {
			this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right)
		}
		const readPowerLevel = this.getBatteryState()
		const readChargingState = this.getChargingState()

		Promise.all([readPowerLevel, readChargingState])
			.then(batteryInformation => {
				const [ powerLevel, isCharging ] = batteryInformation
				this.updateStatusBarText(powerLevel, isCharging)
			})
			.catch(() => this.dispose())
	}


	getPowerColor(powerLevel: number) {
		if (powerLevel === 100) return BatteryIndicator.colors.full
		if (powerLevel >= 80) return BatteryIndicator.colors.high
		if (powerLevel >= 50) return BatteryIndicator.colors.medium
		if (powerLevel >= 30) return BatteryIndicator.colors.low
		if (powerLevel <= 15) return BatteryIndicator.colors.veryLow
		return null
	}

	getVisualIndicator(powerLevel: number, isCharging: boolean) {
		const bar = BatteryIndicator.batterySectionFullSymbol.repeat(BatteryIndicator.barLength)
		const powerLevelLength = Math.round((bar.length / 100) * powerLevel)
		const powerLevelBar = BatteryIndicator.batterySectionFullSymbol.repeat(powerLevelLength)
		const currentPowerLevelBar = powerLevelBar.padEnd(bar.length, BatteryIndicator.batterySectionEmptySymbol)
		return `${currentPowerLevelBar} ${isCharging ? BatteryIndicator.chargingSymbol : ''}`
	}

	updateStatusBarText(powerLevel: number, isCharging: boolean) {
		if (powerLevel) {
			this.statusBarItem.text = `${powerLevel}% ${this.getVisualIndicator(powerLevel, isCharging)}`
		}
		this.statusBarItem.color = this.getPowerColor(powerLevel)
		this.statusBarItem.show()
	}

	startPolling() {
		this.stopPolling()
		this.polling = setInterval(() => this.updateStatus(), this.pollingInterval)
	}

	stopPolling() {
		if (this.polling) {
			clearInterval(this.polling)
			this.polling = false
		}
	}

	dispose() {
		this.stopPolling()
		this.statusBarItem.dispose()
	}
}

export function  deactivate() { return null }