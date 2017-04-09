import * as batteryStatus from 'node-power-info'
import * as padEnd from 'pad-end'

import { Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, commands, window } from 'vscode'

export function activate(context: ExtensionContext) {
    console.log('battery-indicator is now active!')
    let batteryIndicator = new BatteryIndicator()
    let controller = new BatteryIndicatorController(batteryIndicator)

    context.subscriptions.push(controller)
    context.subscriptions.push(batteryIndicator)
}

class BatteryIndicatorController {
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

class BatteryIndicator {

    static POLLING_INTERVAL = 30
    static BATTERY_SECTION_FULL_SYMBOL = '|'
    static BATTERY_SECTION_EMPTY_SYMBOL = ' '
    static BAR_LENGTH = 10
    static CHARGING_SYMBOL = '⚡'

    private _battery
    private _statusBarItem: StatusBarItem
    private _statusIcon
    private _statusText
    private _pollingInterval
    public interval

    constructor() {
        this.pollingInterval = BatteryIndicator.POLLING_INTERVAL
    }

    set pollingInterval(pollingInterval) {
        if (pollingInterval) {
            pollingInterval = Math.max(pollingInterval, 1)
            this._pollingInterval = 1000 * pollingInterval
            this.startPolling()
        }
    }

    get pollingInterval() {
        return this._pollingInterval
    }

    startPolling() {
        if (this.interval) {
            clearInterval(this.interval)
        }
        this.interval = setInterval(() => this.updateStatus(), this.pollingInterval)
    }

    updateStatus() {
        console.log('🔋 battery indicator updating')
        if (!this._statusBarItem) {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right)
        }
        batteryStatus.getChargeStatus(batteryStats => {
            let stats = batteryStats[0]
            this.updateStatusText(stats)
            this._statusBarItem.color = this.getPowerColor(stats.powerLevel)
        })
        this._statusBarItem.show()
    }

    getVisualIndicator(stats) {
        let bar = BatteryIndicator.BATTERY_SECTION_FULL_SYMBOL.repeat(BatteryIndicator.BAR_LENGTH)
        let currentLevel = padEnd(BatteryIndicator.BATTERY_SECTION_FULL_SYMBOL.repeat((bar.length / 100) * stats.powerLevel), bar.length, BatteryIndicator.BATTERY_SECTION_EMPTY_SYMBOL)
        return `[${currentLevel}] ${stats.chargeStatus == 'charging' ? BatteryIndicator.CHARGING_SYMBOL : ''}`
    }

    updateStatusText(stats) {
        if (stats.powerLevel) {
            this._statusBarItem.text = `${stats.powerLevel}% ${this.getVisualIndicator(stats)}`
        } else {
            console.warn(`battery-indicator: invalid value: ${stats.powerLevel}`)
        }
    }
    
    getPowerColor(percentage) {
        if(percentage === 100) {
            return '#2D8633'
        } else if (percentage > 80 ) {
            return '#54A759'
        } else if (percentage > 50) {
            return '#AA9739'
        } else if (percentage > 30) {
            return '#AA3C39'
        } else if (percentage < 15) {
            return '#801815'
        }
    }

    dispose() {
        this._statusBarItem.dispose()
    }


}

export function deactivate() {
}