import Bot from './lib/service/src/index.js';
import { v4 as uuidv4 } from 'uuid';
import readline from 'readline';
import fs from 'fs';
import minimist from 'minimist';

const argv = minimist(process.argv.slice(2));
const botId = argv.botId;

if (!botId) {
    console.log(`usage: node ./index.js --botId <flowstorm-bot-id>`);
    process.exit(1);
}

let clientUuid;
const getClientUuid = () => {
    if (!clientUuid) {
        clientUuid = uuidv4();
        console.log(`clientUuid: ${clientUuid}`);
    }
    return clientUuid;
}

const appendLogs = (type, ...logs) => {
    type = type || 'na';
    let logItems = [...logs];
    let logsText = '';
    logItems.forEach(item => {
        let itemText = item;
        if (typeof item === 'object') {
            itemText = JSON.stringify(item);
        }
        logsText += `${itemText}, `;
    });

    const filename = `logs/${getClientUuid()}_${type}.log`;
    if (logsText) {
        fs.appendFileSync(filename, `\n${logsText}\n`);
    }
}

const clientCallback = {};

clientCallback.onError = error => {
    appendLogs('client', `clientCallback: onError:`, error);
};

clientCallback.setStatus = newState => {
    appendLogs('client', `clientCallback: setStatus:`, JSON.stringify(newState, null, 2));
};

clientCallback.getVoice = () => {
    appendLogs('client', `clientCallback: getVoice:`);
}

clientCallback.onEnd = () => {
    appendLogs('client', `clientCallback: onEnd:`);
}

clientCallback.addMessage = (type, text, image, background, signal) => {
    appendLogs('client', `clientCallback: addMessage:`, type, text, image, background, signal);
    if (type === 'received') {
        console.log(`${text}:\n`);
        ask(`>`);
    }
};

clientCallback.handleCommand = (command, code) => {
    appendLogs('client', `clientCallback: handleCommand:`, command, code);
};

clientCallback.play = (sound) => {
    appendLogs('client', `clientCallback: play:`, sound);
};

clientCallback.getUUID = () => {
    appendLogs('client', `clientCallback: getUUID: ${getClientUuid()}`);
    return getClientUuid()
};

clientCallback.getAttributes = () => {
    appendLogs('client', `clientCallback: getAttributes:`);
    return {};
};

clientCallback.addLogs = (logs) => {
    const logsText = JSON.stringify(logs, null, 2);
    appendLogs('flowstorm', logsText);
};

clientCallback.addDebugLogs = (type, ...logs) => {
    const logsText = JSON.stringify(logs, null, 2);
    appendLogs('debug', `${type} -> ${logsText}`);
};

const bot = Bot(
    'https://core.flowstorm.ai',
    'sender',
    true,       // autostart
    clientCallback,
    false,      // called from Kotlin
    undefined   // JWT token identifying the user. If undefined, the conversation will start in anonymous mode
);

try {
    bot.init(
        botId,       // flowstorm botId
        'en',        // language
        false,       // input audio
        false,       // output audio
        '#intro',    // starting message
        true,        // mask signals
        ['error'],   // allowed sounds
        false,       // save session
    );
} catch (error) {
    appendLogs('error', error);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (prompt) => {
    rl.question(prompt, function (input) {
        // const messageData = input;
        try {
            if (input === 'bye' || input === 'quit') {
                process.exit(0);
            } else {
                bot.handleOnTextInput(input);
            }
        } catch (error) {
            appendLogs('error', error);
            process.exit(1);
        }
    });
}
