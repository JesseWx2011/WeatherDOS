const output = document.getElementById('output');
const commandInput = document.getElementById('command-input');
let commandHistory = [];
let historyIndex = -1;
let alertMonitorInterval = null;
let lastAlertIds = new Set();

// Sound for alerts
const alertSound = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU' + Array(1000).join('123'));

// Typewriter animation function
async function typeWriter(text, element, speed = 2) {
    const lines = text.split('\n');
    let currentText = '';
    
    for (let i = 0; i < lines.length; i++) {
        currentText += lines[i] + '\n';
        element.textContent = currentText;
        await new Promise(resolve => setTimeout(resolve, speed * 50)); // Increased delay for line-by-line
        scrollToBottom();
    }
}

// Scroll to bottom function
function scrollToBottom() {
    const terminalBody = document.querySelector('.terminal-body');
    terminalBody.scrollTop = terminalBody.scrollHeight;
}

// Logging functions
function logResponse(command, response) {
    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toTimeString().split(' ')[0];
    const logEntry = {
        command,
        response,
        timestamp: `${date} ${time}`
    };
    
    let logs = JSON.parse(localStorage.getItem('weatherLogs') || '{}');
    if (!logs[date]) {
        logs[date] = [];
    }
    logs[date].push(logEntry);
    localStorage.setItem('weatherLogs', JSON.stringify(logs));
}

function getLogsForDate(date) {
    const logs = JSON.parse(localStorage.getItem('weatherLogs') || '{}');
    return logs[date] || [];
}

// Available commands
const commands = {
    help: () => {
        return `Available commands:
weather [station] - Get weather data for a specific station (e.g., weather KPNS)
weather raw [station] - Get raw METAR data for a station (e.g., weather raw KPNS)
forecast [zone] - Get forecast for a specific zone (e.g., forecast FLZ204)
alert [zone] - Get weather alerts for a specific zone (e.g., alert FLZ204)
alert monitor [zone] - Monitor for new weather alerts every minute for a specific zone (e.g., alert monitor FLZ204)
clear log - Clear today's weather logs
log - View all logged responses
log [YYYY-MM-DD] - View logged responses for specific date
clear - Clear the terminal
help - Show this help message
exit - Close the terminal`;
    },
    clear: () => {
        output.innerHTML = '';
        return '';
    },
    weather: async (station, raw = false) => {
        if (!station) {
            return 'Error: Please specify a station code (e.g., weather KPNS)';
        }
        
        try {
            const response = await fetch(`https://api.weather.gov/stations/${station}/observations/latest`);
            if (!response.ok) {
                throw new Error('Station not found');
            }
            const data = await response.json();
            
            if (raw) {
                return `Raw METAR for ${station}:\n${data.properties.rawMessage}`;
            }
            
            const temperature = data.properties.temperature.value;
            const windSpeed = data.properties.windSpeed.value;
            const windDirection = data.properties.windDirection.value;
            const visibility = data.properties.visibility.value;
            const weather = data.properties.textDescription;
            
            return `Weather for ${station}:
Temperature: ${temperature}°C
Wind: ${windSpeed} m/s from ${windDirection}°
Visibility: ${visibility} meters
Conditions: ${weather}`;
        } catch (error) {
            return `Error: ${error.message}`;
        }
    },
    alert: async (zone) => {
        if (!zone) {
            return 'Error: Please specify a zone code (e.g., alert FLZ204)';
        }
        
        try {
            const response = await fetch(`https://api.weather.gov/alerts/active/zone/${zone}`);
            if (!response.ok) {
                throw new Error('Zone not found');
            }
            const data = await response.json();
            
            if (data.features.length === 0) {
                return `No active alerts for zone ${zone}`;
            }
            
            let alertText = `Active alerts for zone ${zone}:\n\n`;
            
            data.features.forEach((alert, index) => {
                const properties = alert.properties;
                alertText += `Alert ${index + 1}:\n`;
                alertText += `Type: ${properties.event}\n`;
                alertText += `Severity: ${properties.severity}\n`;
                alertText += `Headline: ${properties.headline}\n`;
                alertText += `Description: ${properties.description}\n`;
                alertText += `Effective: ${new Date(properties.effective).toLocaleString()}\n`;
                alertText += `Expires: ${new Date(properties.expires).toLocaleString()}\n\n`;
            });
            
            return alertText;
        } catch (error) {
            return `Error: ${error.message}`;
        }
    },
    forecast: async (zone) => {
        if (!zone) {
            return 'Error: Please specify a zone code (e.g., forecast FLZ204)';
        }
        
        try {
            const response = await fetch(`https://api.weather.gov/zones/forecast/${zone}/forecast`);
            if (!response.ok) {
                throw new Error('Zone not found');
            }
            const data = await response.json();
            
            let forecastText = `Forecast for zone ${zone}:\n\n`;
            
            data.properties.periods.forEach((period, index) => {
                forecastText += `${period.name}:\n`;
                forecastText += `Temperature: ${period.temperature}°${period.temperatureUnit}\n`;
                forecastText += `Wind: ${period.windSpeed} ${period.windDirection}\n`;
                forecastText += `Forecast: ${period.detailedForecast}\n\n`;
            });
            
            return forecastText;
        } catch (error) {
            return `Error: ${error.message}`;
        }
    },
    log: (date) => {
        if (!date) {
            const logs = JSON.parse(localStorage.getItem('weatherLogs') || '{}');
            let allLogs = [];
            
            Object.entries(logs).forEach(([logDate, entries]) => {
                entries.forEach(entry => {
                    allLogs.push(`[${entry.timestamp}] ${entry.command}\n${entry.response}\n`);
                });
            });
            
            return allLogs.length > 0 ? allLogs.join('\n') : 'No logs found';
        }
        
        const logs = getLogsForDate(date);
        if (logs.length === 0) {
            return `No logs found for ${date}`;
        }
        
        return logs.map(entry => `[${entry.timestamp}] ${entry.command}\n${entry.response}\n`).join('\n');
    },
    exit: () => {
        window.close();
        return '';
    },
    'clear log': () => {
        const date = new Date().toISOString().split('T')[0];
        let logs = JSON.parse(localStorage.getItem('weatherLogs') || '{}');
        delete logs[date];
        localStorage.setItem('weatherLogs', JSON.stringify(logs));
        return `Logs cleared for ${date}`;
    },
    'alert monitor': async (zone) => {
        if (!zone) {
            return 'Error: Please specify a zone code (e.g., alert monitor FLZ204)';
        }

        // Clear any existing monitor
        if (alertMonitorInterval) {
            clearInterval(alertMonitorInterval);
        }

        // Initial check
        const initialAlerts = await checkAlerts(zone);
        if (initialAlerts) {
            lastAlertIds = new Set(initialAlerts.map(alert => alert.id));
        }

        // Set up monitoring
        alertMonitorInterval = setInterval(async () => {
            const newAlerts = await checkAlerts(zone);
            if (newAlerts) {
                const currentAlertIds = new Set(newAlerts.map(alert => alert.id));
                
                // Check for new alerts
                newAlerts.forEach(alert => {
                    if (!lastAlertIds.has(alert.id)) {
                        // Play alert sound
                        alertSound.play();
                        
                        // Display new alert
                        const resultElement = document.createElement('div');
                        resultElement.className = 'result alert-new';
                        output.appendChild(resultElement);
                        typeWriter(`NEW ALERT DETECTED!\nType: ${alert.properties.event}\nSeverity: ${alert.properties.severity}\nHeadline: ${alert.properties.headline}\n`, resultElement);
                    }
                });
                
                lastAlertIds = currentAlertIds;
            }
        }, 60000); // Check every minute

        return `Monitoring alerts for zone ${zone}. Type 'clear' to stop monitoring.`;
    }
};

// Helper function to check alerts
async function checkAlerts(zone) {
    try {
        const response = await fetch(`https://api.weather.gov/alerts/active/zone/${zone}`);
        if (!response.ok) {
            throw new Error('Zone not found');
        }
        const data = await response.json();
        return data.features;
    } catch (error) {
        console.error('Error checking alerts:', error);
        return null;
    }
}

// Handle command input
commandInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const command = commandInput.value.trim();
        commandInput.value = '';
        
        // Add command to history
        commandHistory.push(command);
        historyIndex = commandHistory.length;
        
        // Display command
        const commandElement = document.createElement('div');
        commandElement.className = 'command';
        commandElement.textContent = `C:\> ${command}`;
        output.appendChild(commandElement);
        scrollToBottom();
        
        // Process command
        const [cmd, ...args] = command.split(' ');
        let result;
        
        if (cmd.toLowerCase() === 'weather' && args[0]?.toLowerCase() === 'raw') {
            result = await commands.weather(args[1], true);
        } else if (cmd.toLowerCase() === 'alert' && args[0]?.toLowerCase() === 'monitor') {
            result = await commands['alert monitor'](args[1]);
        } else if (cmd.toLowerCase() === 'clear' && args[0]?.toLowerCase() === 'log') {
            result = commands['clear log']();
        } else {
            result = await processCommand(cmd.toLowerCase(), args);
        }
        
        if (result) {
            const resultElement = document.createElement('div');
            resultElement.className = 'result';
            output.appendChild(resultElement);
            await typeWriter(result, resultElement);
            
            // Log the response
            logResponse(command, result);
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIndex > 0) {
            historyIndex--;
            commandInput.value = commandHistory[historyIndex];
        }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            commandInput.value = commandHistory[historyIndex];
        } else {
            historyIndex = commandHistory.length;
            commandInput.value = '';
        }
    }
});

// Process commands
async function processCommand(cmd, args) {
    if (commands[cmd]) {
        return await commands[cmd](...args);
    } else if (cmd) {
        return `Error: Command '${cmd}' not found. Type 'help' for available commands.`;
    }
    return '';
}

// Focus input on click anywhere
document.addEventListener('click', () => {
    commandInput.focus();
}); 