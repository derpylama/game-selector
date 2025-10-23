const WebSocket = require('ws');
const { ipcMain, BrowserWindow } = require("electron")

class LobbyClient {
    constructor(url, username) {
        this.url = url;
        this.socket = null;
        this.actionHandlers = {}; // action -> handler function
        this.lobbyId = null;
        this.lobbyName = null;
        this.username = username;
        
    }


    connect(gamesList) {
        this.socket = new WebSocket(this.url);

        this.socket.on('open', () => {
            console.log('WebSocket connection established');
            this.sendAction('set_user_data', { username: this.username, games: gamesList });
            
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
                    this.lobbyId = payload.lobbyId;
                    this.lobbyName = payload.lobbyName;

                    // Wait for connection to be open before joining
                    if (this.socket.readyState === WebSocket.OPEN) {
                        this.sendAction('join_lobby', { lobbyId: this.lobbyId, lobbyName: this.lobbyName, members: payload.lobbyMembers });
                    } else {
                        this.socket.once('open', () => {
                            this.sendAction('join_lobby', { lobbyId: this.lobbyId, lobbyName: this.lobbyName, members: payload.lobbyMembers });
                            
                        });
                    }
                    break;
                case 'lobby_joined':
                    console.log('Joined lobby with ID:', payload);
                    this.lobbyId = payload.lobbyId;
                    this.lobbyName = payload.lobbyName;

                    this.notifyRenderer('update-lobby-info', { lobbyId: this.lobbyId, lobbyName: this.lobbyName, members: payload.lobbyMembers  });
                    break;
                case 'lobby_update':
                    console.log('Lobby update:');

                    if("steam" in payload){
                        this.notifyRenderer("update-lobby-games", payload)
                    }
                    break;
                case 'lobby_left':
                    console.log('Left lobby:', payload);
                    break;
                case 'username_set':
                    console.log('Username set to:', payload);
                    this.notifyRenderer('connected-to-server', payload.username)
                    break;
                case 'error':
                    console.error('Error from server:', payload);
                    break;
                default:
                    if (this.actionHandlers[action]) {
                        this.actionHandlers[action](payload);
                    } else {
                        console.warn('No handler for action:', action);
                    }
                
                

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

    getLobbyInfo() {
        return { lobbyId: this.lobbyId, lobbyName: this.lobbyName }; 
    }   

    notifyRenderer(channel, data) {
        for (const window of BrowserWindow.getAllWindows()) {
            window.webContents.send(channel, data);
        }

    }
}

module.exports = LobbyClient;