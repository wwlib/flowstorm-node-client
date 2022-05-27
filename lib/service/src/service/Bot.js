import ChannelService from './ChannelService.js';

export default function Bot(url, deviceId, autoStart, clientCallback, fromKotlin = true, ttsFileType = 'mp3') {
	class BotInterface {}
	let service = null;
	let receivedRecords = [];
	let maskSignals = true;
	let saveSession = false;
	let startMessage = '#intro';
	let key = undefined;
	let language = 'en';
	let userToken = undefined;

	const bot = fromKotlin ? this : new BotInterface();
	bot.botCallback = clientCallback;
	bot.sessionEnded = false;
	let lastResponseEmpty = false;
	let sleepTimeLimit = 0;
	let queueRunning = false;
	let queueWaiting = false;

	let startTime = 0;
	let turnLogs = [];
	let lastSttResult = '';

	let senderId = deviceId;
	if (deviceId === undefined && typeof window.localStorage !== 'undefined') {
		if (localStorage.getItem('sender') === null) {
			senderId = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
			localStorage.setItem('sender', senderId);
		} else {
			senderId = localStorage.getItem('sender');
		}
	}

	bot.pause = () => {
		setClientStatus('PAUSED');
	};

	bot.resume = () => {
		setClientStatus('RESPONDING');
			skipPlayedMessages();
			setClientStatus('LISTENING');
	};

	bot.init = function(
		appKey,
		lang,
		defaultInputAudio,
		defaultOutputAudio,
		startingMessage = '#intro',
		mask = true,
        sounds = ['error'],
		save = false,
		token = undefined,
	) {
		key = appKey;
		language = lang;
		startMessage = startingMessage;
		maskSignals = mask;
		saveSession = save;
	    userToken = token;

		if (sleepTimeLimit < getCurrentMillis() || sleepTimeLimit === 0) {
			return initialize();
		} else {
			sleepTimeLimit = 0;
			service
				.sendText(startMessage)
				.then(_ => {
				    startTime = getCurrentMillis();
                    addSentMessage(startMessage);
					return this;
				})
				.catch(error => {
					initialize();
				});
		}
	};

	function initialize() {
		sleepTimeLimit = 0;
		startTime = getCurrentMillis();

		const endpoint = '/socket/';
		service = new ChannelService(
			undefined, // new BrowserFeatures(),
			url.replace('http', 'ws') + endpoint,
			onMessage,
			errorCallback,
			key,
			language,
			senderId,
			bot,
			userToken,
			ttsFileType
		);

		clientCallback.addDebugLogs('Bot', 'init');
		addLog('INFO', 'Bot init');

		service
			.open()
			.then(() => {})
			.catch(error => {
				errorCallback({ type: 'Client', message: `Error opening socket:  ${error}` });
			});
		return this;
	}

	function addLog(level, text) {
	    const time = new Date();
	    const relativeTime = (getCurrentMillis() - startTime) / 1000;
	    turnLogs.push({time, relativeTime, level, text});
	}

	function setClientStatus(status) {
        addLog('INFO', 'Client status changed to ' + status);
	    clientCallback.setStatus({ 'status': status });
	}

	function errorCallback(err) {
		addLog('ERROR', err.message);
        service.sendLogs(turnLogs);
        turnLogs = [];
        clientCallback.onError(err);
		bot.onStopClick();
		clientCallback.onEnd();
	}

	function isNotNil(param) {
		return param !== null && param;
	}

	bot.addRecord = function() {
		if (isNotNil(receivedRecords) && receivedRecords.length > 0) {
			const [head, ...tail] = receivedRecords;
			const { audio, image, text, background, video, code, nodeId } = head;

			// const bulkMessages = filter(isNotNil, [text, image]);

			if (clientCallback.focusOnNode && nodeId !== 0) clientCallback.focusOnNode(nodeId);
			if (video){
			    clientCallback.addVideo(video, function () {
			        receivedRecords = tail;
			    });
			} else {
                receivedRecords = tail;
			    if (text.startsWith('#')){
                    clientCallback.handleCommand(text, code);
                    // TODO rework to be more general
                    if (text !== '#walk')
                        bot.addRecord();
			    } else {
                    clientCallback.addMessage('received', text, image, background);
			    }
			}

		} else if (!queueRunning) {
			if (service.sessionId && sleepTimeLimit === 0) {

			} else {
				if (bot.sessionEnded || sleepTimeLimit !== 0) {
					clientCallback.onEnd();
				}
				clientCallback.setStatus({ isActive: true, status: 'SLEEPING' });
			}
			receivedRecords = undefined;
		} else {
		    queueWaiting = true;
		}
	}

	const itemMap = ({ audio, image, text, ssml, background, video, code, nodeId }) => ({
        audio: isNotNil(audio)
            ? audio.startsWith('/')
                ? `${url}${audio}`
                : audio
            : isNotNil(ssml)
            ? ssml.includes('<audio')
                ? ssml.split('"')[1]
                : null
            : null,
        image: isNotNil(image) ? (image.startsWith('/') ? `${url}${image}` : image) : null,
        video: isNotNil(video) ? video : null,
        text: isNotNil(text) ? text : '',
        background: isNotNil(background) ? (background.length === 0 ? null : background) : null,
        code: isNotNil(code) ? (code.length === 0 ? '{}' : code) : '{}',
        nodeId: isNotNil(nodeId) ? nodeId : 0,
    })

	function onMessage(param) {
		const paramResponse = param.response;
		const items = paramResponse === undefined ? [] : paramResponse.items;
		addLog('INFO', 'Received event ' + param.type);
		switch (param.type) {
		    case 'ResponseItem':
				setClientStatus('RESPONDING');
		        stopWaitSound();
                const record = itemMap(param.responseItem);
                if (receivedRecords === undefined) {
                    receivedRecords = [];
                }
                receivedRecords.push(record);
                if (!queueRunning || queueWaiting) {
                    queueWaiting = false;
                    queueRunning = true;
                    bot.addRecord();
                }
                break;
			case 'Response':
				setClientStatus('RESPONDING');
				// TODO remove
				stopWaitSound();
				service.language = paramResponse.locale;
				lastResponseEmpty = items.length === 0;
				if (paramResponse.sleepTimeout > 0) {
					sleepTimeLimit = getCurrentMillis() + paramResponse.sleepTimeout * 1000;
				}
				const records = items.map(itemMap);
                if (receivedRecords !== undefined) {
				    receivedRecords = receivedRecords.concat(records);
                } else {
                    receivedRecords = records;
                }
				clientCallback.addLogs(paramResponse.logs);
                if (!queueRunning || queueWaiting) {
                    queueRunning = false;
                    queueWaiting = false;
                    bot.addRecord();
                } else {
                    queueRunning = false;
                }
				break;
			case 'Recognized':
				// Difference between Firefox and Chrome
				const recognizedItems = param.message === undefined ? [param] : param.message.items;
				const recognizedItem = recognizedItems[0];
				// const bulkMessages = transformIncomingMessages(recognizedItems);
				if (recognizedItem.text.length > lastSttResult.length || recognizedItem.isFinal) {
				    lastSttResult = recognizedItem.text;
			        addSentMessage(recognizedItem.text);
                }
			    startTime = getCurrentMillis();
				if (recognizedItem.isFinal) {
				    lastSttResult = '';
                    setClientStatus('PROCESSING');
				}
				break;
			case 'Ready':
				service.setSessionId(clientCallback.getUUID());
				bot.sessionEnded = false;
				if (autoStart) {
					addSentMessage(startMessage);
					service.sendText(startMessage);
					startTime = getCurrentMillis();
				} else {
					clientCallback.play('bot_ready');
				}
				break;
			case 'InputAudioStreamOpen':
				// clientCallback.setStatus({ inputDisabled: false, status: 'LISTENING'});
				setClientStatus('LISTENING');
				break;
			case 'SessionStarted':
				const sessionId = param.sessionId;
                lastSttResult = '';
				service.setSessionId(sessionId);
				setClientStatus('RESPONDING');
				break;
			case 'Error':
                clientCallback.onError({ type: 'Server:', message: param.text });
				if (sessionId === null) {
				    break;
				}
			case 'SessionEnded':
			    service.sendLogs(turnLogs);
			    turnLogs = [];
			    startTime = 0;
				bot.sessionEnded = true;
				service.setSessionId(null);

					clientCallback.onEnd();
					stopWaitSound();
					setClientStatus('SLEEPING');

				break;
			default:
				break;
		}
	}

	bot.handleOnTextInput = (text, audioOn) => {
		skipPlayedMessages();
		sleepTimeLimit = 0;
		addSentMessage(text, null);
		setClientStatus('PROCESSING');
		service.sendText(text)
			.then(() => {

			})
			.catch(error => {
				clientCallback.addDebugLogs('error', error);
			});
		startTime = getCurrentMillis();
	};

	function skipPlayedMessages() {
			if (isNotNil(receivedRecords) && receivedRecords.length > 0) {
				receivedRecords.forEach(message => {
					clientCallback.addMessage('received', message.text, message.image, message.background);
				});

				receivedRecords = undefined;
			}
	}

	bot.onStopClick = () => {
		bot.sessionEnded = true;
		stopWaitSound();
		if (service) {
			service.setSessionId(null);
			service.close();
		}
		sleepTimeLimit = 0;
		setClientStatus('SLEEPING');
	};

	function stopWaitSound() {
		clientCallback.addDebugLogs('Bot', `stopWaitSound`);
	}

	function getCurrentMillis() {
		const date = new Date();
		return date.getTime();
	}

	function addSentMessage(messageText) {
	    const text = messageText.charAt(0) === '#' && maskSignals ? null : messageText;
	   	const signal = messageText
        clientCallback.addMessage('sent', text, null, null, signal);
	}

	return bot;
}
