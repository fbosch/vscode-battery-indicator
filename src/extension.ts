import * as execa from 'execa'
import * as isCharging from 'is-charging'
import * as linuxBattery from 'linux-battery'
import * as osxBattery from 'osx-battery'
import * as padEnd from 'pad-end'
import * as powerInfo from 'node-power-info'
import * as toDecimal from 'to-decimal'

import { Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, commands, window } from 'vscode'

export function activate(context: ExtensionContext) {
    console.log('🔋  battery-indicator is now active!')

    const unix = () => new Promise(resolve => powerInfo.getChargeStatus(batteryStats => resolve(batteryStats[0].powerLevel)))

    const win = () => execa.stdout('WMIC', ['Path', 'Win32_Battery', 'Get', 'EstimatedChargeRemaining']).then(stdout => {
        if (!stdout) {
            return Promise.reject(new Error('No battery could be found'));
        }
        stdout = parseFloat(stdout.trim().split('\n')[1]);
        return Math.round(toDecimal(stdout > 100 ? 100 : stdout) * 100)
    })

    let batteryLevelStateChecker
    if (process.platform === 'darwin' || process.platform === 'linux') {
        batteryLevelStateChecker = unix
    } else {
        batteryLevelStateChecker = win
    }

    let batteryIndicator = new BatteryIndicator(batteryLevelStateChecker, isCharging)
    let controller = new BatteryIndicatorController(batteryIndicator)

    context.subscriptions.push(controller)
    context.subscriptions.push(batteryIndicator)
}

export class BatteryIndicatorController {
    private _batteryIndicator: BatteryIndicator
    private _disposable: Disposable

    constructor(batteryIndicator: BatteryIndicator) {
        this._batteryIndicator = batteryIndicator
        this._batteryIndicator.updateStatus()

        let subscriptions: Disposable[] = []
        window.onDidChangeActiveTextEditor(this._onEvent, subscriptions)
        window.onDidChangeActiveTextEditor(this._onEvent, subscriptions)

        this._batteryIndicator.updateStatus()

        this._disposable = Disposable.from(...subscriptions)
    }

    dispose() {
        this._disposable.dispose()
    }

    private _onEvent() {
        this._batteryIndicator.updateStatus()
    }

}

export class BatteryIndicator {

    static POLLING_INTERVAL = 30000
    static BATTERY_SECTION_FULL_SYMBOL = '|'
    static BATTERY_SECTION_EMPTY_SYMBOL = ' '
    static BAR_LENGTH = 10
    static CHARGING_SYMBOL = '⚡'
    static COLORS = {
        full: '#8AE66C',
        high: '#D8FA63',
        medium: '#FED83A',
        low: '#FD9943',
        veryLow: '#FD5324'
    }

    private _battery
    private _statusBarItem: StatusBarItem
    private _pollingInterval
    private _batteryPercentage
    private _chargingState

    public interval
    public getBatteryState
    public getChargingState

    constructor(getBatteryState, getChargingState) {
        this.getBatteryState = getBatteryState
        this.getChargingState = getChargingState
        this.updateStatus()
        this.pollingInterval = BatteryIndicator.POLLING_INTERVAL
    }

    set pollingInterval(pollingInterval) {
        if (pollingInterval) {
            pollingInterval = Math.max(pollingInterval, 1)
            this._pollingInterval = pollingInterval
            this.startPolling()
        }
    }

    get pollingInterval() {
        return this._pollingInterval
    }

    stopPolling() {
        if (this.interval) {
            clearInterval(this.interval)
            this.interval = false
        }
    }

    startPolling() {
        if (this.interval) {
            clearInterval(this.interval)
        }
        this.interval = setInterval(() => this.updateStatus(), this.pollingInterval)
    }

    updateStatus() {
        if (!this._statusBarItem) {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right)
        }

        let batteryLevel = this.getBatteryState().then(level => this._batteryPercentage = level),
            chargingState = this.getChargingState().then(state => this._chargingState = state)

        Promise.all([batteryLevel, chargingState]).then(() => {
            this.updateStatusText(this._batteryPercentage, this._chargingState)
            this._statusBarItem.color = this.getPowerColor(this._batteryPercentage)
            this._statusBarItem.show()
        }, () => {
            console.warn('Current device does not have battery')
            this.dispose()
        })
    }

    getVisualIndicator(percentage, chargingState) {
        let bar = BatteryIndicator.BATTERY_SECTION_FULL_SYMBOL.repeat(BatteryIndicator.BAR_LENGTH)
        let currentLevel = padEnd(BatteryIndicator.BATTERY_SECTION_FULL_SYMBOL.repeat(Math.round((bar.length / 100) * percentage)), bar.length, BatteryIndicator.BATTERY_SECTION_EMPTY_SYMBOL)
        return `[${currentLevel}] ${chargingState ? BatteryIndicator.CHARGING_SYMBOL : ''}`
    }

    updateStatusText(percentage, chargingState) {
        if (percentage) {
            this._statusBarItem.text = `${percentage}% ${this.getVisualIndicator(percentage, chargingState)}`
        } else {
            console.warn(`battery-indicator: invalid value: ${percentage}`)
        }
    }

    getPowerColor(percentage) {
        if (percentage === 100) {
            return BatteryIndicator.COLORS.full
        } else if (percentage >= 80) {
            return BatteryIndicator.COLORS.high
        } else if (percentage >= 50) {
            return BatteryIndicator.COLORS.medium
        } else if (percentage >= 30) {
            return BatteryIndicator.COLORS.low
        } else if (percentage <= 15) {
            return BatteryIndicator.COLORS.veryLow
        }
        return null
    }

    dispose() {
        this.stopPolling()
        this._statusBarItem.dispose()
    }


}

export function deactivate() {
}