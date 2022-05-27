import WebSocket from 'ws';

const dateTimeFormat = Intl.DateTimeFormat;

export default class ChannelService {
	constructor(
		features,
		wsUrl,
		callback,
		errorCallback,
		key,
		language = 'cs-CZ',
		deviceId,
		bot,
		token,
		ttsFileType
	) {
		this.wsUrl = wsUrl;
		this.key = key;
		this.callback = callback;
		this.errorCallback = errorCallback;
		this.language = language;
		this.muted = false;
		this.deviceId = deviceId;
		this.bot = bot;
		this.token = token;
		this.ttsFileType = ttsFileType;

		// TODO move elsewhere
		this.voices = {
			George: 'en',
			Grace: 'en',
			Gordon: 'en',
			Gwyneth: 'en',
			Gabriela: 'cs',
			Anthony: 'en',
			Audrey: 'en',
			Arthur: 'en',
			Amy: 'en',
			Michael: 'en',
			Mary: 'en',
			Milan: 'cs',
			Victor: 'en',
			Victoria: 'en',
		};
	}

	open = async () => {
		this.webSocket = new WebSocket(this.wsUrl);

		const voice = this.bot.botCallback.getVoice();
		const locale = voice === undefined ? this.language : this.voices[voice];

		// listen to onmessage event
		this.webSocket.onmessage = e => {
			if (e.data instanceof ArrayBuffer) {
				this.bot.clientCallback.addDebugLogs('ChannelService', `this.webSocket.onmessage: received Arraybuffer`);
			} else if (typeof e.data === 'string') {
				const data = JSON.parse(e.data);
				this.callback(data);
			}
		};

		this.webSocket.onerror = e => {
			this.errorCallback({ type: 'Client', message: `Socket error:  ${e}` });
		};

		this.webSocket.onclose = e => {
            // console.log('Reason for websocket closing: ', e.reason);
			this.bot.clientCallback.addDebugLogs(`ChannelService`, 'Reason for websocket closing: ', e.reason)
        };

		return new Promise(resolve => {
			this.webSocket.onopen = () => {
                this.sendPing(this);
				this.webSocket.send(
					JSON.stringify({
						type: 'Init',
						key: this.key,
						appKey: this.key,
						deviceId: this.deviceId,
						sender: this.deviceId,
						token: this.token,
						config: {
							tts: 'RequiredLinks',
							sttSampleRate: 44100,
							ttsFileType: this.ttsFileType,
							locale,
							zoneId: dateTimeFormat().resolvedOptions().timeZone,
							voice,
							sendResponseItems: true,
							sttInterimResults: true,
						},
					})
				);
				resolve();
			};
		});
	};

	sendPing = (service) => {
	    setTimeout( // window.setTimeont(
	        function() {
	            if (service.webSocket && service.sessionId !== null) {
	                service.webSocket.send(new Int16Array());
	                service.sendPing(service);
	            }
            },
	        10000);
	}

	close = async () => {
		if (this.webSocket) {
			this.webSocket.close();
			this.webSocket = null;
		}
		return Promise.resolve();
	};

	sendText = async text => {
		const input = {
            zoneId: dateTimeFormat().resolvedOptions().timeZone,
            locale: this.language,
            attributes: this.bot.botCallback.getAttributes(),
            transcript: {
                text
            }
        };
		if (this.webSocket) {
			if (this.webSocket.readyState === 1) {
				this.webSocket.send(JSON.stringify({ type: 'Input', input }));
				return Promise.resolve();
			} else {
				return Promise.reject('Incorrect websocket state');
			}
		} else {
			return Promise.reject('websocket in undefined');
		}
	};

	sendLogs = (entries) => {
	    if (this.webSocket) {
            this.webSocket.send(JSON.stringify({ type: 'Log', entries }));
	    }
	}

	setSessionId = sessionId => {
		this.sessionId = sessionId;
	};
}
