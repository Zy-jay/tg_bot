const { spawn } = require('child_process');

export function pythonHandler() {
    const python = spawn('python', ['receiver.py', currentBotData.api_id, currentBotData.api_hash, currentBotData.session]);
    return python;
}