const { spawn } = require('child_process');

function pythonHandler(currentBotData) {
    const python = spawn('python', ['receiver.py', currentBotData.api_id, currentBotData.api_hash, currentBotData.session]);
    return python;
}

module.exports = pythonHandler;
