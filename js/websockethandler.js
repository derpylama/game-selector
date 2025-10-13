const WebSocket = require('ws');

class LobbyClient {
    constructor(url) {
        this.url = url;
        this.socket = null;
        this.actionHandlers = {}; // action -> handler function
    }

    connect() {
        this.socket = new WebSocket(this.url);

        this.socket.on('open', () => {
            console.log('WebSocket connection established');
        });

        this.socket.on('message', (data) => {
            let message;
            try {
                message = JSON.parse(data.toString());
            } catch (err) {
                console.error('Invalid JSON message:', data.toString());
                return;
            }

            const { action, payload } = message;

            switch (action) {
                case 'lobby_created':
                    console.log('Lobby created with ID:', payload);
                    break;
                case 'lobby_joined':
                    console.log('Joined lobby with ID:', payload);
                    break;
                case 'lobby_update':
                    console.log('Lobby update:', payload);
                    break;
                case 'error':
                    console.error('Error from server:', payload);
                    break;
                

            }
        });

        this.socket.on('close', () => {
            console.log('WebSocket connection closed');
        });

        this.socket.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    }

    // Register a handler for a specific action
    onAction(action, handler) {
        this.actionHandlers[action] = handler;
    }

    // Send a JSON message with action + payload
    sendAction(action, payload) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ action, payload }));
        } else {
            console.error('WebSocket is not open. Cannot send message.');
        }
    }

    sendMessage(message) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(message);
        } else {
            console.error('WebSocket is not open. Cannot send message.');
        }
    }
}

module.exports = LobbyClient;